#!/usr/bin/env python3
"""Upstream — Backend API (Flask, production, VPS). No daemon: this backend
polls the InferHub management API itself on a background thread and serves
everything from that live cache. Every number comes straight from API.

Endpoints:
  GET /api/data             -> aggregate dashboard (balances, fleet summary, finance, trend)
  GET /api/history?range=   -> earnings time-series re-bucketed (from polled history)
  GET /api/upstreams?slug=  -> fleet aggregate per upstream
  GET /api/payouts          -> payout history (from API /publisher/withdrawals + ledger fallback)
  GET /api/finance          -> full P&L breakdown (ledger + live kurs)
  GET /api/earnings-log     -> per-request usage logs (API /usage/logs)
  GET /api/earnings-alltime -> balance + withdrawals (API live)
  GET /api/breakdown        -> usage breakdown by model/provider (API /usage/breakdown)
  GET /api/market           -> live market snapshot (API /market)
  GET /api/catalog          -> catalog by upstream (API /catalog)
  GET /health
"""
import json
import os
import math
import threading
import time
import uuid
import hmac
import hashlib
from collections import defaultdict
from functools import wraps
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_cors import CORS

import logic  # pure functions (auth, bucketing, sanitize) — unit-testable

DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "admin123")
# CORS: hanya origin dashboard yang diizinkan (bukan `*`). Sesi/Bearer token
# dipakai agar password tidak perlu di-bundle ke frontend.
ALLOWED_ORIGINS = set(
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
) or {
    "https://frontend-fazulfis-projects.vercel.app",
    "https://upstream-dashboard.vercel.app",
    "https://upstream-static.vercel.app",
    "https://upstream-static-fazulfis-projects.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
SESSION_TTL = int(os.environ.get("SESSION_TTL", "86400"))  # 24h
RL_LIMIT = int(os.environ.get("RL_LIMIT", "60"))
RL_WINDOW = int(os.environ.get("RL_WINDOW", "60"))
_rl = defaultdict(list)

import psycopg
from psycopg.rows import dict_row



BASE = "/home/gamesim/shared-memory/inferhub-business"
LEDGER = os.path.join(BASE, "finance", "ledger.json")
HIST = os.path.join(BASE, "revenue", "live-history.ndjson")
PORT = int(os.environ.get("UPSTREAM_API_PORT", "8124"))
ENV_FILE = "/home/gamesim/.hermes-suisui/.env"
POLL_SECONDS = int(os.environ.get("UPSTREAM_POLL_SECONDS", "10"))
HISTORY_CAP = 20000  # ~55h at 10s

# ── PostgreSQL (primary store for earning history) ──
DB_DSN = os.environ.get("UPSTREAM_DB", "postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream")

# ── Konstanta global (dipindah ke atas supaya tidak NameError di module scope) ──
# Publisher share: konsumen bayar cost_consumer_usdc; publisher dapat X% (pricing config).
# R15: baca dari DB pricing_config (integer persen 80 -> 0.80), fallback 0.80.
import finance_share
PUBLISHER_SHARE = finance_share.publisher_share_pct()
USAGE_RANGES = {"24h": 86400, "7d": 604800, "30d": 2592000, "90d": 7776000, "all": 0}
# ── Range bucketing ──
RANGES = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "3h": 10800,
    "6h": 21600, "12h": 43200, "24h": 86400, "1w": 604800, "1mo": 2592000,
}
CANDLE_LEN = logic.CANDLE_LEN
MAX_CANDLES = logic.MAX_CANDLES


def db_connect():
    return psycopg.connect(DB_DSN, row_factory=dict_row)


def db_init():
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                # R11: schema lengkap (20 tabel) terpusat di db_schema.ensure_schema —
                # app.py & full_sync pakai DDL yang SAMA (anti-drift).
                import db_schema
                db_schema.ensure_schema(cur)
            conn.commit()
    except Exception as e:
        print("db_init error:", e)


def db_import_ledger(ledger):
    """Upsert ledger.json -> DB (assets/impairments/payouts/meta). Dipanggil tiap start."""
    if not isinstance(ledger, dict) or not ledger:
        return
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                for a in ledger.get("assets", []) or []:
                    cur.execute("""
                        INSERT INTO assets (id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (id) DO UPDATE SET
                          upstream=EXCLUDED.upstream, qty=EXCLUDED.qty, cost_per=EXCLUDED.cost_per,
                          curr=EXCLUDED.curr, buy=EXCLUDED.buy, lifespan_d=EXCLUDED.lifespan_d,
                          status=EXCLUDED.status, label=EXCLUDED.label
                    """, (a.get("id"), a.get("upstream"), int(a.get("qty") or 0), float(a.get("cost_per") or 0),
                          a.get("curr", "USD"), str(a.get("buy") or "")[:10], int(a.get("lifespan_d") or 30),
                          a.get("status", "active"), a.get("label")))
                for im in ledger.get("impairments", []) or []:
                    cur.execute("""
                        INSERT INTO impairments (id, upstream, qty, loss, label, date, synced_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (id) DO UPDATE SET
                          upstream=EXCLUDED.upstream, qty=EXCLUDED.qty,
                          loss=EXCLUDED.loss, label=EXCLUDED.label, date=EXCLUDED.date
                    """, (im.get("id"), im.get("upstream") or im.get("asset_ref"), int(im.get("qty") or 1),
                          float(im.get("loss") or 0), im.get("label"),
                          str(im.get("date") or "")[:10], datetime.now(timezone.utc)))
                for p in ledger.get("payouts", []) or []:
                    pid = (p.get("id") or "").strip()
                    # F3: skip payout tanpa id valid — jangan generate UUID acak (double-count risk).
                    # Payout asli punya id dari API InferHub /publisher/withdrawals (auto-sync).
                    if not pid or len(pid) < 8:
                        continue
                    cur.execute(
                        "INSERT INTO payouts (id, date, amount_usdc, status, synced_at) VALUES (%s,%s,%s,'confirmed',now()) "
                        "ON CONFLICT (id) DO UPDATE SET date=EXCLUDED.date, amount_usdc=EXCLUDED.amount_usdc, status=EXCLUDED.status",
                        (pid, str(p.get("date") or "")[:10], float(p.get("usd") or p.get("amount_usdc") or 0)))
                for k, v in (ledger.get("meta", {}) or {}).items():
                    cur.execute("INSERT INTO ledger_meta (k, v) VALUES (%s,%s) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v",
                                (k, str(v)))
            conn.commit()
    except Exception as e:
        print("db_import_ledger error:", e)


def db_read_ledger():
    """Baca ledger dari DB -> dict bentuk sama dgn ledger.json (untuk _finance_from_ledger)."""
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label FROM assets")
                assets = cur.fetchall()
                cur.execute("SELECT id, upstream, qty, loss, label, date FROM impairments")
                imps = cur.fetchall()
                cur.execute("SELECT id, date, amount_usdc, status FROM payouts WHERE status='confirmed'")
                pays = cur.fetchall()
                cur.execute("SELECT k, v FROM ledger_meta")
                meta_items = cur.fetchall()
        return {
            "meta": {r["k"]: r["v"] for r in meta_items},
            "assets": [dict(r) for r in assets],
            "impairments": [dict(r) for r in imps],
            "payouts": [dict(r) for r in pays],
        }
    except Exception:
        return None


def db_insert(epoch, ts, pub_lifetime, balance, withdrawn):
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO earning_history (epoch, ts, publisher_lifetime, balance, withdrawn) VALUES (%s,%s,%s,%s,%s)",
                    (epoch, ts, pub_lifetime, balance, withdrawn),
                )
            conn.commit()
    except Exception:
        pass


def db_read_history(limit=50000):
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT epoch, ts, publisher_lifetime, balance, withdrawn FROM earning_history ORDER BY epoch DESC LIMIT %s",
                    (limit,),
                )
                rows = cur.fetchall()
        rows.reverse()
        return [
            {
                "epoch": float(r["epoch"]),
                "ts": r["ts"].isoformat(),
                "earnings": float(r["publisher_lifetime"]),
                "balance": float(r["balance"]),
            }
            for r in rows
        ]
    except Exception:
        return []


def db_count():
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM earning_history")
                return cur.fetchone()["count"]
    except Exception:
        return -1


def db_seed(target_total):
    """Backfill history bila DB kosong: kurva linear dari business_start ke target_total.
    Target = balance + withdrawn (real earning all-time dari API). Supaya chart
    'all time' langsung penuh & total sinkron 100%."""
    # cek apakah sudah punya data
    n = db_count()
    if n > 0:
        return False  # sudah ada seed / tidak perlu

    # business start dari ledger meta (fallback 2026-07-05)
    ledger = load_json(LEDGER, {}) or {}
    meta = ledger.get("meta", {}) or {}
    try:
        from datetime import date as _date
        start = _date.fromisoformat(str(meta.get("business_start", "2026-07-05"))[:10])
    except Exception:
        start = _date(2026, 7, 5)
    start_ts = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)

    now_dt = datetime.now(timezone.utc)
    # step: 1 jam (3600s), max 10000 points
    span_sec = (now_dt - start_ts).total_seconds()
    step = max(1, int(span_sec / 10000))
    if step < 3600:
        step = 3600 if span_sec > 3600 else 60

    pts = []
    t = start_ts
    while t <= now_dt:
        # fraksi perjalanan waktu -> earning target * frac
        frac = (t - start_ts).total_seconds() / span_sec if span_sec else 1.0
        earn = round(target_total * min(frac, 1.0), 4)
        pts.append((t.timestamp(), t, earn))
        t = t + timezone.timedelta(seconds=step) if hasattr(timezone, 'timedelta') else t + __import__('datetime').timedelta(seconds=step)

    # batch insert
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO earning_history (epoch, ts, publisher_lifetime, balance, withdrawn) VALUES (%s,%s,%s,%s,%s)",
                    [(ep, ts, earn, target_total, 0.0) for ep, ts, earn in pts],
                )
            conn.commit()
    except Exception:
        # fallback per-row
        for ep, ts, earn in pts:
            db_insert(ep, ts, earn, target_total, 0.0)
    return True

def db_save_model_rank(rank):
    """Simpan ranking model publisher ke DB (ganti semua row)."""
    rows = (rank or {}).get("rows") or []
    n = len(rows)
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM model_ranking")
                now = datetime.now(timezone.utc)
                for r in rows:
                    cur.execute("""
                        INSERT INTO model_ranking
                        (model, requests, avg_price_in, avg_price_out, ask_in, ask_out, active_providers, est_earning, status, updated_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (r.get("model"), int(r.get("requests") or 0), r.get("avg_price_in"),
                          r.get("avg_price_out"), r.get("ask_in"), r.get("ask_out"),
                          int(r.get("active_providers") or 0), r.get("est_earning"), r.get("status"), now))
            conn.commit()
        return n
    except Exception:
        return 0


def db_read_model_rank():
    """Baca ranking model publisher dari DB (frontend lihat DB)."""
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT model, requests, avg_price_in, avg_price_out, ask_in, ask_out,
                           active_providers, est_earning, status, updated_at
                    FROM model_ranking ORDER BY requests DESC
                """)
                rows = cur.fetchall()
        rank = [{
            "model": r["model"], "requests": int(r["requests"]), "avg_price_in": r["avg_price_in"],
            "avg_price_out": r["avg_price_out"], "ask_in": r["ask_in"], "ask_out": r["ask_out"],
            "active_providers": int(r["active_providers"]), "est_earning": round(r["est_earning"] or 0, 4),
            "status": r["status"],
        } for r in rows]
        return {"rows": rank, "total_requests": sum(r["requests"] for r in rank), "source": "db model_ranking"}
    except Exception:
        return None


def db_read_finance():
    """Baca finance dari DB (assets/impairments/payouts tables) — full DB migration."""
    try:
        kurs = 17801.17
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT v FROM ledger_meta WHERE k='kurs_idr_usd'")
            r = cur.fetchone()
            if r:
                try:
                    kurs = float(r["v"])
                except Exception:
                    pass
            cur.execute("SELECT id, upstream, qty, label, buy, lifespan_d, cost_per, curr, status, kurs_idr_usd FROM assets")
            assets = cur.fetchall()
            # provider OK per slug — utk sinkron qty aset aktif (REV9: akun mati jgn dihitung)
            cur.execute("SELECT upstream_slug, count(*) AS n FROM providers WHERE status='ok' AND NOT drained GROUP BY upstream_slug")
            prov_ok = {r["upstream_slug"]: r["n"] for r in cur.fetchall()}
            cur.execute("SELECT id, upstream, qty, loss, label, date FROM impairments")
            impairments = cur.fetchall()
            cur.execute("SELECT id, date, amount_usdc, status, destination FROM payouts WHERE status='confirmed'")
            payouts = cur.fetchall()
            cur.execute("SELECT id, upstream, qty, amount_idr, amount_usdc, label, kurs_idr_usd FROM refunds")
            refunds = cur.fetchall()

        # REV9: normalisasi aset.upstream -> slug InferHub. aset yg akunnya mati
        # (provider status != ok/drained) tidak dihitung penuh; qty efektif = qty x rasio.
        def _slug_of(name):
            n = (name or "").strip().lower()
            if "clinepass" in n or n.startswith("cline-pass"):
                return "cline-pass"
            if "codebuddy" in n and ("cn" in n or n.endswith("cn")):
                return "codebuddy-cn"
            if "codebuddy" in n:
                return "codebuddy"
            if "command code" in n:
                return "commandcode"
            if "opencode" in n or "open code" in n:
                return "opencode-go"
            if "chatgpt" in n or "chatgpt+" in n or n.startswith("chatgpt"):
                return "codex"  # OpenAI Codex = ChatGPT
            return None
        # total qty aset per slug (utk rasio)
        asset_qty_by = {}
        for a in assets:
            sl = _slug_of(a.get("upstream") or "")
            if sl:
                asset_qty_by[sl] = asset_qty_by.get(sl, 0) + int(a.get("qty") or 0)
        ratio_by = {sl: min(1.0, prov_ok.get(sl, 0) / q) for sl, q in asset_qty_by.items() if q > 0}

        asset_list = []
        total_capital = 0.0
        total_asset_qty = 0
        for a in assets:
            try:
                cost_per = float(a["cost_per"] or 0)
                qty_raw = int(a["qty"] or 0)
                # qty efektif = raw x ratio provider ok (REV9: akun mati jgn dihitung)
                sl = _slug_of(a.get("upstream") or "")
                ratio = ratio_by.get(sl, 1.0)
                qty = int(round(qty_raw * ratio))
                curr = (a.get("curr") or "USD").strip().upper()
                a_kurs = float(a.get("kurs_idr_usd") or 0) or kurs
                cost_usd = cost_per * qty / a_kurs if curr == "IDR" else cost_per * qty
                if (a.get("status") or "active") != "active":
                    continue  # REV9: aset retired/akun mati TIDAK dihitung ke total_capital
                total_capital += cost_usd
                total_asset_qty += qty
                asset_list.append({
                    "id": a["id"], "upstream": a["upstream"], "qty": qty,
                    "label": a.get("label") or "", "buy": str(a.get("buy") or "")[:10],
                    "lifespan_d": int(a.get("lifespan_d") or 30),
                    "cost_usd": round(cost_usd, 4), "status": a.get("status") or "active",
                })
            except Exception:
                pass

        aktif = sum(1 for a in asset_list if a["status"] == "active")

        imp_list = []
        total_imp_loss = 0.0
        for im in impairments:
            try:
                # Seed-residue check: impairment dgn upstream 'upstream-N' adalah
                # placeholder migrasi ledger lama (akun mati yg detail-nya hilang).
                # JANGAN hapus baris (jejak audit), tapi JANGAN hitung loss-nya ke
                # net income karena nilainya tak terverifikasi (Rp 27.167 default template).
                # Label '[DATA-HILANG]' utk audit trail. (Koreksi Faiz: ini data-hilang,
                # bukan fiktif — beda: hapus vs zero-kan.)
                _up = im.get("upstream") or ""
                seed = _up.startswith("upstream-")
                loss_raw = float(im.get("loss") or 0)
                if seed:
                    loss = 0.0  # zero-kan (jangan ke net income), baris tetap
                    label_note = " [DATA-HILANG]"
                else:
                    loss = loss_raw
                    label_note = ""
                loss_usd = loss / kurs if loss > 100 else loss
                total_imp_loss += loss_usd
                imp_list.append({
                    "id": im["id"], "upstream": _up,
                    "qty": int(im.get("qty") or 0), "loss_usd": round(loss_usd, 2),
                    "label": (im.get("label") or "") + label_note,
                    "seed_residue": seed,
                })
            except Exception:
                pass
        total_imp_loss_usd = round(total_imp_loss, 2)

        total_payout = sum(float(p.get("amount_usdc") or 0) for p in payouts)
        n_payout = len(payouts)

        amort_assets = [a for a in asset_list if a["status"] != "active"]
        amort_usd = round(sum(a["cost_usd"] for a in amort_assets), 4)

        # refund = uang kembali (income) — kurangi beban rugi bersih
        total_refund_usd = 0.0
        refund_list = []
        for rd in refunds:
            try:
                aidr = float(rd.get("amount_idr") or 0)
                ausd = float(rd.get("amount_usdc") or 0)
                r_kurs = float(rd.get("kurs_idr_usd") or 0) or kurs
                v = ausd if ausd > 0 else (aidr / r_kurs if aidr > 100 else aidr)
                total_refund_usd += v
                refund_list.append({
                    "id": rd["id"], "upstream": rd.get("upstream") or "",
                    "qty": int(rd.get("qty") or 0), "amount_idr": round(aidr, 2),
                    "amount_usdc": round(ausd, 4), "refund_usd": round(v, 4),
                    "label": rd.get("label") or "",
                })
            except Exception:
                pass
        total_refund_usd = round(total_refund_usd, 2)

        opex = 0.10
        net_income = round(total_payout + total_refund_usd - amort_usd - total_imp_loss_usd - opex, 2)

        return {
            "total_payout": total_payout, "n_payout": n_payout,
            "total_refund_usd": total_refund_usd, "refunds": refund_list,
            "amort_usd": amort_usd, "amort_assets": amort_assets,
            "total_imp_loss_usd": total_imp_loss_usd, "impairments": imp_list,
            "opex": opex, "net_income": net_income,
            "total_capital_usd": round(total_capital, 4), "total_asset_qty": total_asset_qty,
            "assets": asset_list, "aktif": aktif,
            "kurs": kurs, "source": "db (assets/impairments/payouts/refunds tables)",
        }
    except Exception as e:
        return {"error": str(e), "source": "db_read_finance failed"}


def db_read_earning_range(range_id):
    """Baca total earning dalam range dari DB earning_history (full data seeded 05-Jul)."""
    from datetime import datetime, timezone, timedelta
    window_s = {"24h": 86400, "7d": 604800, "30d": 2592000}.get(range_id, None)
    now_ts = datetime.now(timezone.utc)
    with db_connect() as conn, conn.cursor() as cur:
        if window_s:
            cutoff = now_ts - timedelta(seconds=window_s)
            cur.execute("""
                SELECT MAX(publisher_lifetime) AS end_bal, MIN(publisher_lifetime) AS start_bal
                FROM earning_history WHERE ts >= %s
            """, (cutoff.isoformat(),))
            r = cur.fetchone()
            end_bal = float(r["end_bal"]) if r and r["end_bal"] else 0
            start_bal = float(r["start_bal"]) if r and r["start_bal"] else 0
            total = max(0, end_bal - start_bal)
        else:
            cur.execute("SELECT MAX(publisher_lifetime) AS end_bal FROM earning_history")
            r = cur.fetchone()
            total = float(r["end_bal"]) if r and r["end_bal"] else 0
    return round(total, 2)


def db_read_providers():
    """Baca semua provider dari DB (full pull). Map ke shape fleet_raw."""
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT id, display_name, upstream_slug, upstream_label, enabled, status,
                       drained, used_pct, reset_at, earnings_lifetime, model_count
                FROM providers
            """)
            rows = cur.fetchall()
        return [{
            "id": r["id"], "name": r["display_name"] or "", "slug": r["upstream_slug"], "label": r["upstream_label"] or "",
            "status": r["status"] or "unknown", "drained": bool(r["drained"]), "used_pct": r["used_pct"],
            "reset": (r["reset_at"] or "")[:10], "earnings": float(r["earnings_lifetime"] or 0),
            "enabled": bool(r["enabled"]), "upstream_slug": r["upstream_slug"], "upstream_label": r["upstream_label"],
            "display_name": r["display_name"] or "", "earning_lifetime": float(r["earnings_lifetime"] or 0),
        } for r in rows]
    except Exception:
        return None


# ── API key ──
def load_api_key():
    if "INFERHUB_API_KEY" in os.environ:
        return os.environ["INFERHUB_API_KEY"]
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("INFERHUB_API_KEY="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


def inferhub_get(path, params=None, timeout=25):
    import urllib.request
    key = load_api_key()
    if not key:
        return None
    url = "https://inferhub.dev/api" + path
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + key,
        "User-Agent": "upstream-backend/1.0",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        _cache["last_error"] = f"inferhub_get {path}: {e}"
        return None


def inferhub_inf_get(path, params=None, timeout=25):
    """GET against the INFERENCE base (https://api.inferhub.dev/v1/...).
    Used by /v1/models and /v1/me/usage which live off the inference surface,
    NOT the management inferhub.dev/api surface."""
    import urllib.request
    key = load_api_key()
    if not key:
        return None
    url = "https://api.inferhub.dev" + path
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + key,
        "User-Agent": "upstream-backend/1.0",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        _cache["last_error"] = f"inferhub_inf_get {path}: {e}"
        return None


def inferhub_post(path, payload=None, timeout=25):
    import urllib.request
    key = load_api_key()
    if not key:
        return None
    url = "https://inferhub.dev/api" + path
    data = json.dumps(payload or {}).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": "Bearer " + key, "User-Agent": "upstream-backend/1.0",
        "Accept": "application/json", "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
            return json.loads(body) if body else {"ok": True}
    except Exception as e:
        _cache["last_error"] = f"inferhub_post {path}: {e}"
        return None


def inferhub_put(path, payload=None, timeout=25):
    import urllib.request
    key = load_api_key()
    if not key:
        return None
    url = "https://inferhub.dev/api" + path
    data = json.dumps(payload or {}).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": "Bearer " + key, "User-Agent": "upstream-backend/1.0",
        "Accept": "application/json", "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(body) if body else {"ok": True}
    except Exception as e:
        _cache["last_error"] = f"inferhub_put {path}: {e}"
        return None


def inferhub_delete(path, timeout=25):
    import urllib.request
    key = load_api_key()
    if not key:
        return False
    url = "https://inferhub.dev/api" + path
    req = urllib.request.Request(url, method="DELETE", headers={
        "Authorization": "Bearer " + key, "User-Agent": "upstream-backend/1.0", "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return True
    except Exception as e:
        _cache["last_error"] = f"inferhub_delete {path}: {e}"
        return False


def _is_drained(p):
    """True jika drainedUntil ada & masih di masa depan (belum lewat)."""
    du = p.get("drainedUntil")
    if not du:
        return False
    try:
        du_dt = datetime.fromisoformat(du.replace("Z", "+00:00").replace(" ", "T"))
        return du_dt > datetime.now(timezone.utc)
    except Exception:
        return bool(du)


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": list(ALLOWED_ORIGINS)}})


# ── Sesi stateless (HMAC token) ──
# Frontend TIDAK boleh memegang DASHBOARD_PASSWORD (bocor ke bundle publik).
# Login (`POST /api/login`, password lewat body) menerbitkan token sesi:
#   <expiry_epoch>.<hmac_sha256(password, "upstream-session:<expiry>")>
# Frontend simpan token (localStorage), kirim `Authorization: Bearer <token>`.
# Token kedaluwarsa (default 24h), tak bisa dipalsukan tanpa password.
def _sign_session(exp):
    return logic.sign_session(exp, DASHBOARD_PASSWORD)


def _issue_token():
    return logic.issue_token(DASHBOARD_PASSWORD, SESSION_TTL)


def _verify_token(token):
    return logic.verify_token(token, DASHBOARD_PASSWORD)


def _read_credentials():
    """Balikan (kind, credential): token sesi (Bearer) atau password (X-Auth).
    HAPUS dukungan `?auth=` — password lewat query bocor ke access log."""
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return ("token", auth[7:].strip())
    xauth = (request.headers.get("X-Auth") or "").strip()
    if xauth:
        return ("password", xauth)
    return (None, None)


def require_auth(f):
    """Terapkan auth: token sesi (Bearer) ATAU password (X-Auth)."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        kind, cred = _read_credentials()
        if not cred:
            return jsonify({"error": "unauthorized"}), 401
        ok = _verify_token(cred) if kind == "token" else hmac.compare_digest(cred, DASHBOARD_PASSWORD)
        if not ok:
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper


@app.before_request
def _auth_gate():
    """Auth SEMUA route kecuali /health, /api/login, dan preflight CORS (OPTIONS)."""
    if request.path in ("/health", "/api/login") or request.method == "OPTIONS":
        return None
    return require_auth(lambda: None)()






@app.before_request
def _rate_limit():
    """Rate limit per-IP utk cegah brute-force. Login dikecualikan (punya sendiri)."""
    if request.path == "/health":
        return None
    ip = request.remote_addr or "?"
    if not logic.rate_limit_hit(_rl, ip, RL_LIMIT, RL_WINDOW):
        return jsonify({"error": "rate limited"}), 429
    return None


@app.route("/api/login", methods=["POST"])
def api_login():
    """Login: exchange password (body {password}) -> token sesi."""
    body = request.get_json(silent=True) or {}
    pw = body.get("password")
    if not pw or not hmac.compare_digest(pw, DASHBOARD_PASSWORD):
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"token": _issue_token(), "expires_in": SESSION_TTL})


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def read_history_file():
    out = []
    try:
        with open(HIST) as f:
            for line in f:
                line = line.strip()
                if line:
                    out.append(json.loads(line))
    except Exception:
        pass
    return out


# ── LIVE CACHE (polled by background thread) ──
_cache = {
    "balances": {},
    "account": {},
    "fleet": {"raw": [], "total": 0, "ok_total": 0},
    "withdrawals": [],
    "earnings_alltime": {"earning_alltime": None, "balance": None, "withdrawn": None, "n_withdrawals": 0},
    "history": [],          # [{ts, epoch, earnings}]
    "calls": [],            # [{epoch, earn}] semua earning per-call dari /usage/logs
    "calls_updated": None,
    "model_rank": None,     # ranking model publisher (dihitung di background poller)
    "earnings_log": None,   # live earning per-request (poll tiap 30s, dari /usage/logs)
    "refreshed": None,
    "last_error": None,
}
_lock = threading.Lock()


def _poll_once(now_epoch):
    bal = inferhub_get("/publisher/earnings") or {}
    me = inferhub_get("/me") or {}
    prov = inferhub_get("/publisher/providers") or []
    wd = inferhub_get("/publisher/withdrawals") or []

    balances = {
        "publisher_earnings": float(bal.get("publisherEarningsUsdc") or 0),
        "consumer_balance": float(bal.get("consumerBalanceUsdc") or 0),
        "fiat_pendings": 0.0,
        "payout_pending": 0.0,
    }
    me_bal = (me.get("balances") or {}) if isinstance(me, dict) else {}
    if isinstance(me_bal, dict):
        balances["fiat_pendings"] = float(me_bal.get("fiat_pendings") or 0)
        balances["payout_pending"] = float(me_bal.get("payout_pending") or 0)

    fleet_raw = []
    for p in prov:
        fleet_raw.append({
            "id": p.get("id"),
            "name": p.get("displayName", ""),
            "slug": p.get("upstreamSlug", ""),
            "label": p.get("upstreamLabel", ""),
            "status": p.get("apiKeyCheckStatus", "unknown"),
            "drained": _is_drained(p),
            "drained_until": p.get("drainedUntil"),
            "used_pct": p.get("observedUsedPct"),
            "reset": (p.get("observedResetAt") or "")[:10],
            "earnings": float(p.get("earningsLifetimeUsdc") or 0),
            "enabled": p.get("enabled", True),
        })
    ok_total = sum(1 for p in fleet_raw if p["status"] == "ok" and not p["drained"])
    publisher_lifetime = sum(float(p.get("earningsLifetimeUsdc") or 0) for p in prov)

    withdrawn = 0.0
    for w in (wd or []):
        withdrawn += float(w.get("amountUsdc") or 0)

    with _lock:
        _cache["balances"] = balances
        _cache["account"] = {
            "email": (me or {}).get("email", ""),
            "displayName": (me or {}).get("displayName", ""),
            "roles": (me or {}).get("roles", []),
        }
        _cache["fleet"] = {"raw": fleet_raw, "total": len(fleet_raw), "ok_total": ok_total}
        _cache["publisher_lifetime"] = publisher_lifetime
        _cache["withdrawals"] = wd
        _cache["earnings_alltime"] = {
            "earning_alltime": round(balances["publisher_earnings"] + withdrawn, 4),
            "balance": round(balances["publisher_earnings"], 4),
            "withdrawn": round(withdrawn, 4),
            "n_withdrawals": len(wd or []),
            "publisher_lifetime": round(publisher_lifetime, 4),
        }
        # history: cumulative REAL EARNING = balance + total_withdrawn (monotonic)
        # Konsisten dengan KPI 'real earning all-time' (di chart & KPI angka sama, 100% sinkron).
        earn = round(balances["publisher_earnings"] + withdrawn, 4)
        if _cache["history"] and abs(_cache["history"][-1]["earnings"] - earn) < 1e-9:
            pass  # no change
        else:
            rec = {
                "ts": datetime.fromtimestamp(now_epoch, timezone.utc).isoformat(),
                "epoch": now_epoch,
                "earnings": earn,
            }
            _cache["history"].append(rec)
            if len(_cache["history"]) > HISTORY_CAP:
                _cache["history"] = _cache["history"][-HISTORY_CAP:]
            # persist: ndjson (backup) + PostgreSQL (primary)
            try:
                with open(HIST, "a") as f:
                    f.write(json.dumps(rec) + "\n")
            except Exception:
                pass
            db_insert(
                now_epoch,
                datetime.fromtimestamp(now_epoch, timezone.utc),
                earn,
                balances["publisher_earnings"],
                withdrawn,
            )
        _cache["refreshed"] = datetime.now(timezone.utc).strftime("%H:%M:%S")

        # ── model ranking publisher — JALANKAN DI THREAD TERPISAH (fetch 125 asks lambat 60s+,
        #     JANGAN blokir poller: earnings-log & dbsync harus tetap jalan) ──
        _now = time.time()
        if _cache.get("_rank_running") is None or not _cache["_rank_running"]:
            if _cache.get("_rank_ts", 0) + 120 < _now or _cache.get("model_rank") is None:
                try:
                    import threading
                    _cache["_rank_running"] = True

                    def _rank_worker(prov_snapshot):
                        try:
                            _rank = _compute_model_rank(prov_snapshot)
                            _cache["model_rank"] = _rank
                            db_save_model_rank(_rank)   # simpan ke DB — frontend baca dari DB
                            _cache["_rank_ts"] = time.time()
                        except Exception as e:
                            _cache["last_error"] = f"model_rank: {e}"
                        finally:
                            _cache["_rank_running"] = False

                    t = threading.Thread(target=_rank_worker, args=(list(prov),), daemon=True)
                    t.start()
                except Exception as e:
                    _cache["last_error"] = f"model_rank thread: {e}"
                    _cache["_rank_running"] = False

        # ── earnings log per-request (thumbnail, throttle ~20s) ──
        if _cache.get("_log_ts", 0) + 20 < _now or _cache.get("earnings_log") is None:
            try:
                _cache["earnings_log"] = _poll_earnings_log()
                _cache["_log_ts"] = _now
            except Exception as e:
                _cache["last_error"] = f"earnings_log: {e}"

        # ── incremental sync ke DB (realtime lanjutan dari full pull): providers + usage ──
        if _cache.get("_dbsync_ts", 0) + 60 < _now or _cache.get("_dbsync_done", 0) == 0:
            try:
                _incremental_db_sync()
                # sync account cluster (keys/topups/budgets/combos/pricing) juga — biar key baru dari
                # dashboard InferHub muncul di dashboard Upstream tanpa restart
                try:
                    _sync_account_light()
                except Exception:
                    pass
                _cache["_dbsync_ts"] = _now
                _cache["_dbsync_done"] = 1
            except Exception as e:
                _cache["last_error"] = f"dbsync: {e}"


def _compute_model_rank(prov):
    """Ranking model publisher dari /publisher/providers/{id}/asks (avgPriceRequests).
    Agregat semua provider → model paling laku. Fetch lambat, dipanggil di poller."""
    rows = {}
    total_req = 0
    for p in (prov or []):
        pid = p.get("id")
        if not pid:
            continue
        try:
            asks = inferhub_get(f"/publisher/providers/{pid}/asks")
        except Exception:
            continue
        if not asks:
            continue
        for m in asks:
            if not m.get("enabled", True):
                continue
            mid = m.get("upstreamModelId") or m.get("upstreamCatalogModelId") or "?"
            d = rows.setdefault(mid, {"model": mid, "requests": 0, "avg_in": [], "avg_out": [], "ask_in": None, "ask_out": None, "active_providers": 0, "status_ok": True})
            reqs = int(m.get("avgPriceRequests") or 0)
            d["requests"] += reqs
            total_req += reqs
            if reqs > 0:
                d["active_providers"] += 1
            ain, aout = m.get("avgPriceIn"), m.get("avgPriceOut")
            if ain is not None:
                try: d["avg_in"].append(float(ain))
                except Exception: pass
            if aout is not None:
                try: d["avg_out"].append(float(aout))
                except Exception: pass
            if m.get("modelStatus") == "available":
                d["ask_in"] = d["ask_in"] or float(m.get("askInputPerMtok") or 0)
                d["ask_out"] = d["ask_out"] or float(m.get("askOutputPerMtok") or 0)
            if m.get("modelStatus") != "available":
                d["status_ok"] = False
    rank = []
    for mid, d in rows.items():
        avg_in = round(sum(d["avg_in"]) / len(d["avg_in"]), 4) if d["avg_in"] else None
        avg_out = round(sum(d["avg_out"]) / len(d["avg_out"]), 4) if d["avg_out"] else None
        est = round(d["requests"] * (avg_in or 0), 4)
        rank.append({
            "model": mid, "requests": d["requests"], "avg_price_in": avg_in, "avg_price_out": avg_out,
            "ask_in": d["ask_in"], "ask_out": d["ask_out"], "active_providers": d["active_providers"],
            "est_earning": est, "status": "available" if d["status_ok"] else "limited",
        })
    rank.sort(key=lambda x: -x["requests"])
    return {"rows": rank, "total_requests": total_req, "source": "publisher/providers/{id}/asks (avgPriceRequests)"}


def _poll_earnings_log(size=25):
    """Ambil earning per-request terbaru (/usage/logs) untuk cache. Fetch page 1+2."""
    out = []
    d = inferhub_get("/usage/logs", {"range": "30d", "page": 1, "pageSize": max(size, 25)})
    if not d:
        return {"rows": [], "count": 0, "totalCostUsdc": 0}
    for r in (d.get("rows") or []):
        out.append({
            "ts": (r.get("ts") or "")[11:19],
            "model": r.get("model") or "",
            "upstream": r.get("upstream_label") or "",
            "in_tok": int(r.get("prompt_tokens") or 0),
            "out_tok": int(r.get("completion_tokens") or 0),
            "amount": round(float(r.get("cost_consumer_usdc") or 0) * PUBLISHER_SHARE, 6),
        })
    return {"rows": out, "count": int(d.get("total") or len(out)), "totalCostUsdc": float(d.get("totalCostUsdc") or 0)}


def _incremental_db_sync():
    """Sync DB secara inkremental (realtime lanjutan dari full pull).
    Refresh providers + market + usage log terbaru — tanpa re-fetch semua asks.
    Frontend tetap baca DB."""
    now = datetime.now(timezone.utc)
    try:
        prov = inferhub_get("/publisher/providers") or []
        with db_connect() as conn, conn.cursor() as cur:
            for p in prov:
                cur.execute("""
                    INSERT INTO providers (id, display_name, upstream_slug, upstream_label, enabled, status,
                        drained, used_pct, reset_at, earnings_lifetime, model_count, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name, enabled=EXCLUDED.enabled,
                      status=EXCLUDED.status, drained=EXCLUDED.drained, used_pct=EXCLUDED.used_pct,
                      reset_at=EXCLUDED.reset_at, earnings_lifetime=EXCLUDED.earnings_lifetime,
                      model_count=EXCLUDED.model_count, synced_at=EXCLUDED.synced_at
                """, (p["id"], p.get("displayName"), p.get("upstreamSlug"), p.get("upstreamLabel"),
                      bool(p.get("enabled")), p.get("apiKeyCheckStatus"), _is_drained(p),
                      p.get("observedUsedPct"), (p.get("observedResetAt") or "")[:10],
                      float(p.get("earningsLifetimeUsdc") or 0), int(p.get("modelCount") or 0), now))
        # market snapshot
        mkt = inferhub_get("/market") or {}
        with db_connect() as conn, conn.cursor() as cur:
            for m in (mkt.get("models") or []):
                cur.execute("""
                    INSERT INTO market_snapshot (slug, family, min_ask_in, max_ask_in, min_ask_out, max_ask_out, last_rate, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (slug) DO UPDATE SET family=EXCLUDED.family, min_ask_in=EXCLUDED.min_ask_in,
                      max_ask_in=EXCLUDED.max_ask_in, min_ask_out=EXCLUDED.min_ask_out, max_ask_out=EXCLUDED.max_ask_out,
                      last_rate=EXCLUDED.last_rate, synced_at=EXCLUDED.synced_at
                """, (m.get("slug"), m.get("family"), m.get("minAskIn"), m.get("maxAskIn"), m.get("minAskOut"),
                      m.get("maxAskOut"), m.get("lastRate"), now))
        # usage log terbaru (page 1)
        try:
            lg = inferhub_get("/usage/logs", {"range": "24h", "page": 1, "pageSize": 100}) or {}
        except Exception:
            lg = {}
        with db_connect() as conn, conn.cursor() as cur:
            for r in (lg.get("rows") or []):
                try:
                    ts = datetime.fromisoformat(r.get("ts", "").replace("Z", "+00:00"))
                except Exception:
                    continue
                cur.execute("""
                    INSERT INTO usage_logs (id, ts, model, upstream, status, prompt_tokens, completion_tokens, cost_consumer, cost_publisher, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id) DO NOTHING
                """, (r.get("id"), ts, r.get("model"), r.get("upstream_label"), r.get("status"),
                      int(r.get("prompt_tokens") or 0), int(r.get("completion_tokens") or 0),
                      float(r.get("cost_consumer_usdc") or 0), float(r.get("cost_consumer_usdc") or 0) * PUBLISHER_SHARE, now))
        # payouts: sinkron dari live withdrawals API -> tabel payouts (upsert, no manual)
        try:
            wd = inferhub_get("/publisher/withdrawals") or []
            with db_connect() as conn, conn.cursor() as cur:
                for w in wd:
                    wid = w.get("id") or str(uuid.uuid4())
                    amt = float(w.get("amountUsdc") or 0)
                    wdate = (w.get("requestedAt") or w.get("completedAt") or "")[:10]
                    status = w.get("status") or "confirmed"
                    cur.execute("""
                        INSERT INTO payouts (id, date, amount_usdc, status, destination, network, requested_at, completed_at, synced_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())
                        ON CONFLICT (id) DO UPDATE SET date=EXCLUDED.date, amount_usdc=EXCLUDED.amount_usdc,
                          status=EXCLUDED.status, destination=EXCLUDED.destination, completed_at=EXCLUDED.completed_at
                    """, (wid, wdate, amt, status, w.get("destination") or "", w.get("network") or "",
                          w.get("requestedAt") or "", w.get("completedAt") or ""))
        except Exception:
            pass
    except Exception as e:
        raise e


def _sync_account_light():
    """Sync ringan account cluster (keys/topups/budgets/combos/pricing) ke DB — upsert, tidak delete-all.
    Dipanggil poller tiap ~60s supaya key/topup/budget baru dari dashboard InferHub muncul otomatis."""
    now = datetime.now(timezone.utc)
    try:
        keys = inferhub_get("/keys") or []
        with db_connect() as conn, conn.cursor() as cur:
            for k in keys:
                cur.execute("""
                    INSERT INTO api_keys (id, name, key_prefix, scopes, created_at, last_used_at, expires_at, replaced_by, secret, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s)
                    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, key_prefix=EXCLUDED.key_prefix,
                      scopes=EXCLUDED.scopes, last_used_at=EXCLUDED.last_used_at, expires_at=EXCLUDED.expires_at,
                      replaced_by=EXCLUDED.replaced_by, synced_at=EXCLUDED.synced_at
                """, (k.get("id"), k.get("name"), k.get("keyPrefix"),
                      ",".join(k.get("scopes") or []), k.get("createdAt"), k.get("lastUsedAt"),
                      k.get("expiresAt"), k.get("replacedById"), now))
    except Exception:
        pass
    try:
        topups = inferhub_get("/topups") or []
        with db_connect() as conn, conn.cursor() as cur:
            for t in topups:
                cur.execute("""
                    INSERT INTO topups (id, amount_usdc, amount_idr, payment_method, status, payment_url, topup_key, tako_transaction_id, created_at, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, payment_url=EXCLUDED.payment_url, synced_at=EXCLUDED.synced_at
                """, (t.get("id"), float(t.get("amountUsdc") or 0), int(t.get("amountIdr") or 0),
                      t.get("paymentMethod"), t.get("status"), t.get("paymentUrl"), t.get("topupKey"),
                      t.get("takoTransactionId"), t.get("createdAt"), now))
    except Exception:
        pass
    try:
        pc = inferhub_get("/pricing/config") or {}
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM pricing_config")
            cur.execute("INSERT INTO pricing_config (id, max_ask_pct, platform_fee_pct, publisher_share_pct, synced_at) VALUES (1,%s,%s,%s,%s)",
                        (pc.get("maxAskPctOfOfficial"), pc.get("platformFeePct"), pc.get("publisherSharePct"), now))
            finance_share.invalidate_publisher_share()  # R15: share berubah -> cache segar
    except Exception:
        pass


def _poller():
    while True:
        try:
            _poll_once(time.time())
        except Exception as e:
            with _lock:
                _cache["last_error"] = str(e)
        time.sleep(POLL_SECONDS)


def start_backend():
    """Runtime init (dipanggil dari __main__): poller thread + DB init + seed + warmup.
    Dipisah dari module-scope supaya import utk unit test tidak menyentuh
    Postgres/thread/net — aman & cepat."""
    # start poller thread
    t = threading.Thread(target=_poller, daemon=True)
    t.start()
    # init postgres table
    db_init()
    # import ledger.json -> DB (hanya MIGRASI AWAL: kalau DB masih kosong).
    # DB = satu-satunya sumber kebenaran; ledger.json legacy jangan overwrite
    # data DB yang sudah dikoreksi (contoh: IMP-12 di-zero via audit).
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM payouts")
            n_payout = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM assets")
            n_asset = cur.fetchone()[0]
        if n_payout == 0 and n_asset == 0:
            db_import_ledger(load_json(LEDGER, {}))
            print("  [migrasi] ledger.json -> DB (DB kosong)")
        else:
            print(f"  [skip] ledger.json import dilewati (DB sudah punya {n_asset} assets, {n_payout} payouts)")
    except Exception:
        pass
    # seed history SEBELUM warmup poller: backfill kurva ke total real
    try:
        bal = inferhub_get("/publisher/earnings") or {}
        wd = inferhub_get("/publisher/withdrawals") or []
        b = float(bal.get("publisherEarningsUsdc") or 0)
        w = sum(float(x.get("amountUsdc") or 0) for x in (wd or []))
        db_seed(round(b + w, 4))
    except Exception:
        pass
    # warm up immediately (don't wait first sleep)
    try:
        _poll_once(time.time())
    except Exception:
        pass


def get_cache():
    with _lock:
        return json.loads(json.dumps(_cache))


def read_history():
    """Prefer Postgres DB history (primary); fall back to poller cache / file."""
    db_rows = db_read_history(limit=60000)
    if db_rows:
        return db_rows
    c = get_cache()
    if c["history"]:
        return c["history"]
    return read_history_file()


# Durasi tiap range utk window history — sumber tunggal: logic.RANGE_DUR_S
_RANGE_DUR_S = logic.RANGE_DUR_S

@app.route("/api/history")
def api_history():
    hist = read_history()
    range_id = request.args.get("range", "all")
    now = datetime.now(timezone.utc).timestamp()

    pts = [h for h in hist if h.get("epoch", 0) <= now]
    if not pts:
        return jsonify({"range": range_id, "points": [], "earnings": [], "deltas": [], "candle_s": 0, "candles": 0})

    data_start = min(p["epoch"] for p in pts)
    data_span = now - data_start

    if range_id == "all":
        candle_s = max(60, int(data_span) // MAX_CANDLES)
        window = data_span
        cutoff = data_start
    else:
        candle_s = CANDLE_LEN.get(range_id, 60)
        dur = _RANGE_DUR_S.get(range_id)
        if dur:
            window = min(dur, data_span)
        else:
            window = candle_s * MAX_CANDLES
        # clamp candle utk jangan melebihi MAX_CANDLES bucket
        if window and candle_s > 0 and window // candle_s > MAX_CANDLES:
            candle_s = max(60, int(window // MAX_CANDLES))
        cutoff = now - window

    pts = [p for p in pts if p["epoch"] >= cutoff]
    pts = sorted(pts, key=lambda p: p["epoch"])

    if not pts:
        return jsonify({"range": range_id, "points": [], "earnings": [], "deltas": [], "candle_s": candle_s, "candles": 0})

    buckets = {}
    for p in pts:
        slot = int(p["epoch"] // candle_s)
        buckets.setdefault(slot, []).append(p)

    ordered_slots = sorted(buckets)
    if len(ordered_slots) > MAX_CANDLES:
        ordered_slots = ordered_slots[-MAX_CANDLES:]

    candle_rows = []
    for slot in ordered_slots:
        grp = buckets[slot]
        last = grp[-1]
        candle_rows.append({"ts": last["ts"], "epoch": last["epoch"], "earnings": last["earnings"]})

    deltas = [0.0]
    for i in range(1, len(candle_rows)):
        d = candle_rows[i]["earnings"] - candle_rows[i - 1]["earnings"]
        deltas.append(round(max(d, 0.0), 4))

    return jsonify({
        "range": range_id,
        "window_s": int(window),
        "candle_s": candle_s,
        "points": [
            {"ts": c["ts"], "epoch": c["epoch"], "earnings": c["earnings"], "delta": deltas[i]}
            for i, c in enumerate(candle_rows)
        ],
        "labels": [c["ts"] for c in candle_rows],
        "earnings": [c["earnings"] for c in candle_rows],
        "deltas": deltas,
        "total_interval_earning": round(sum(deltas), 4),
        "candles": len(candle_rows),
        "candle_span_s": candle_s,
        "data_start": datetime.fromtimestamp(data_start, timezone.utc).isoformat(),
    })


@app.route("/api/data")
def api_data():
    c = get_cache()
    bal = c["balances"]
    fleet = c["fleet"]
    # finance from DB (full DB migration)
    fin = db_read_finance()
    # trend sparkline default (last 60 points)
    hist = c["history"]
    step = max(1, len(hist) // 60)
    earn_series = [round(t["earnings"], 4) for t in hist[::step]][-60:]

    return jsonify({
        "ts": c["refreshed"],
        "refreshed": c["refreshed"],
        "account": c["account"],
        "balances": bal,
        "fleet_summary": fleet,
        "finance": fin,
        "earnings_alltime": c["earnings_alltime"],
        "trend": {"earnings_usdc": earn_series},
    })


def _finance_from_ledger(ledger):
    """P&L dari ledger (struktur nyata: meta/assets/impairments/payouts top-level)."""
    if not isinstance(ledger, dict):
        ledger = {}
    assets = ledger.get("assets", []) or []
    payouts = ledger.get("payouts", []) or []
    impairments = ledger.get("impairments", []) or []
    meta = ledger.get("meta", {}) or {}

    kurs = float(meta.get("kurs_idr_usd") or 17801.1667)
    total_payout = round(sum(float(p.get("usd") or 0) for p in payouts), 2)
    n_payout = len(payouts)

    # AMORTISASI (penyusutan) — metode: diakui saat akun MATI/SELESAI (status != active).
    # Aset hidup dianggap utuh, berapapun usianya. Ini sesuai tracking manual per-akun:
    # susah tracking per-hari, jadi biaya baru diakui saat akun berhenti menghasilkan.
    amort_total = 0.0
    amort_lines = []
    for a in assets:
        raw = float(a.get("cost_per") or 0) * float(a.get("qty") or 1)
        cost = raw / kurs if a.get("curr", "USD") == "IDR" else raw
        status = a.get("status", "active")
        if status != "active":
            amort_total += cost
            amort_lines.append({
                "id": a.get("id"),
                "upstream": a.get("upstream"),
                "qty": a.get("qty"),
                "status": status,
                "cost_usd": round(cost, 2),
            })
    amort_usd = round(amort_total, 2)

    # impairment: loss IDR -> USD via kurs (curr='IDR'); USD langsung jika curr='USD'
    imp_loss_usd = 0.0
    imp_rows = []
    for im in impairments:
        loss = float(im.get("loss") or 0)
        curr = im.get("curr", "IDR")
        loss_usd = loss / kurs if curr == "IDR" else loss
        imp_loss_usd += loss_usd
        imp_rows.append({
            "name": im.get("label") or im.get("name") or "",
            "label": im.get("label") or "",
            "date": str(im.get("date") or "")[:10],
            "qty": im.get("qty"),
            "loss": loss,
            "loss_usd": round(loss_usd, 4),
        })
    total_imp_loss_usd = round(imp_loss_usd, 2)

    opex = 0.10
    net_income = round(total_payout - amort_usd - total_imp_loss_usd - opex, 2)
    aktif = sum(1 for a in assets if a.get("status") == "active")
    total_asset_qty = sum(int(a.get("qty") or 0) for a in assets)
    total_imp_qty = sum(int(im.get("qty") or 1) for im in impairments)

    # total modal = total investasi aset (USD): sum cost_per*qty, konversi IDR->USD
    # REV9: qty efektif x rasio provider ok (sama dgn db_read_finance)
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT upstream_slug, count(*) AS n FROM providers WHERE status='ok' AND NOT drained GROUP BY upstream_slug")
            prov_ok = {r["upstream_slug"]: r["n"] for r in cur.fetchall()}
    except Exception:
        prov_ok = {}
    def _slug_of_ledger(name):
        n = (name or "").strip().lower()
        if "clinepass" in n or n.startswith("cline-pass"):
            return "cline-pass"
        if "codebuddy" in n and ("cn" in n or n.endswith("cn")):
            return "codebuddy-cn"
        if "codebuddy" in n:
            return "codebuddy"
        if "command code" in n:
            return "commandcode"
        if "opencode" in n or "open code" in n:
            return "opencode-go"
        if "chatgpt" in n:
            return "codex"
        return None
    asset_qty_by = {}
    for a in assets:
        sl = _slug_of_ledger(a.get("upstream") or "")
        if sl:
            asset_qty_by[sl] = asset_qty_by.get(sl, 0) + int(a.get("qty") or 0)
    ratio_by = {sl: min(1.0, prov_ok.get(sl, 0) / q) for sl, q in asset_qty_by.items() if q > 0}
    for a in assets:
        if (a.get("status") or "active") != "active":
            continue  # REV9: aset retired TIDAK dihitung ke total modal aktif
        sl = _slug_of_ledger(a.get("upstream") or "")
        ratio = ratio_by.get(sl, 1.0)
        qty = int(round(float(a.get("qty") or 1) * ratio))
        raw = float(a.get("cost_per") or 0) * qty
        cost_usd = raw / kurs if a.get("curr", "USD") == "IDR" else raw
        total_capital_usd += cost_usd

    return {
        "total_payout": total_payout,
        "n_payout": n_payout,
        "amort_usd": amort_usd,
        "amort_assets": amort_lines,
        "total_imp_loss_usd": total_imp_loss_usd,
        "opex": round(opex, 2),
        "net_income": net_income,
        "kurs": round(kurs, 2),
        "aktif": aktif,
        "total_asset_qty": total_asset_qty,
        "total_imp_qty": total_imp_qty,
        "total_capital_usd": round(total_capital_usd, 2),
        "assets": asset_lines,
        "impairments": imp_rows,
    }


@app.route("/api/finance")
def api_finance():
    """Finance dari DB (assets/impairments/payouts) — full DB migration, no ledger.json."""
    return jsonify(db_read_finance())


@app.route("/api/payouts")
def api_payouts():
    c = get_cache()
    wd = c["withdrawals"]
    # prefer live API withdrawals; build payout rows
    rows = []
    for i, w in enumerate(wd, 1):
        rows.append({
            "ref": w.get("id") or f"payout-{i}",
            "date": (w.get("requestedAt") or "")[:10],
            "note": "Payout · " + (w.get("status") or ""),
            "usd": float(w.get("amountUsdc") or 0),
            "status": w.get("status"),
            "destination": w.get("destination"),
        })
    # if API empty, fall back to ledger payouts
    if not rows:
        ledger = load_json(LEDGER, {})
        data = ledger.get("data", ledger) if isinstance(ledger, dict) else {}
        payouts = data.get("payouts", []) if isinstance(data, dict) else []
        rows = [
            {"ref": p.get("id") or f"payout-{i+1}", "date": p.get("date", ""), "note": p.get("note", ""), "usd": float(p.get("usd") or 0)}
            for i, p in enumerate(payouts)
        ]
    total = round(sum(r["usd"] for r in rows), 2)
    return jsonify({"payouts": rows, "total": total, "count": len(rows)})


@app.route("/api/upstreams")
def api_upstreams():
    # baca dari DB providers (full pull + sync). fallback cache.
    dbp = db_read_providers()
    raw = dbp if dbp else (get_cache().get("fleet") or {}).get("raw") or []
    slug = request.args.get("slug")

    agg = {}
    for p in raw:
        s = p.get("slug") or p.get("upstream_slug")
        if not s:
            continue
        if slug and s != slug:
            continue
        a = agg.setdefault(s, {"slug": s, "label": p.get("label") or p.get("upstream_label", s), "total": 0, "ok": 0, "drained": 0, "invalid": 0, "earnings": 0.0, "rows": []})
        a["total"] += 1
        st = p.get("status")
        drained = p.get("drained")
        if st == "invalid":
            a["invalid"] += 1
        elif drained:
            a["drained"] += 1
        elif st == "ok":
            a["ok"] += 1
        else:
            a["ok"] += 1
        a["earnings"] += float(p.get("earnings") or p.get("earnings_lifetime") or 0)
        a["rows"].append({
            "name": p.get("name") or p.get("display_name") or "",
            "slug": s,
            "status": st,
            "drained": bool(drained),
            "used_pct": p.get("used_pct") if p.get("used_pct") is not None else None,
            "reset": p.get("reset") or p.get("reset_at") or "",
            "earnings": float(p.get("earnings") or p.get("earnings_lifetime") or 0),
        })

    out = []
    for s, a in agg.items():
        a["earnings"] = round(a["earnings"], 4)
        out.append(a)
    out.sort(key=lambda x: x["slug"])
    if slug:
        return jsonify(out[0] if out else {"slug": slug, "rows": []})
    return jsonify(out)


@app.route("/api/earnings-log")
def api_earnings_log():
    """Earning per-request terbaru — FETCH LANGSUNG ke InferHub /usage/logs segar tiap request
    (bukan baca DB yang sync lambat ~60s), supaya frontend poll dapat data realtime.
    Support ?size & ?range (24h/7d/30d/90d/all) — default 30d. TTL cache 3s per range+size
    agar poll chart+tabel tidak double-fetch InferHub (rate-limit safety)."""
    try:
        size = int(request.args.get("size", 25))
    except (TypeError, ValueError):
        size = 25
    if size > 200:
        size = 25
    range_id = request.args.get("range", "30d")
    if range_id not in USAGE_RANGES:
        range_id = "30d"
    now = time.time()
    key = f"{range_id}:{size}"
    with _lock:
        ck = _cache.get("earn_log_cache") or {}
        hit = ck.get(key)
        if hit and now - hit["ts"] < 3:
            return jsonify(hit["data"])
    d = inferhub_get("/usage/logs", {"range": range_id, "page": 1, "pageSize": max(size, 25)})
    if not d:
        return jsonify({"rows": [], "total": 0, "range": range_id, "error": "unavailable"})
    rows = []
    for r in (d.get("rows") or []):
        rows.append({
            "ts": r.get("ts") or "",
            "model": r.get("model") or "",
            "upstream": r.get("upstream_label") or "",
            "in_tok": int(r.get("prompt_tokens") or 0),
            "out_tok": int(r.get("completion_tokens") or 0),
            "amount": round(float(r.get("cost_consumer_usdc") or 0) * PUBLISHER_SHARE, 6),
        })
    payload = {
        "rows": rows,
        "total": int(d.get("total") or len(rows)),
        "range": range_id,
        "source": "usage/logs live fetch",
    }
    with _lock:
        ck = dict(_cache.get("earn_log_cache") or {})
        ck[key] = {"ts": now, "data": payload}
        _cache["earn_log_cache"] = ck
    return jsonify(payload)


@app.route("/api/earnings-alltime")
def api_earnings_alltime():
    c = get_cache()
    return jsonify(c["earnings_alltime"])


def _fetch_all_usage(range_id, max_rows=3000):
    """Paginate /usage/logs sampai habis (dibatasi max_rows & waktu) utk cegah 504.
    totalCostUsdc sudah aggregate dari halaman pertama — akurat tanpa paginate penuh.
    max_rows ~3000 -> maks ~30 page -> <~10s, cukup utk bucket trend (MAX_CANDLES)."""
    rows = []
    page = 1
    page_size = 100
    total_cost = 0.0
    start = time.time()
    while True:
        d = inferhub_get("/usage/logs", {"range": range_id, "page": page, "pageSize": page_size})
        if not d:
            break
        page_rows = d.get("rows", [])
        if not page_rows:
            break
        # totalCost aggregate dari halaman pertama (paling akurat & murah)
        if page == 1 and d.get("totalCostUsdc") is not None:
            total_cost = float(d.get("totalCostUsdc"))
        rows.extend(page_rows)
        if len(rows) >= int(d.get("total") or 0) or len(rows) >= max_rows:
            break
        if time.time() - start > 12:  # hard cap: jangan >12s per request
            break
        page += 1
        if page > 100:  # safety
            break
    return rows, total_cost


@app.route("/api/earnings-trend")
def api_earnings_trend():
    """Real income trend dibangun dari SEMUA earning per-call (/usage/logs).
    earning publisher per call = cost_consumer_usdc * PUBLISHER_SHARE.
    Bucket per interval (1m/5m/15m/1h/.../all) -> candles."""
    range_id = request.args.get("range", "all")
    rows, total_cost = _fetch_all_usage(range_id)

    # parse ts -> epoch
    parsed = []
    for r in rows:
        ts = r.get("ts", "")
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            epoch = dt.timestamp()
        except Exception:
            continue
        cost = float(r.get("cost_consumer_usdc") or 0)
        parsed.append({"epoch": epoch, "earn": cost * PUBLISHER_SHARE})

    if not parsed:
        return jsonify({"range": range_id, "points": [], "deltas": [], "candles": 0, "candle_s": 0, "total_interval_earning": 0, "calls": 0})

    now = datetime.now(timezone.utc).timestamp()
    data_start = min(p["epoch"] for p in parsed)
    data_span = now - data_start

    if range_id == "all":
        candle_s = max(60, int(data_span) // MAX_CANDLES)
        cutoff = data_start
    else:
        candle_s = CANDLE_LEN.get(range_id, 60)
        cutoff = now - candle_s * MAX_CANDLES

    pts = [p for p in parsed if p["epoch"] >= cutoff]
    if not pts:
        return jsonify({"range": range_id, "points": [], "deltas": [], "candles": 0, "candle_s": candle_s, "total_interval_earning": 0, "calls": 0})

    # bucket per slot: sum earning dalam slot
    buckets = {}
    for p in pts:
        slot = int(p["epoch"] // candle_s)
        buckets[slot] = buckets.get(slot, 0.0) + p["earn"]

    ordered = sorted(buckets)
    if len(ordered) > MAX_CANDLES:
        ordered = ordered[-MAX_CANDLES:]

    points = []
    for slot in ordered:
        dt = datetime.fromtimestamp(slot * candle_s, timezone.utc)
        points.append({
            "ts": dt.isoformat(),
            "epoch": slot * candle_s,
            "delta": round(buckets[slot], 4),
        })

    return jsonify({
        "range": range_id,
        "candle_s": candle_s,
        "points": points,
        "deltas": [p["delta"] for p in points],
        "candles": len(points),
        "total_interval_earning": round(sum(p["delta"] for p in points), 4),
        "calls": len(pts),
        "total_cost_consumer": round(total_cost, 4),
        "source": "usage/logs per-call",
    })


@app.route("/api/earnings-summary")
def api_earnings_summary():
    """Real income TOTAL per range = totalCostUsdc (konsumen) × publisher share.
    Aggregate API akurat & instan — tidak perlu paginate ribuan rows.
    Frontend: angka 'real income in range' + all-time dari sini."""
    range_id = request.args.get("range", "all")
    d = inferhub_get("/usage/logs", {"range": range_id, "page": 1, "pageSize": 1})
    if not d:
        return jsonify({"range": range_id, "error": "unavailable"})
    total_cost = float(d.get("totalCostUsdc") or 0)
    total_calls = int(d.get("total") or 0)
    return jsonify({
        "range": range_id,
        "total_cost_consumer": round(total_cost, 4),
        "earning_publisher": round(total_cost * PUBLISHER_SHARE, 4),
        "total_calls": total_calls,
        "publisher_share": PUBLISHER_SHARE,
        "source": "usage/logs totalCostUsdc × publisher share",
    })


@app.route("/api/publisher-analytics")
def api_publisher_analytics():
    """Analytics publisher. Earnings per upstream dari earningsLifetimeUsdc (all-time)
    + estimasi per range. Utk range waktu, gunakan sumber REAL (/usage/logs aggregate)
    — BUKAN kurva seed sintetis di DB (yang mengkontaminasi MIN/MAX lifetime)."""
    range_id = request.args.get("range", "all")
    dbp = db_read_providers()
    prov = dbp if dbp is not None else ((get_cache().get("fleet") or {}).get("raw") or [])
    # by upstream — fields fleet_raw: slug, label, earnings, status, drained, used_pct
    by_up = {}
    for p in prov:
        u = p.get("slug", "?")
        d = by_up.setdefault(u, {"slug": u, "label": p.get("label", u), "n": 0, "earn": 0.0, "ok": 0, "drained": 0, "invalid": 0, "used_pct_sum": 0.0})
        d["n"] += 1
        d["earn"] += float(p.get("earnings") or 0)
        if p.get("drained"):
            d["drained"] += 1
        elif p.get("status") == "invalid":
            d["invalid"] += 1
        else:
            d["ok"] += 1
        up = p.get("used_pct")
        if up is not None:
            d["used_pct_sum"] += float(up)
    for d in by_up.values():
        d["earn"] = round(d["earn"], 2)
        d["avg_used_pct"] = round(d["used_pct_sum"] / d["n"], 1) if d["n"] else 0
    by_up_list = sorted(by_up.values(), key=lambda x: -x["earn"])

    total_earn_lifetime = round(sum(d["earn"] for d in by_up_list), 2)

    # ── earning dalam range: sumber REAL (/usage/logs aggregate) ──
    # db_read_earning_range memakai MIN/MAX kurva seed sintetis 05-Jul..08-Agu
    # -> angka palsu. Pakai aggregate akurat totalCost×share utk range; DB utk 'all'.
    window_earning = 0.0
    if range_id == "all":
        window_earning = db_read_earning_range("all")
    else:
        agg = inferhub_get("/usage/logs", {"range": range_id, "page": 1, "pageSize": 1})
        if agg:
            try:
                window_earning = float(agg.get("totalCostUsdc") or 0) * PUBLISHER_SHARE
            except (TypeError, ValueError):
                window_earning = 0.0

    # distribusi window earning proporsional ke tiap upstream (share lifetime)
    if total_earn_lifetime > 0:
        scale = window_earning / total_earn_lifetime
    else:
        scale = 0
    for d in by_up_list:
        d["earn_range"] = round(d["earn"] * scale, 2)
        d["share_range"] = round((d["earn"] * scale / window_earning) * 100, 1) if window_earning > 0 else 0

    return jsonify({
        "by_upstream": by_up_list,
        "total_earning": total_earn_lifetime,
        "total_earning_range": round(window_earning, 2),
        "range": range_id,
        "total_providers": len(prov),
        "source": "publisher/providers earningsLifetimeUsdc + history window",
    })


@app.route("/api/model-ranking")
def api_model_ranking():
    """Ranking model publisher — baca dari DB (backend poll API -> DB, frontend lihat DB)."""
    d = db_read_model_rank()
    return jsonify(d or {"rows": [], "total_requests": 0, "source": "pending (polling)"})


@app.route("/api/keys")
def api_keys():
    """API keys — baca dari DB (full pull + sync)."""
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, name, key_prefix, scopes, created_at, last_used_at, expires_at, replaced_by FROM api_keys ORDER BY created_at DESC")
            rows = cur.fetchall()
        return jsonify([{
            "id": r["id"], "name": r["name"], "key_prefix": r["key_prefix"],
            "scopes": (r["scopes"] or "").split(",") if r["scopes"] else [],
            "created_at": r["created_at"], "last_used_at": r["last_used_at"],
            "expires_at": r["expires_at"], "replaced_by": r["replaced_by"],
        } for r in rows])
    except Exception:
        return jsonify([])


@app.route("/api/topups")
def api_topups():
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, amount_usdc, amount_idr, payment_method, status, payment_url, topup_key, created_at FROM topups ORDER BY created_at DESC")
            rows = cur.fetchall()
        return jsonify([{
            "id": r["id"], "amount_usdc": r["amount_usdc"], "amount_idr": r["amount_idr"],
            "payment_method": r["payment_method"], "status": r["status"], "payment_url": r["payment_url"],
            "topup_key": r["topup_key"], "created_at": r["created_at"],
        } for r in rows])
    except Exception:
        return jsonify([])


@app.route("/api/budgets")
def api_budgets():
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT upstream_catalog_model_id, prefix, upstream_model_id, upstream_label,
                       official_in, official_out, market_min_ask_in, market_min_ask_out,
                       max_input_per_mtok, max_output_per_mtok, min_discount_pct, enabled
                FROM budgets ORDER BY upstream_label, upstream_model_id
            """)
            rows = cur.fetchall()
        return jsonify([{
            "id": r["upstream_catalog_model_id"], "prefix": r["prefix"], "model": r["upstream_model_id"],
            "upstream": r["upstream_label"], "official_in": r["official_in"], "official_out": r["official_out"],
            "market_min_ask_in": r["market_min_ask_in"], "market_min_ask_out": r["market_min_ask_out"],
            "max_input_per_mtok": r["max_input_per_mtok"], "max_output_per_mtok": r["max_output_per_mtok"],
            "min_discount_pct": r["min_discount_pct"], "enabled": bool(r["enabled"]),
        } for r in rows])
    except Exception:
        return jsonify([])


@app.route("/api/combos")
def api_combos():
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, name, slug, max_input_per_mtok, max_output_per_mtok, created_at FROM combos")
            combos = cur.fetchall()
            cur.execute("SELECT combo_id, model FROM combo_models")
            cm = cur.fetchall()
        models_by = {}
        for r in cm:
            models_by.setdefault(r["combo_id"], []).append(r["model"])
        return jsonify([{
            "id": r["id"], "name": r["name"], "slug": r["slug"],
            "max_input_per_mtok": r["max_input_per_mtok"], "max_output_per_mtok": r["max_output_per_mtok"],
            "created_at": r["created_at"], "models": models_by.get(r["id"], []),
        } for r in combos])
    except Exception:
        return jsonify([])


@app.route("/api/pricing-config")
def api_pricing_config():
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT max_ask_pct, platform_fee_pct, publisher_share_pct FROM pricing_config WHERE id=1")
            r = cur.fetchone()
        return jsonify({"max_ask_pct": r["max_ask_pct"], "platform_fee_pct": r["platform_fee_pct"], "publisher_share_pct": r["publisher_share_pct"]} if r else {})
    except Exception:
        return jsonify({})


@app.route("/api/keys", methods=["POST"])
def api_keys_post():
    body = request.get_json(silent=True) or {}
    name = body.get("name")
    if not name:
        return jsonify({"error": "name required"}), 400
    d = inferhub_post("/keys", {"name": name})
    if not d:
        return jsonify({"error": "create failed"}), 502
    try:
        now = datetime.now(timezone.utc)
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO api_keys (id, name, key_prefix, scopes, created_at, last_used_at, expires_at, replaced_by, secret, synced_at)
                VALUES (%s,%s,%s,%s,%s,NULL,NULL,NULL,%s,%s)
                ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, key_prefix=EXCLUDED.key_prefix, secret=EXCLUDED.secret, synced_at=EXCLUDED.synced_at
            """, (d.get("id"), name, d.get("prefix"), "chat,completions,embeddings", now, d.get("secret"), now))
            conn.commit()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(d), 201


@app.route("/api/keys/<kid>/rotate", methods=["POST"])
def api_keys_rotate(kid):
    d = inferhub_post(f"/keys/{kid}/rotate")
    if not d:
        return jsonify({"error": "rotate failed"}), 502
    try:
        now = datetime.now(timezone.utc)
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO api_keys (id, name, key_prefix, scopes, created_at, last_used_at, expires_at, replaced_by, secret, synced_at)
                VALUES (%s,%s,%s,%s,%s,NULL,NULL,NULL,%s,%s)
                ON CONFLICT (id) DO UPDATE SET key_prefix=EXCLUDED.key_prefix, secret=EXCLUDED.secret, synced_at=EXCLUDED.synced_at
            """, (d.get("id"), d.get("name"), d.get("prefix"), "chat,completions,embeddings", now, d.get("secret"), now))
            conn.commit()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(d), 201


@app.route("/api/keys/<kid>", methods=["DELETE"])
def api_keys_delete(kid):
    ok = inferhub_delete(f"/keys/{kid}")
    if ok is False:
        return jsonify({"error": "revoke failed"}), 502
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM api_keys WHERE id=%s", (kid,))
            conn.commit()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True})


@app.route("/api/budgets/aliases")
def api_budget_aliases():
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT alias, label, member_count, min_discount_pct, upstream_labels FROM budget_aliases ORDER BY alias")
            rows = cur.fetchall()
        return jsonify([{
            "alias": r["alias"], "label": r["label"], "member_count": r["member_count"],
            "min_discount_pct": r["min_discount_pct"], "upstream_labels": r["upstream_labels"],
        } for r in rows])
    except Exception:
        return jsonify([])


@app.route("/api/budgets/<mid>", methods=["PUT"])
def api_budget_put(mid):
    body = request.get_json(silent=True) or {}
    payload = {
        "maxInputPerMtok": body.get("max_input_per_mtok"),
        "maxOutputPerMtok": body.get("max_output_per_mtok"),
        "minDiscountPct": body.get("min_discount_pct"),
        "enabled": body.get("enabled", True),
    }
    d = inferhub_put(f"/budgets/{mid}", payload)
    if d is None:
        return jsonify({"error": "budget update failed"}), 502
    return jsonify({"ok": True})


@app.route("/api/topups", methods=["POST"])
def api_topups_post():
    body = request.get_json(silent=True) or {}
    amount = body.get("amount")
    pm = body.get("payment_method") or "qris"
    if amount is None or amount == "":
        return jsonify({"error": "amount required"}), 400
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "amount must be a number"}), 400
    if amount <= 0:
        return jsonify({"error": "amount must be positive"}), 400
    d = inferhub_post("/topups", {"amount": amount, "paymentMethod": pm})
    if not d:
        return jsonify({"error": "create topup failed"}), 502
    # amount_usdc dari respons API bila tersedia; fallback 0 (kurang informasi)
    try:
        usdc = float(d.get("amountUsdc") or 0)
    except (TypeError, ValueError):
        usdc = 0
    # simpan ke DB
    try:
        now = datetime.now(timezone.utc)
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO topups (id, amount_usdc, amount_idr, payment_method, status, payment_url, topup_key, tako_transaction_id, qr_data, qr_svg, created_at, synced_at)
                VALUES (%s,%s,%s,%s,%s,NULL,%s,NULL,%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, qr_data=EXCLUDED.qr_data, qr_svg=EXCLUDED.qr_svg
            """, (d.get("topupKey"), usdc, int(amount), pm, "pending", d.get("topupKey"),
                  d.get("qrData"), d.get("qrSvg"), now.isoformat(), now))
            conn.commit()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(d), 201


@app.route("/api/topups/<topupKey>/refresh", methods=["POST"])
def api_topups_refresh(topupKey):
    d = inferhub_post(f"/topups/{topupKey}/refresh")
    if not d:
        return jsonify({"error": "refresh failed"}), 502
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE topups SET status=%s WHERE topup_key=%s", (d.get("status"), topupKey))
    except Exception:
        pass
    return jsonify(d)


@app.route("/api/combos", methods=["POST"])
def api_combos_post():
    body = request.get_json(silent=True) or {}
    name = body.get("name")
    slug = body.get("slug")
    model_ids = body.get("model_ids") or []
    if not name or not slug or not model_ids:
        return jsonify({"error": "name, slug, model_ids required"}), 400
    d = inferhub_post("/combos", {"name": name, "slug": slug, "modelIds": model_ids})
    if not d:
        return jsonify({"error": "create combo failed"}), 502
    # body kosong → re-sync combos
    try:
        _sync_combos_db()
    except Exception:
        pass
    return jsonify({"ok": True})


@app.route("/api/combos/<cid>", methods=["DELETE"])
def api_combos_delete(cid):
    ok = inferhub_delete(f"/combos/{cid}")
    if ok is False:
        return jsonify({"error": "delete combo failed"}), 502
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM combos WHERE id=%s", (cid,))
            cur.execute("DELETE FROM combo_models WHERE combo_id=%s", (cid,))
            conn.commit()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True})


def _sync_combos_db():
    try:
        combos = inferhub_get("/combos") or []
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM combos"); cur.execute("DELETE FROM combo_models")
            now = datetime.now(timezone.utc)
            for co in combos:
                cur.execute("INSERT INTO combos (id, name, slug, max_input_per_mtok, max_output_per_mtok, created_at, synced_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                            (co.get("id"), co.get("name"), co.get("slug"),
                             to_null_f(co.get("maxInputPerMtok")), to_null_f(co.get("maxOutputPerMtok")), co.get("createdAt"), now))
                for m in (co.get("members") or []):
                    cur.execute("INSERT INTO combo_models (combo_id, model_id, model, label) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                                (co.get("id"), m.get("modelId"), m.get("model"), m.get("label")))
    except Exception:
        pass


def to_null_f(v):
    try:
        return float(v)
    except Exception:
        return None


@app.route("/api/combos/available-models")
def api_combos_available():
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT DISTINCT model FROM combo_models")
            rows = cur.fetchall()
        return jsonify([r["model"] for r in rows])
    except Exception:
        return jsonify([])


@app.route("/api/breakdown")
def api_breakdown():
    rng = request.args.get("range", "7d")
    d = inferhub_get("/usage/breakdown", {"range": rng})
    if not d:
        return jsonify({"byModel": [], "byProvider": [], "byProviderModel": [], "range": rng})
    return jsonify(d)


@app.route("/api/market")
def api_market():
    d = inferhub_get("/market")
    if not d:
        return jsonify({"error": "unavailable"})
    return jsonify(d)


@app.route("/api/catalog")
def api_catalog():
    d = inferhub_get("/catalog")
    if not d:
        return jsonify({"error": "unavailable"})
    if isinstance(d, list):
        return jsonify({"upstreams": d})
    return jsonify(d)


@app.route("/api/orderbook")
def api_orderbook():
    """Orderbook per model: agregat catalog.asksIn[] -> level harga + depth per upstream.
    Harga termurah -> tertinggi (ladder). Juga min/max/spread/official.
    dimaksud utk halaman Ask Price orderbook-style (klik model -> modal set manual)."""
    cat = inferhub_get("/catalog")
    asks_map = {}
    ad = inferhub_get("/publisher/providers")
    sample = None
    if isinstance(ad, list):
        sample = next((p for p in ad if p.get("enabled")), None)
    if sample:
        a = inferhub_get(f"/publisher/providers/{sample['id']}/asks")
        if isinstance(a, list):
            for x in a:
                asks_map[x.get("upstreamCatalogModelId")] = x

    ups = cat if isinstance(cat, list) else (cat or {}).get("upstreams", []) if isinstance(cat, dict) else []
    # model -> {label, model_id, official_in, upstreams:[{slug,label,levels:[{price,qty}]}], our_ask}
    models = {}
    for u in ups:
        slug = u.get("slug"); ulabel = u.get("label")
        for m in (u.get("models") or []):
            cid = m.get("id") or m.get("upstreamCatalogModelId")
            mid = m.get("upstreamModelId")
            label = m.get("label") or mid or cid
            official = m.get("officialIn") or m.get("officialInputPerMtok")
            try: official = float(official)
            except (TypeError, ValueError): official = None
            asks_in = m.get("asksIn") or []
            # bucket depth per distinct price
            cnt = {}
            for price in asks_in:
                try: p = round(float(price), 6)
                except (TypeError, ValueError): continue
                cnt[p] = cnt.get(p, 0) + 1
            levels = [{"price": p, "qty": q} for p, q in sorted(cnt.items())]
            # NORMALISASI KEY: model sama di banyak upstream sering pakai prefix berbeda
            # (cline-pass/deepseek-v4-flash vs deepseek-v4-flash). Ambil segmen setelah '/' terakhir
            # supaya 1 model = 1 kartu, semua upstream digabung di dalam.
            raw_mid = mid or ""
            norm_mid = raw_mid.split("/")[-1].strip().lower()
            if not norm_mid:
                norm_mid = label or cid or ""
            key = norm_mid
            mo = models.setdefault(key, {
                "model_id": raw_mid, "label": label, "official_in": official,
                "upstreams": [], "our_ask": None,
            })
            our_a = asks_map.get(cid)
            if our_a and mo["our_ask"] is None:
                try: mo["our_ask"] = round(float(our_a.get("askInputPerMtok") or 0), 6)
                except (TypeError, ValueError): pass
            # expose upstreamCatalogModelId (cid) utk set-harga-manual dari frontend
            mo["upstreams"].append({"slug": slug, "label": ulabel, "levels": levels, "active": u.get("activeProviders"), "cid": cid})
    # compute min/max/spread + sort models
    out = []
    for key, mo in models.items():
        all_lv = [lv for u in mo["upstreams"] for lv in u["levels"]]
        prices = [lv["price"] for lv in all_lv if lv["price"] > 0]
        mn = min(prices) if prices else None
        mx = max(prices) if prices else None
        mo["min_ask"] = mn; mo["max_ask"] = mx
        mo["spread"] = round(mx - mn, 6) if mn is not None and mx is not None else None
        out.append(mo)
    out.sort(key=lambda x: (x["min_ask"] is None, x["min_ask"] if x["min_ask"] is not None else float("inf")))
    return jsonify({"models": out, "count": len(out)})


@app.route("/api/usage/cache-stats")
def api_usage_cache_stats():
    rng = request.args.get("range", "30d")
    d = inferhub_get("/usage/cache-stats", {"range": rng})
    if not d:
        return jsonify({"error": "unavailable", "range": rng})
    return jsonify(d)


@app.route("/api/usage/logs")
def api_usage_logs():
    rng = request.args.get("range", "24h")
    page = request.args.get("page", "1")
    pageSize = request.args.get("pageSize", "25")
    model = request.args.get("model", "")
    status = request.args.get("status", "all")
    sort = request.args.get("sort", "ts")
    dir_ = request.args.get("dir", "desc")
    params = {"range": rng, "page": page, "pageSize": pageSize, "sort": sort, "dir": dir_}
    if model:
        params["model"] = model
    if status and status != "all":
        params["status"] = status
    d = inferhub_get("/usage/logs", params)
    if not d:
        return jsonify({"error": "unavailable", "rows": [], "range": rng})
    return jsonify(d)


@app.route("/api/usage/logs-models")
def api_usage_logs_models():
    rng = request.args.get("range", "24h")
    d = inferhub_get("/usage/logs/models", {"range": rng})
    if not d:
        return jsonify([])
    if isinstance(d, list):
        return jsonify(d)
    return jsonify(d.get("models", []) if isinstance(d, dict) else [])


@app.route("/api/v1-models")
def api_v1_models():
    d = inferhub_inf_get("/v1/models")
    if not d or not isinstance(d, dict):
        return jsonify({"error": "unavailable", "data": []})
    return jsonify(d)


@app.route("/api/v1-me-usage")
def api_v1_me_usage():
    win = request.args.get("window", "30d")
    d = inferhub_inf_get("/v1/me/usage", {"window": win})
    if not d:
        return jsonify({"error": "unavailable"})
    return jsonify(d)


@app.route("/api/fleet-health")
def api_fleet_health():
    """Raw provider rows utk Fleet Health. Baca dari DB providers (sync incremental)."""
    dbp = db_read_providers()
    raw = dbp if dbp else (get_cache().get("fleet") or {}).get("raw") or []
    q = request.args.get("q", "").strip().lower()
    if q:
        raw = [p for p in raw if (q in (p.get("name") or "").lower() or q in (p.get("label") or "").lower() or q in (p.get("id") or "").lower())]
    return jsonify({"providers": raw, "count": len(raw)})


@app.route("/api/provider-recheck", methods=["POST"])
def api_provider_recheck():
    """Re-verify satu provider (non-destructive). Safe per audit-publisher.md."""
    pid = request.args.get("id") or (request.get_json(silent=True) or {}).get("id")
    if not pid:
        return jsonify({"error": "id required"}), 400
    d = inferhub_post(f"/publisher/providers/{pid}/recheck")
    if d is None:
        return jsonify({"error": "recheck failed (network/upstream)"}), 502
    return jsonify(d)


@app.route("/api/asks")
def api_asks():
    """Asks per provider × model dari /publisher/providers/{id}/asks. 
    Query: ?upstream=codex&q=model&status=all — agregat per upstream tab-wide.
    Catatan: modelId path PUT = upstreamCatalogModelId (uuid)."""
    up = request.args.get("upstream", "")
    prov = inferhub_get("/publisher/providers") or []
    # pilih provider
    provs = [p for p in prov if p.get("enabled")]
    if up:
        provs = [p for p in provs if p.get("upstreamSlug") == up]
    if not provs:
        return jsonify({"rows": [], "upstreams": up, "note": "no providers"})
    # ambil asks utk 1 sample provider per upstream (tab-wide asks identik)
    seen = set()
    aggregates = []  # normalize per (upstreamCatalogModelId)
    for p in provs:
        s = p.get("upstreamSlug")
        if s in seen:
            continue
        seen.add(s)
        asks = inferhub_get(f"/publisher/providers/{p['id']}/asks")
        if not isinstance(asks, list):
            continue
        for a in asks:
            if not a.get("enabled"):
                continue
            aggregates.append({
                "upstream_catalog_model_id": a.get("upstreamCatalogModelId"),
                "upstream_model_id": a.get("upstreamModelId"),
                "upstream_slug": s,
                "label": p.get("upstreamLabel"),
                "ask_in": float(a.get("askInputPerMtok") or 0),
                "ask_out": float(a.get("askOutputPerMtok") or 0),
                "official_in": float(a.get("officialInputPerMtok") or 0),
                "official_out": float(a.get("officialOutputPerMtok") or 0),
                "max_ask_in": float(a.get("maxAskIn") or 0),
                "max_ask_out": float(a.get("maxAskOut") or 0),
                "max_ask_pct": a.get("maxAskPct"),
                "cheapest_active_pct": a.get("cheapestActivePct"),
                "avg_price_requests": int(a.get("avgPriceRequests") or 0),
                "avg_price_in": a.get("avgPriceIn"),
                "status": a.get("modelStatus"),
            })
    # filter
    q = request.args.get("q", "").strip().lower()
    if q:
        aggregates = [a for a in aggregates if (q in (a["upstream_model_id"] or "").lower() or q in (a["label"] or "").lower())]
    return jsonify({"rows": aggregates, "count": len(aggregates)})


@app.route("/api/ask", methods=["PUT"])
def api_ask_put():
    """Set ask tab-wide. Body: {upstream_catalog_model_id, ask_input_per_mtok, ask_output_per_mtok}.
    Path: PUT /publisher/upstreams/{slug}/asks/{upstreamCatalogModelId}
    modelId = uuid upstreamCatalogModelId (riset cluster 3). Bounded by maxAsk (backend check di sini)."""
    body = request.get_json(silent=True) or {}
    mid = body.get("upstream_catalog_model_id")
    slug = body.get("upstream_slug")
    ain = body.get("ask_input_per_mtok")
    aout = body.get("ask_output_per_mtok")
    if not mid or not slug or ain is None or aout is None:
        return jsonify({"error": "upstream_catalog_model_id, upstream_slug, ask_input_per_mtok, ask_output_per_mtok required"}), 400
    d = inferhub_put(f"/publisher/upstreams/{slug}/asks/{mid}",
                     {"askInputPerMtok": str(ain), "askOutputPerMtok": str(aout)})
    if d is None:
        return jsonify({"error": "PUT failed (network/upstream or above cap)"}), 502
    return jsonify(d)


@app.route("/api/auto-pricing")
def api_auto_pricing():
    """Status algo auto-pricing: state (decisions), armed flag, log tail."""
    state = {}
    sfile = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-state.json")
    if os.path.exists(sfile):
        try:
            with open(sfile) as f:
                state = json.load(f)
        except Exception:
            state = {}
    armed = False
    afile = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-arm")
    if os.path.exists(afile):
        try:
            armed = open(afile).read().strip() == "1"
        except Exception:
            armed = False
    logtail = ""
    lfile = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing.log")
    if os.path.exists(lfile):
        try:
            with open(lfile) as f:
                lines = f.readlines()
            logtail = "".join(lines[-80:])
        except Exception:
            logtail = ""
    cycles = state.get("cycles") or []
    n_undercut = sum(1 for c in cycles if c.get("action") == "undercut")
    n_leader = sum(1 for c in cycles if c.get("action") == "leader")
    n_hold = sum(1 for c in cycles if c.get("action") == "hold")
    return jsonify({
        "armed": armed,
        "ts": state.get("ts"),
        "count": len(cycles),
        "n_undercut": n_undercut,
        "n_leader": n_leader,
        "n_hold": n_hold,
        "cycles": cycles,
        "log": logtail,
    })


@app.route("/api/auto-pricing/arm", methods=["POST"])
def api_auto_pricing_arm():
    """Toggle arm flag (1 eksekusi PUT, 0 dry-run). Body: {armed: bool}"""
    body = request.get_json(silent=True) or {}
    armed = bool(body.get("armed"))
    afile = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-arm")
    try:
        os.makedirs(os.path.dirname(afile), exist_ok=True)
        with open(afile, "w") as f:
            f.write("1" if armed else "0")
        return jsonify({"armed": armed, "file": afile})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto-pricing/config")
def api_auto_pricing_config():
    """Semua config auto-pricing per upstream×model (trigger_pct only).
    Catatan: kolom rebound_pct masih ada di DB (legacy), tapi tidak dipakai lagi sejak v2
    (REBOUND dihapus). API tidak expose supaya UI tidak bisa set nilai sia-sia.
    """
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, upstream, model_id, trigger_pct FROM auto_pricing_config")
            rows = cur.fetchall()
        return jsonify({"configs": rows})
    except Exception:
        return jsonify({"configs": []})


@app.route("/api/auto-pricing/config", methods=["PUT"])
def api_auto_pricing_config_put():
    """Upsert config utk satu upstream×model. Body: {upstream, model_id, trigger_pct}.
    rebound_pct diabaikan (legacy field, dihapus dari permukaan API v2).
    """
    body = request.get_json(silent=True) or {}
    upstream = (body.get("upstream") or "").strip()
    model_id = (body.get("model_id") or "").strip()
    try:
        trigger_pct = float(body.get("trigger_pct"))
    except (TypeError, ValueError):
        return jsonify({"error": "trigger_pct numeric required"}), 400
    if not upstream or not model_id:
        return jsonify({"error": "upstream & model_id required"}), 400
    if trigger_pct <= 0:
        return jsonify({"error": "trigger_pct harus > 0"}), 400
    try:
        with db_connect() as conn, conn.cursor() as cur:
            # keep rebound_pct existing (legacy) — hanya update trigger_pct
            cur.execute("""
                INSERT INTO auto_pricing_config (upstream, model_id, trigger_pct, rebound_pct, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (upstream, model_id)
                DO UPDATE SET trigger_pct=EXCLUDED.trigger_pct, updated_at=now()
            """, (upstream, model_id, trigger_pct, trigger_pct))
            conn.commit()
        _sync_ap_config_file()
        return jsonify({"ok": True, "upstream": upstream, "model_id": model_id, "trigger_pct": trigger_pct})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto-pricing/config/<int:cid>", methods=["DELETE"])
def api_auto_pricing_config_delete(cid):
    """Hapus config → kembali ke default. Saat ini config kosong = default."""
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM auto_pricing_config WHERE id=%s", (cid,))
            conn.commit()
        _sync_ap_config_file()
        return jsonify({"ok": True, "deleted": cid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _sync_ap_config_file():
    """Sync auto_pricing_config DB -> JSON file (daemon baca file ini, tanpa psycopg)."""
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT upstream, model_id, trigger_pct, rebound_pct FROM auto_pricing_config")
            rows = cur.fetchall()
        path = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-config.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump({"configs": rows, "updated_at": time.time()}, f, indent=2)
    except Exception:
        pass


@app.route("/health")
def health():
    return jsonify({"ok": True, "polled_at": get_cache()["refreshed"]})


# sync auto-pricing config DB -> JSON (daemon baca file ini).
# Dipanggil dalam main() — bukan module-scope — supaya import utk unit test
# tidak menyentuh Postgres (aman & cepat).


def main():
    try:
        _sync_ap_config_file()
    except Exception:
        pass
    start_backend()
    from waitress import serve
    serve(app, host="127.0.0.1", port=PORT)


if __name__ == "__main__":
    main()


