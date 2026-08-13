#!/usr/bin/env python3
"""Auto-pricing algo — CodeBuddy + ClinePass + CodeBuddy.CN (per model, per upstream).

Logika FAIZ v2 (2026-08-13, REBOUND DIHAPUS):
  position tracking (wajib tiap cycle):
    total_provider   = len(asksIn) di /catalog utk model itu   (SEMUA harga / semua provider)
    provider_ok_kita = jumlah provider OK kita utk upstream tsb (/publisher/providers)
    posisi_kompetitor = total_provider - provider_ok_kita        (kita selalu tahu posisi)

  anchor komp  = /market minAskIn (kompetitor SEJATI, bukan catalog/provider sendiri)
  trigger      = official x trigger_pct   (batas "harga tidak wajar" / range trigger)

  Per model per cycle:
    our <= komp                 -> HOLD/leader  (kita sudah termurah, DIAM)
    komp <= trigger             -> IGNORE range trigger.
                                   UNDERCUT kompetitor NON-TRIGGER terendah:
                                   = harga terendah di orderbook yg MASIH di luar range trigger
                                   (level terendah di atas trigger_px), dikurangi offset.
    komp > trigger              -> UNDERCUT normal ikut komp - 0.1% x official
    our sudah ~= target         -> HOLD (jangan gerak)

Band per upstream (default, bisa di-override config tiap model):
  codebuddy    -> trigger 2%
  codebuddy-cn -> trigger 5%   (config 08-13)
  cline-pass   -> deepseek-v4-flash 10%, lainnya 20%
  (conf per model dari DEFAULT_CONFIG_FILE menang atas default)

Anti-loop / stabilitas:
  - anchor pakai /market + orderbook /catalog (bukan hanya harga diri sendiri)
  - cooldown per model (cb/cbcn=10s, cp=15s) -> tidak gerak ganda dalam 1 cycle
  - HTTP 429/timeout -> skip, jangan retry di cycle yg sama
  - atomic write utk semua state (.tmp + os.replace)
"""
import json, os, time, datetime, argparse
import urllib.request

BASE = "https://inferhub.dev/api"
DEFAULT_CONFIG_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-config.json")
INTERVAL = 30  # detik
LOG_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing.log")
STATE_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-state.json")
HOLD_STATE_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-hold.json")
PREFIX = {"codebuddy": "cb", "cline-pass": "cp", "codebuddy-cn": "cbcn"}

DEADBAND = 0.0003          # $ — kompetitor harus bergeser > ini sebelum kita reaksi
COOLDOWN_CB = 10           # detik — cb/cbcn: reaktif, nggak kebekuan lama
COOLDOWN_CP = 15           # detik — cline-pass: reaktif
UNDERCUT_PCT = 0.1         # % — undercut: kita pasang 0.1% off lbh besar dr kompetitor (pctOff + 0.1)


def load_config():
    """Baca config per upstream×model. return {(upstream, model_id): {trigger_pct, rebound_pct}}"""
    try:
        with open(DEFAULT_CONFIG_FILE) as f:
            d = json.load(f)
        out = {}
        for c in (d.get("configs") or []):
            k = (c.get("upstream"), c.get("model_id"))
            out[k] = {"trigger_pct": float(c.get("trigger_pct")), "rebound_pct": float(c.get("rebound_pct"))}
        return out
    except Exception:
        return {}


def band_for(slug, mid, conf):
    """trigger_pct & rebound_pct per slug.

    - codebuddy / codebuddy-cn: trigger 2% / rebound 10% (default stabil, bisa di-override config).
    - cline-pass: dari config per-model; default deepseek-v4-flash 10/15,
      model lain 20/25. trigger_pct utk trigger (kapan undercut), rebound_pct utk
      floor harga saat kompetitor ≤ trigger.
    """
    if conf:
        return conf["trigger_pct"] / 100.0, conf["rebound_pct"] / 100.0
    if slug == "cline-pass":
        if mid == "cline-pass/deepseek-v4-flash":
            return 0.10, 0.15
        return 0.20, 0.25
    return 0.02, 0.10  # cb / cbcn


def _atomic_write(path, obj):
    """Write JSON secara atomic: tulis ke path.tmp lalu os.replace."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def load_hold_state():
    """State HOLD per (upstream, model_id): mode (undercut/leader/hold) & ts (last PUT)."""
    try:
        with open(HOLD_STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_hold_state(state):
    try:
        _atomic_write(HOLD_STATE_FILE, state)
    except Exception:
        pass


def load_key():
    if "INFERHUB_API_KEY" in os.environ:
        return os.environ["INFERHUB_API_KEY"]
    try:
        with open(os.path.expanduser("~/.hermes-suisui/.env")) as f:
            for line in f:
                line = line.strip()
                if line.startswith("INFERHUB_API_KEY="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


def api(path, method="GET", payload=None):
    key = load_key()
    if not key:
        raise RuntimeError("no API key")
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + key,
        "User-Agent": "auto-pricing/2.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            return (r.status, json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"raw": str(e)}
        return (e.code, body)
    except Exception as ex:
        return (0, {"error": str(ex)})


def log(msg):
    line = f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def get_catalog():
    """Catalog per upstream. return {slug: {model_id: {"asksIn":[...], "officialIn": float}, ...}}"""
    st, d = api("/catalog")
    if st != 200 or not isinstance(d, list):
        return {}
    out = {}
    for u in d:
        slug = u.get("slug")
        if not slug:
            continue
        models = {}
        for m in (u.get("models") or []):
            mid = m.get("upstreamModelId")
            if not mid:
                continue
            asks = []
            for a in (m.get("asksIn") or []):
                try:
                    asks.append(round(float(a), 6))
                except Exception:
                    pass
            models[mid] = {"asksIn": asks, "officialIn": _f(m.get("officialIn"))}
        out[slug] = models
    return out


def _f(v):
    try:
        return float(v)
    except Exception:
        return 0.0


def get_asks_enabled(upstream):
    """asks utk provider enabled & apiKeyCheckStatus='ok' (bukan invalid). map model_id -> ask obj."""
    st, provs = api("/publisher/providers")
    if st != 200 or not isinstance(provs, list):
        return {}
    prov = None
    # prefer apiKeyCheckStatus='ok'; kalau tak ada, pakai enabled yg pertama (jangan hampa).
    for p in provs:
        if p.get("enabled") and p.get("upstreamSlug") == upstream \
           and p.get("apiKeyCheckStatus") == "ok":
            prov = p
            break
    if not prov:
        for p in provs:
            if p.get("enabled") and p.get("upstreamSlug") == upstream:
                prov = p
                break
    if not prov:
        return {}
    st, asks = api(f"/publisher/providers/{prov['id']}/asks")
    if st != 200 or not isinstance(asks, list):
        return {}
    out = {}
    for a in asks:
        out[a.get("upstreamCatalogModelId")] = {
            "catalog_id": a.get("upstreamCatalogModelId"),
            "model_id": a.get("upstreamModelId"),
            "slug": upstream,
            "ask_in": float(a.get("askInputPerMtok") or 0),
            "ask_out": float(a.get("askOutputPerMtok") or 0),
            "official": float(a.get("officialInputPerMtok") or 0),
            "max_ask_in": float(a.get("maxAskIn") or 0),
            "max_ask_out": float(a.get("maxAskOut") or 0),
            "enabled": bool(a.get("enabled")),
            "demand": int(a.get("avgPriceRequests") or 0),
            "cheapest_active_pct": float(a.get("cheapestActivePct") or 0),
        }
    return out


def set_ask(slug, cid, ask_in, ask_out, official=0):
    """PUT ask (tabular for upstream). Kirim pctOff (persen diskon dari official) — WAJIB.
    pctOff dihitung dari target: (1 - ask_in/official)*100, dibulatkan ke 1 desimal
    (API simpan presisi 0.1%, di bawah itu ke-bulat)."""
    if ask_in is None:
        return (0, None)
    payload = {"askInputPerMtok": str(round(ask_in, 6)), "askOutputPerMtok": str(round(ask_out, 6))}
    # kalau official tersedia, kirim pctOff (API InferHub butuh field ini utk 204)
    if official and official > 0:
        pct_off = round((1 - ask_in / official) * 100, 1)   # 1 desimal — presisi 0.1%
        # clamp ke rentang valid. Harga MAX ask 50% (pctOff >= 50). API tolak luar batas.
        pct_off = max(50, min(pct_off, 99.9))
        payload["pctOff"] = pct_off
    return api(f"/publisher/upstreams/{slug}/asks/{cid}", method="PUT", payload=payload)


def get_market_min():
    """Anchor kompetitor dari /market — minAskIn per (table-prefix/model). Kembalikan dict {(slug, model_id): minAskIn}.
    Prefix diterjemahkan utk cocokkan dgn slug scope."""
    try:
        st, d = api("/market")
        if st != 200 or not isinstance(d, dict):
            return {}
        out = {}
        for m in (d.get("models") or []):
            slug_full = m.get("slug") or ""
            min_in = m.get("minAskIn")
            if not slug_full or not min_in:
                continue
            # slug = "<prefix>/<model>"; prefix seperti cb, cp, cbcn, cx, zai. model akhir dipakai.
            parts = slug_full.split("/")
            if len(parts) < 2:
                continue
            model = parts[-1]
            pc = parts[0]
            # petakan prefix -> slug scope kita
            slug = {"cb": "codebuddy", "cp": "cline-pass", "cbcn": "codebuddy-cn"}.get(pc)
            if not slug:
                continue
            out[(slug, model)] = min_in
        return out
    except Exception:
        return {}


def get_positions(catalog):
    """POSISI KOMPETITOR per model (Faiz v2 — wajib tiap cycle).

    Dari /catalog (sudah di-fetch):
      - asksIn[] per model = harga SEMUA provider di platform utk model itu.
        total_provider = len(asksIn)  (total di semua harga)
        histogram orderbook = {price: count}
      - provider_ok_kita = jumlah provider OK kita utk upstream tsb
        (diambil dari /publisher/providers sekali per cycle).

    Return {(slug, model_id): {"total_provider", "provider_ok_kita",
                                "posisi_kompetitor", "levels"}}
    levels = sorted list of (price, qty) — semua harga, semua provider.
    """
    try:
        st, provs = api("/publisher/providers")
        ok_kita = {}
        if st == 200 and isinstance(provs, list):
            for p in provs:
                if p.get("enabled") and p.get("apiKeyCheckStatus") == "ok":
                    s = p.get("upstreamSlug")
                    ok_kita[s] = ok_kita.get(s, 0) + 1
    except Exception:
        pass

    out = {}
    # catalog struktur sebenarnya: dict keyed by slug -> dict keyed by model -> {asksIn, officialIn}
    # model key bisa bare ("deepseek-v4-flash") atau prefixed ("cline-pass/deepseek-v4-flash").
    # normalize ke bare model_id (strip sampai-akhir '/') supaya cocok dgn asks model_id.
    items_by_slug = catalog.items() if isinstance(catalog, dict) else []
    for slug, sub in items_by_slug:
        if not isinstance(sub, dict):
            continue
        for mk, m in sub.items():
            if not isinstance(m, dict):
                continue
            asks = m.get("asksIn") or []
            cnt = {}
            for price in asks:
                try:
                    p = round(float(price), 6)
                except (TypeError, ValueError):
                    continue
                if p > 0:
                    cnt[p] = cnt.get(p, 0) + 1
            total = sum(cnt.values())
            ok = ok_kita.get(slug, 0)
            mid = mk.split("/")[-1].strip().lower()
            out[(slug, mid)] = {
                "total_provider": total,
                "provider_ok_kita": ok,
                "posisi_kompetitor": max(total - ok, 0),
                "levels": sorted(cnt.items()),   # [(price, qty), ...] asc
            }
    return out


def run_cycle(dry_run=False):
    ARMED = True
    try:
        with open(os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-arm"), "r") as f:
            ARMED = f.read().strip() == "1"
    except Exception:
        ARMED = False
    effective_dry = dry_run or not ARMED

    catalog = get_catalog()
    if not catalog:
        log("WARN: /catalog kosong, skip")
        return
    config = load_config()
    hold = load_hold_state()

    scope = set(["codebuddy", "cline-pass", "codebuddy-cn"])
    for (u, _m) in config.keys():
        if u:
            scope.add(u)
    # filter scope ke upstream yg ADA di catalog & enabled-nya
    scope = {s for s in scope if s in catalog}

    decisions = []
    now = time.time()
    # anchor kompetitor DARI /market (minAskIn per slug/model) — exclude stress kita sendiri, lintas-upstream.
    market = get_market_min()
    # POSISI KOMPETITOR per model (Faiz v2) — total provider vs provider OK kita.
    positions = get_positions(catalog)

    for slug in sorted(scope):
        cooldown = COOLDOWN_CP if slug == "cline-pass" else COOLDOWN_CB
        asks = get_asks_enabled(slug)
        if not asks:
            log(f"WARN: ask {slug} kosong (sample provider?), skip")
            continue
        cat_models = catalog.get(slug, {})
        for cid, a in asks.items():
            if not a["enabled"]:
                continue
            our = a["ask_in"]
            official = a["official"]
            if official <= 0:
                official = _f(cat_models.get(a["model_id"], {}).get("officialIn")) or official
            max_in = a["max_ask_in"]
            mid = a["model_id"]

            # config key bisa bare ("deepseek-v4-flash") atau prefixed ("codebuddy-cn/deepseek-v4-flash")
            conf = config.get((slug, mid))
            if conf is None:
                conf = config.get((slug, f"{slug}/{mid}"))
            t_pct, _r_pct = band_for(slug, mid, conf)   # trigger% (rebound dihapus v2)
            hk = f"{slug}|{mid}"
            prev = hold.get(hk, {})
            prev_ts = prev.get("ts", 0)

            # ── ANTI-FLICKER (cooldown): setelah kita PUT harga, DIAM dulu.
            #    Jangan gerak lagi utk model yg sama sebelum COOLDOWN detik. ──
            if now - prev_ts < cooldown:
                decisions.append({**a, "action": "cooldown", "target": our, "comp": prev.get("comp"),
                                  "reason": f"cooldown ({now-prev_ts:.0f}/{cooldown}s) - hold"})
                continue

            # ── anchor kompetitor BERSIH & DETERMINISTIK ──
            # kompetitor = /market minAskIn (harga termurah yg tersedia utk upstream-model ini,
            #   dari platform market). catalog/asksIn = SEMUA provider (termasuk kita) → utk posisi.
            comp = market.get((slug, mid))
            if comp is None or comp <= 0:
                cap = a.get("cheapest_active_pct") or 0
                if cap > 0 and official > 0:
                    comp = round(official * (cap / 100.0), 6)
                else:
                    comp = None

            # ── POSISI KOMPETITOR (Faiz v2) ──
            # key bisa bare (cbcn) atau prefixed (cline-pass) — coba dua-duanya
            pos = positions.get((slug, mid))
            if pos is None:
                pos = positions.get((slug, mid.split("/")[-1]))
            tot_prov = pos.get("total_provider", 0) if pos else 0
            ok_kita = pos.get("provider_ok_kita", 0) if pos else 0
            pos_komp = pos.get("posisi_kompetitor", 0) if pos else 0
            levels = pos.get("levels", []) if pos else []          # [(price, qty) asc]

            # ── LOGIKA FAIZ v2 (REBOUND DIHAPUS) ──
            # trigger = official × trigger% (range "harga tidak wajar")
            # - our <= komp              → HOLD/leader (kita termurah, DIAM)
            # - komp <= trigger          → IGNORE range trigger.
            #                              UNDERCUT kompetitor NON-TRIGGER terendah
            #                              (level orderbook terendah yang masih DI ATAS trigger_px),
            #                              minus offset. Fokus di range non-trigger.
            # - komp > trigger           → UNDERCUT normal ikut komp − 0.1% official
            offset = official * 0.001  # 0.1% dari official price
            trigger_px = round(official * t_pct, 6)

            # ===== LOGIKA FAIZ v3 AKHIR (REBOUND DIHAPUS, trigger = batas ABAIKAN) =====
            # trigger_px = official x trigger%  (batas "harga tidak wajar" / range trigger)
            #   kompetitor ≤ trigger  → kita ABAIKAN mereka (cuekin, jangan balas ke range trigger)
            #   kompetitor > trigger  → kompetitor wajar, kita undercut 0.1% di bawah mereka
            # UNDERCUT = 0.1% DI BAWAH kompetitor NON-TRIGGER (bukan dari official!).
            #   - scan orderbook: level terendah yang MASIH di atas trigger (non-trigger / harga wajar)
            #   - kita pasang 0.1% lebih murah dari level non-trigger terendah itu
            #   - harga kita tidak pernah masuk ke range trigger (jual di range non-trigger)
            offset = official * 0.001  # 0.1% dari official price (undercut gap)
            trigger_px = round(official * t_pct, 6)

            # ── SELF-CORRECT NAIK (jangan biarkan harga kita di range trigger / tembus) ──
            # kalau our < trigger_px (harga kita terdampar di range trigger dari logika lama),
            # NAIKKAN ke level non-trigger terendah kompetitor (− 0.1%). Ini koreksi atas trigger
            # 5%: harga kita TIDAK boleh di range trigger.
            if our < trigger_px - 1e-9:
                nontrig_up = [p for p, _q in levels if p > trigger_px and abs(p - our) > 1e-6]
                if nontrig_up:
                    up_target = max(round(nontrig_up[0] - offset, 6), trigger_px)
                    if max_in > 0:
                        up_target = min(up_target, max_in)
                    up_target = max(0.0, round(up_target, 6))
                    if abs(up_target - our) > 0.5e-4:
                        # PUT naik ke range non-trigger
                        if effective_dry:
                            log(f"  [{slug}] {mid}: SELF-CORRECT-UP our=${our:.4f}<floor ${trigger_px:.4f} -> ${up_target:.4f} [DRY]")
                            decisions.append({**a, "action": "self_up", "target": up_target, "comp": comp,
                                              "reason": f"self-correct naik dr ${our:.4f} (dalam trigger) ke ${up_target:.4f} (non-trigger) | posisi komp {pos_komp}"})
                            continue
                        st, res = set_ask(slug, cid, up_target, a["ask_out"], official=official)
                        status = "OK" if st in (200, 204) else f"HTTP{st}"
                        log(f"  [{slug}] {mid}: SELF-CORRECT-UP our=${our:.4f}<floor ${trigger_px:.4f} -> ${up_target:.4f} [{status}]")
                        if st in (200, 204):
                            hold[hk] = {"mode": "self_up", "our": up_target, "comp": comp, "ts": now}
                            decisions.append({**a, "action": "self_up", "target": up_target, "comp": comp,
                                              "reason": f"self-correct naik ke ${up_target:.4f} (non-trigger)", "http": st})
                        elif st in (429, 0):
                            decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip", "http": st})
                        else:
                            decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip", "http": st})
                        continue
                    # sudah di floor? lanjut ke logika bawah
                # tidak ada level non-trigger utk naik → diam (biarkan)

            # kalau kita SUDAH lebih murah / setara kompetitor (our <= comp) → DIAM.
            if comp is None or our <= comp + 1e-6:
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": now}
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"kita ≤ kompetitor (our ${our:.4f} ≤ comp ${comp or 0:.4f}) - diam/leader | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})"})
                continue

            # cari level orderbook NON-TRIGGER terendah (harga wajar paling murah)
            # kompetitor di range trigger diabaikan — fokus di range non-trigger.
            # PENTING: exclude harga kita sendiri (our) — jangan undercut diri sendiri.
            nontrig_prices = [p for p, _q in levels if p > trigger_px and abs(p - our) > 1e-6]
            if not nontrig_prices:
                # tidak ada level non-trigger selain kita → jangan turun, diam di harga kita
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": now}
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"komp ${comp:.4f} di trigger ${trigger_px:.4f}; tdk ada level non-trigger kompetitor utk diundercut, hold di ${our:.4f} | posisi komp {pos_komp}"})
                continue

            # undias acuan = level NON-TRIGGER terendah; kita undias 0.1% di bawahnya
            ref_price = nontrig_prices[0]
            target = round(ref_price - offset, 6)
            # jangan pernah masuk ke range trigger
            target = max(target, trigger_px)
            # jangan melebihi max slot harga (max_in)
            if max_in > 0:
                target = min(target, max_in)
            target = max(0.0, round(target, 6))
            if abs(target - our) <= 0.5e-4:
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": now}
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"already at ${our:.4f} (non-trigger low ${ref_price:.4f} - 0.1%) - hold | posisi komp {pos_komp}"})
                continue
            action = "undercut"

            if effective_dry:
                log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} trigger=${trigger_px:.4f} -> undercut non-trigger ${ref_price:.4f}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{'DRY' if not ARMED else 'ARMED'}]")
                decisions.append({**a, "action": action, "target": target, "comp": comp,
                                  "reason": f"undercut 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})"})
                continue
            st, res = set_ask(slug, cid, target, a["ask_out"], official=official)
            status = "OK" if st in (200, 204) else f"HTTP{st}"
            log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} -> undercut non-trigger ${ref_price:.4f}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{status}]")
            if st in (200, 204):
                hold[hk] = {"mode": action, "our": target, "comp": comp, "ts": now}
                decisions.append({**a, "action": action, "target": target, "comp": comp,
                                  "reason": f"undercut 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})", "http": st})
            elif st in (429, 0):
                log(f"  !! [{slug}] {mid}: {status} (429/timeout) — skip, no retry this cycle")
                decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip", "http": st})
            else:
                log(f"  !! [{slug}] {mid}: {status} — skip, no retry this cycle")
                decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip", "http": st})
            continue

    save_hold_state(hold)
    n_lead = sum(1 for d in decisions if d["action"] == "leader")
    n_und = sum(1 for d in decisions if d["action"] in ("undercut", "undercut_floor"))
    n_hold = sum(1 for d in decisions if d["action"] in ("hold", "stable"))
    n_cd = sum(1 for d in decisions if d["action"] == "cooldown")
    n_stable = sum(1 for d in decisions if d["action"] == "stable")
    n_err = sum(1 for d in decisions if d["action"] == "error")
    log(f"cycle done: {len(decisions)} model, {n_lead} leader, {n_und} undercut, {n_hold} hold, {n_cd} cooldown, {n_stable} stable, {n_err} error")

    try:
        _atomic_write(STATE_FILE, {"ts": datetime.datetime.now().isoformat(), "cycles": decisions})
    except Exception:
        pass
    return n_und


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--interval", type=int, default=INTERVAL)
    args = ap.parse_args()

    if args.dry_run:
        log("AUTO-PRICING DRY-RUN (no PUT)")
        run_cycle(dry_run=True)
        return
    if args.once:
        log("AUTO-PRICING once")
        run_cycle()
        return
    log(f"AUTO-PRICING daemon start (interval {args.interval}s)")
    while True:
        try:
            run_cycle()
        except Exception as e:
            log(f"ERROR cycle: {e}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
