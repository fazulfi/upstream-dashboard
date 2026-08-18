#!/usr/bin/env python3
"""Full data sync — InferHub API → PostgreSQL. Ambil SEMUA data sekali jalan
(providers, provider asks, usage logs lengkap, market, catalog), simpan ke DB.
Frontend baca hanya dari DB. Bukan polling bertahap — full pull.

Usage:
  python full_sync.py            # sync semua
  python full_sync.py --once     # 1 pass, exit
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

ENV_FILE = "/home/gamesim/.hermes-suisui/.env"
DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise RuntimeError("UPSTREAM_DB must be configured")
# R15: publisher share dari DB (fallback 0.80) — jangan hardcode 0.80
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import finance_share  # noqa: E402
PUBLISHER_SHARE = finance_share.publisher_share_pct()
def load_key():
    if "INFERHUB_API_KEY" in os.environ:
        return os.environ["INFERHUB_API_KEY"]
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line.startswith("INFERHUB_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("INFERHUB_API_KEY not found")


KEY = load_key()


def inferhub_get(path, params=None, timeout=30):
    url = "https://inferhub.dev/api" + path
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + KEY, "User-Agent": "fullsync/1.0", "Accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def db():
    return psycopg.connect(DB_DSN, row_factory=dict_row)


def init_db():
    """Buat schema lengkap (20 tabel) — R11: DDL terpusat di db_schema.ensure_schema."""
    from db_schema import ensure_schema
    with db() as c, c.cursor() as cur:
        ensure_schema(cur)
        c.commit()


def _du_future(p):
    """True jika drainedUntil masih di masa depan (belum lewat)."""
    du = p.get("drainedUntil")
    if not du:
        return False
    try:
        from datetime import datetime, timezone
        du_dt = datetime.fromisoformat(du.replace("Z", "+00:00").replace(" ", "T"))
        return du_dt > datetime.now(timezone.utc)
    except Exception:
        return bool(du)


def sync_providers():
    print("[1/5] Sync providers...")
    prov = inferhub_get("/publisher/providers")
    n = 0
    with db() as c, c.cursor() as cur:
        cur.execute("DELETE FROM providers")      # C11: bersihkan provider stale (mati/hapus) — DB = mirror live
        now = datetime.now(timezone.utc)
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
                  bool(p.get("enabled")), p.get("apiKeyCheckStatus"), _du_future(p),
                  p.get("observedUsedPct"), (p.get("observedResetAt") or "")[:10],
                  float(p.get("earningsLifetimeUsdc") or 0), int(p.get("modelCount") or 0), now))
            n += 1
        c.commit()
    print(f"   providers: {n}")
    return prov


def sync_asks(prov):
    print("[2/5] Sync provider asks (per-model)...")
    asks_total = 0
    t0 = time.time()
    with db() as c, c.cursor() as cur:
        now = datetime.now(timezone.utc)
        # R14: DELETE + INSERT SATU transaksi — tidak ada window provider_asks kosong
        # antara commit sync_providers dan re-insert di sini.
        cur.execute("DELETE FROM provider_asks")  # rebuild asks tiap sync
        for i, p in enumerate(prov):
            pid = p.get("id")
            if not pid:
                continue
            try:
                asks = inferhub_get(f"/publisher/providers/{pid}/asks", timeout=15)
            except Exception:
                continue
            for m in (asks or []):
                cur.execute("""
                    INSERT INTO provider_asks (provider_id, model, model_status, ask_in, ask_out,
                        avg_price_in, avg_price_out, avg_price_requests, official_in, official_out, enabled, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (pid, m.get("upstreamModelId"), m.get("modelStatus"),
                      float(m.get("askInputPerMtok") or 0), float(m.get("askOutputPerMtok") or 0),
                      float(m.get("avgPriceIn") or 0), float(m.get("avgPriceOut") or 0),
                      int(m.get("avgPriceRequests") or 0),
                      float(m.get("officialInputPerMtok") or 0), float(m.get("officialOutputPerMtok") or 0),
                      bool(m.get("enabled")), now))
                asks_total += 1
                if (i + 1) % 25 == 0:
                    c.commit()
                    print(f"   ...{i+1}/{len(prov)} providers, {asks_total} asks ({time.time()-t0:.0f}s)")
        c.commit()
    print(f"   asks total: {asks_total} dalam {time.time()-t0:.0f}s")


def sync_usage_logs():
    print("[3/5] Sync usage logs (full paginate)...")
    rows = []
    page = 1
    t0 = time.time()
    while True:
        try:
            d = inferhub_get("/usage/logs", {"range": "all", "page": page, "pageSize": 100})
        except Exception:
            break
        if not d or not d.get("rows"):
            break
        rows.extend(d.get("rows"))
        if len(rows) >= int(d.get("total") or 0):
            break
        page += 1
        if page > 300:
            break
        if time.time() - t0 > 280:
            print("   [warn] time limit, partial")
            break
    print(f"   fetched {len(rows)} rows")
    n = 0
    now = datetime.now(timezone.utc)
    with db() as c, c.cursor() as cur:
        for r in rows:
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
            c.commit()
        c.commit()
    print(f"   inserted {n} rows")


def sync_market():
    print("[4/5] Sync market snapshot...")
    mkt = inferhub_get("/market")
    with db() as c, c.cursor() as cur:
        now = datetime.now(timezone.utc)
        for m in (mkt.get("models") or []):
            cur.execute("""
                INSERT INTO market_snapshot (slug, family, min_ask_in, max_ask_in, min_ask_out, max_ask_out, last_rate, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (slug) DO UPDATE SET family=EXCLUDED.family, min_ask_in=EXCLUDED.min_ask_in,
                  max_ask_in=EXCLUDED.max_ask_in, min_ask_out=EXCLUDED.min_ask_out, max_ask_out=EXCLUDED.max_ask_out,
                  last_rate=EXCLUDED.last_rate, synced_at=EXCLUDED.synced_at
            """, (m.get("slug"), m.get("family"), m.get("minAskIn"), m.get("maxAskIn"), m.get("minAskOut"),
                  m.get("maxAskOut"), m.get("lastRate"), now))
        c.commit()
    print(f"   market models: {len(mkt.get('models') or [])}")


def sync_catalog():
    print("[5/5] Sync catalog...")
    try:
        cat = inferhub_get("/catalog")
        with db() as c, c.cursor() as cur:
            now = datetime.now(timezone.utc)
            for u in (cat or []):
                for m in (u.get("models") or []):
                    # C12: object model live pakai 'upstreamModelId' (bukan 'slug').
                    # Fallback ke id/upstreamCatalogModelId utk keamanan.
                    slug = m.get("upstreamModelId") or m.get("id") or m.get("upstreamCatalogModelId") or m.get("slug")
                    if not slug:
                        continue
                    cur.execute("""
                        INSERT INTO catalog_models (slug, family, label, status, synced_at)
                        VALUES (%s,%s,%s,%s,%s)
                        ON CONFLICT (slug) DO UPDATE SET family=EXCLUDED.family, label=EXCLUDED.label, status=EXCLUDED.status, synced_at=EXCLUDED.synced_at
                    """, (slug, u.get("slug"), m.get("label") or slug, m.get("status") or "available", now))
            c.commit()
        print("   catalog ok")
    except Exception as e:
        print("   catalog err", e)


# ── Account/Billing/Keys cluster sync (23 endpoint domain) ──

def sync_account_cluster():
    """Sync keys, topups, budgets, budgets_aliases, combos, pricing_config ke DB."""
    now = datetime.now(timezone.utc)

    print("[A] Sync api keys...")
    try:
        keys = inferhub_get("/keys")
        with db() as c, c.cursor() as cur:
            for k in (keys or []):
                cur.execute("""
                    INSERT INTO api_keys (id, name, key_prefix, scopes, created_at, last_used_at, expires_at, replaced_by, secret, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s)
                    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, key_prefix=EXCLUDED.key_prefix,
                      scopes=EXCLUDED.scopes, created_at=EXCLUDED.created_at, last_used_at=EXCLUDED.last_used_at,
                      expires_at=EXCLUDED.expires_at, replaced_by=EXCLUDED.replaced_by, synced_at=EXCLUDED.synced_at
                """, (k.get("id"), k.get("name"), k.get("keyPrefix"),
                      ",".join(k.get("scopes") or []), k.get("createdAt"), k.get("lastUsedAt"),
                      k.get("expiresAt"), k.get("replacedById"), now))
            c.commit()
        print(f"   keys: {len(keys or [])}")
    except Exception as e:
        print("   keys err", e)

    print("[B] Sync topups...")
    try:
        topups = inferhub_get("/topups")
        with db() as c, c.cursor() as cur:
            for t in (topups or []):
                cur.execute("""
                    INSERT INTO topups (id, amount_usdc, amount_idr, payment_method, status, payment_url, topup_key, tako_transaction_id, created_at, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, payment_url=EXCLUDED.payment_url, synced_at=EXCLUDED.synced_at
                """, (t.get("id"), float(t.get("amountUsdc") or 0), int(t.get("amountIdr") or 0),
                      t.get("paymentMethod"), t.get("status"), t.get("paymentUrl"), t.get("topupKey"),
                      t.get("takoTransactionId"), t.get("createdAt"), now))
            c.commit()
        print(f"   topups: {len(topups or [])}")
    except Exception as e:
        print("   topups err", e)

    print("[C] Sync budgets...")
    try:
        budgets = inferhub_get("/budgets")
        with db() as c, c.cursor() as cur:
            cur.execute("DELETE FROM budgets")
            for b in (budgets or []):
                cur.execute("""
                    INSERT INTO budgets (upstream_catalog_model_id, prefix, upstream_model_id, upstream_label,
                        official_in, official_out, market_min_ask_in, market_min_ask_out,
                        max_input_per_mtok, max_output_per_mtok, min_discount_pct, enabled, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (b.get("upstreamCatalogModelId"), b.get("prefix"), b.get("upstreamModelId"), b.get("upstreamLabel"),
                      float(b.get("officialInputPerMtok") or 0), float(b.get("officialOutputPerMtok") or 0),
                      float(b.get("marketMinAskIn") or 0), float(b.get("marketMinAskOut") or 0),
                      to_null(b.get("maxInputPerMtok")), to_null(b.get("maxOutputPerMtok")),
                      b.get("minDiscountPct"), bool(b.get("enabled")), now))
            c.commit()
        print(f"   budgets: {len(budgets or [])}")
        # aliases
        al = inferhub_get("/budgets/aliases")
        with db() as c, c.cursor() as cur:
            cur.execute("DELETE FROM budget_aliases")
            for a in (al or []):
                cur.execute("""
                    INSERT INTO budget_aliases (alias, label, member_model_ids, member_count, min_discount_pct,
                        official_in_min, official_in_max, official_out_min, official_out_max, upstream_labels, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (a.get("alias"), a.get("label"), ",".join(a.get("memberModelIds") or []), int(a.get("memberCount") or 0),
                      a.get("minDiscountPct"), to_null_float(a.get("officialInMin")), to_null_float(a.get("officialInMax")),
                      to_null_float(a.get("officialOutMin")), to_null_float(a.get("officialOutMax")),
                      ",".join(a.get("upstreamLabels") or []), now))
            c.commit()
        print(f"   budget_aliases: {len(al or [])}")
    except Exception as e:
        print("   budgets err", e)

    print("[D] Sync combos...")
    try:
        combos = inferhub_get("/combos")
        with db() as c, c.cursor() as cur:
            cur.execute("DELETE FROM combos"); cur.execute("DELETE FROM combo_models")
            for co in (combos or []):
                cur.execute("""
                    INSERT INTO combos (id, name, slug, max_input_per_mtok, max_output_per_mtok, created_at, synced_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                """, (co.get("id"), co.get("name"), co.get("slug"),
                      to_null_float(co.get("maxInputPerMtok")), to_null_float(co.get("maxOutputPerMtok")),
                      co.get("createdAt"), now))
                for m in (co.get("members") or []):
                    cur.execute("""
                        INSERT INTO combo_models (combo_id, model_id, model, label)
                        VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING
                    """, (co.get("id"), m.get("modelId"), m.get("model"), m.get("label")))
            c.commit()
        print(f"   combos: {len(combos or [])}")
    except Exception as e:
        print("   combos err", e)

    print("[E] Sync pricing config...")
    try:
        pc = inferhub_get("/pricing/config")
        with db() as c, c.cursor() as cur:
            cur.execute("DELETE FROM pricing_config")
            cur.execute("""
                INSERT INTO pricing_config (id, max_ask_pct, platform_fee_pct, publisher_share_pct, synced_at)
                VALUES (1,%s,%s,%s,%s)
            """, (pc.get("maxAskPctOfOfficial"), pc.get("platformFeePct"), pc.get("publisherSharePct"), now))
            c.commit()
        print("   pricing_config ok")
    except Exception as e:
        print("   pricing err", e)


def to_null(v):
    try:
        return float(v)
    except Exception:
        return None


def to_null_float(v):
    try:
        return float(v)
    except Exception:
        return None


def main():
    init_db()
    t0 = time.time()
    prov = sync_providers()
    sync_asks(prov)
    sync_usage_logs()
    sync_market()
    sync_catalog()
    sync_account_cluster()  # keys/topups/budgets/combos/pricing (23-endpoint domain)
    print(f"\n✓ FULL SYNC SELESAI dalam {time.time()-t0:.0f}s")
    with db() as c, c.cursor() as cur:
        for t in ["providers", "provider_asks", "usage_logs", "market_snapshot", "catalog_models"]:
            cur.execute(f"SELECT count(*) FROM {t}")
            print(f"   {t}: {cur.fetchone()['count']}")


if __name__ == "__main__":
    main()
