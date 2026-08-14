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
try:
    import psycopg
except Exception:
    psycopg = None


BASE = "https://inferhub.dev/api"
DEFAULT_CONFIG_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-config.json")
INTERVAL = 30  # detik
LOG_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing.log")
STATE_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-state.json")
HOLD_STATE_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-hold.json")
PREFIX = {"codebuddy": "cb", "cline-pass": "cp", "codebuddy-cn": "cbcn"}

BACKOFF = 180  # detik — kalau PUT kena 429/timeout, skip model itu selama ini (AP-6)

DEADBAND = 0.0003          # $ — kompetitor harus bergeser > ini sebelum kita reaksi
COOLDOWN_CB = 10           # detik — cb/cbcn: reaktif, nggak kebekuan lama
COOLDOWN_CP = 15           # detik — cline-pass: reaktif
UNDERCUT_PCT = 0.1         # % — undercut: kita pasang 0.1% off lbh besar dr kompetitor (pctOff + 0.1)


DB_DSN = os.environ.get("UPSTREAM_DB", "postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream")


def _load_config_db():
    """Baca config dari tabel PostgreSQL auto_pricing_config
    (id, upstream, model_id, trigger_pct, rebound_pct, updated_at).
    return {(upstream, model_id): {trigger_pct, rebound_pct}};
    None kalau DB error / tak tersedia, {} kalau tabel kosong."""
    if not psycopg:
        return None
    try:
        with psycopg.connect(DB_DSN, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT upstream, model_id, trigger_pct, rebound_pct FROM auto_pricing_config")
                rows = cur.fetchall()
        if not rows:
            return {}
        out = {}
        for upstream, model_id, trigger_pct, rebound_pct in rows:
            out[(upstream, model_id)] = {
                "trigger_pct": float(trigger_pct or 0),
                "rebound_pct": float(rebound_pct or 0),
            }
        return out
    except Exception:
        return None


def load_config():
    """Baca config per upstream×model. return {(upstream, model_id): {trigger_pct, rebound_pct}}.
    C6 — source of truth = DB PostgreSQL (auto_pricing_config), fallback ke file JSON lama
    (DEFAULT_CONFIG_FILE), lalu default band (band_for). Prioritas: DB > file > default."""
    d = _load_config_db()
    if d:
        return d  # DB punya data → source of truth
    # DB error / kosong → fallback file JSON (tetap kompatibel)
    try:
        with open(DEFAULT_CONFIG_FILE) as f:
            dj = json.load(f)
        out = {}
        for c in (dj.get("configs") or []):
            k = (c.get("upstream"), c.get("model_id"))
            out[k] = {"trigger_pct": float(c.get("trigger_pct")), "rebound_pct": float(c.get("rebound_pct"))}
        return out
    except Exception:
        return {}


def band_for(slug, mid, conf):
    """trigger_pct per model — SATU-SATUNYA sumber: config DB (auto_pricing_config).
    REBOUND DIHAPUS (nilai rebound_pct hanya kompatibilitas config lama, tak dipakai).
    Fallback default 10% utk SEMUA upstream — seragam, tidak ada beda per-upstream
    di kode (perbedaan band murni dari DB config, bukan dari percabangan kode)."""
    if conf:
        return conf["trigger_pct"] / 100.0, conf["rebound_pct"] / 100.0
    return 0.10, 0.10  # default seragam semua upstream (DB menang kalau ada config)
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
    """asks utk SEMUA provider enabled & apiKeyCheckStatus='ok' (bukan invalid).
    R16b: iterasi semua provider upstream (bukan cuma 1) — merge ke satu map
    model_id -> ask obj; konflik harga: pilih ask_in TERENDAH (paling kompetitif)."""
    st, provs = api("/publisher/providers")
    if st != 200 or not isinstance(provs, list):
        return {}
    picks = []
    for p in provs:
        if p.get("enabled") and p.get("upstreamSlug") == upstream \
           and p.get("apiKeyCheckStatus") == "ok":
            picks.append(p)
    if not picks:
        # fallback: enabled yg pertama (jangan hampa)
        for p in provs:
            if p.get("enabled") and p.get("upstreamSlug") == upstream:
                picks.append(p)
                break
    if not picks:
        return {}
    out = {}
    for prov in picks:
        st, asks = api(f"/publisher/providers/{prov['id']}/asks")
        if st != 200 or not isinstance(asks, list):
            continue
        for a in asks:
            mid = a.get("upstreamCatalogModelId")
            ask_in = float(a.get("askInputPerMtok") or 0)
            cur = out.get(mid)
            if cur is not None and ask_in >= cur.get("ask_in", 0):
                continue  # pertahankan harga terendah
            out[mid] = {
                "catalog_id": mid,
                "model_id": a.get("upstreamModelId"),
                "slug": upstream,
                "ask_in": ask_in,
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
    (API simpan presisi 0.1%, di bawah itu ke-bulat). API InferHub mensyaratkan pctOff;
    kalau official tak diketahui (0), kita tak bisa hitung pctOff → return 422 langsung
    tanpa PUT ke API, biar tidak ada 422 membingungkan (AP-3)."""
    if ask_in is None:
        return (0, None)
    payload = {"askInputPerMtok": str(round(ask_in, 6)), "askOutputPerMtok": str(round(ask_out, 6))}
    if official and official > 0:
        pct_off = round((1 - ask_in / official) * 100, 1)   # 1 desimal — presisi 0.1%
        # clamp ke rentang valid. Harga MAX ask 50% (pctOff >= 50). API tolak luar batas.
        pct_off = max(50, min(pct_off, 99.9))
        payload["pctOff"] = pct_off
    else:
        # official tak diketahui → pctOff tak bisa dihitung; return 422 langsung
        # tanpa PUT ke API (AP-3). Ini menghindari 422 membingungkan dari API.
        log(f"WARN set_ask({cid}): official=0, pctOff tak dihitung — skip PUT (422)")
        return (422, {"error": "official=0, pctOff undefined"})
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


def get_positions(catalog, our_price=None):
    """POSISI KOMPETITOR per model (Faiz v2 — wajib tiap cycle).

    Dari /catalog (sudah di-fetch):
      - asksIn[] per model = harga SEMUA provider di platform utk model itu.
        total_provider = len(asksIn)  (total di semua harga)
        histogram orderbook = {price: count}
      - provider_ok_kita = jumlah provider KITA utk upstream tsb
        (SEMUA provider dgn upstreamSlug==upstream DAN enabled==True,
        baik apiKeyCheckStatus 'ok' maupun 'invalid' — keduanya menerbitkan
        ask di orderbook, jadi keduanya harus dikurangi dari histogram.
        C7: jangan filter apiKeyCheckStatus di sini).
      - our_price: {(slug, model_id): harga ask kita aktual} — mengurangi ask
        kita di LEVEL HARGA KITA (bukan level terendah), supaya ask kita sendiri
        tidak dianggap kompetitor. Ini anti "mengejar diri sendiri": kita berhenti
        turun saat kita benar2 termurah (level ask kita dikurangi dari orderbook).
        Kompetitor NYATA di bawah kita tetap di orderbook → tetap diundercut.

    Return {(slug, model_id): {"total_provider", "provider_ok_kita",
                                "posisi_kompetitor", "levels"}}
    levels = sorted list of (price, qty) — kompetitor MURNI.
    """
    try:
        st, provs = api("/publisher/providers")
        ok_kita = {}
        if st == 200 and isinstance(provs, list):
            for p in provs:
                if p.get("enabled") and p.get("upstreamSlug"):
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

            # ── FIX (permintaan Faiz): scan orderbook, KURANGI ask kita sendiri
            # di LEVEL HARGA KITA (our_price) — bukan dari level terendah.
            # Kalau ask kita di 0.61 dan ada kompetitor 0.605, kita kurangi qty
            # di 0.61 (ask kita) sehingga 0.605 tetap jadi kompetitor murni.
            # Tanpa ini, ask kita sendiri dianggap kompetitor → "mengejar diri
            # sendiri" → turun terus walau sudah termurah.
            our_level = None
            if our_price:
                op = our_price.get((slug, mid))
                if op is None:
                    op = our_price.get((slug, f"{slug}/{mid}"))
                if op:
                    our_level = round(float(op), 6)
            remaining = ok
            comp_levels = []
            for p, q in sorted(cnt.items()):
                # kurangi ask kita di level harga kita dulu (sisa di level itu)
                if our_level is not None and abs(p - our_level) <= 1e-6 and remaining > 0:
                    take = min(q, remaining)
                    q_after = q - take
                    remaining -= take
                else:
                    q_after = q
                if q_after > 0:
                    comp_levels.append((p, q_after))
            # kalau masih ada sisa ask kita (harga kita beda dari orderbook),
            # kurangi dari level terendah sisanya (fallback)
            if remaining > 0:
                comp_levels = []
                rem2 = ok
                for p, q in sorted(cnt.items()):
                    take = min(q, rem2)
                    q_after = q - take
                    rem2 -= take
                    if q_after > 0:
                        comp_levels.append((p, q_after))
            out[(slug, mid)] = {
                "total_provider": total,
                "provider_ok_kita": ok,
                "posisi_kompetitor": max(total - ok, 0),
                # levels = orderbook KOMPETITOR murni (ask kita sudah dikurangi)
                "levels": comp_levels,
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
    # kumpulkan harga ask kita per model (dari sample provider tiap upstream)
    # utk mengurangi ask kita di level harga kita (anti "mengejar diri sendiri")
    our_price = {}
    for s in sorted(scope):
        asks_s = get_asks_enabled(s)
        for cid_s, a_s in asks_s.items():
            our_price[(s, a_s["model_id"])] = a_s["ask_in"]
    # POSISI KOMPETITOR per model (Faiz v2) — total provider vs provider OK kita.
    positions = get_positions(catalog, our_price=our_price)

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

            # ── BACKOFF (AP-6): kalau PUT kena 429/timeout di cycle lalu, skip
            #    model ini sampai skip_until lewat — tanpa PUT. Reset otomatis. ──
            skip_until = prev.get("skip_until", 0)
            if now < skip_until:
                remain = int(skip_until - now)
                # R16a: comp belum di-assign di branch ini (di-assign L500) — pakai prev
                decisions.append({**a, "action": "backoff", "target": our, "comp": prev.get("comp", 0),
                                  "reason": f"backoff ({remain}s tersisa, 429/timeout sblmnya) - skip PUT"})
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
            levels = pos.get("levels", []) if pos else []          # [(price, qty) asc] — KOMPETITOR MURNI (ask kita sudah dikurangi)


            # ── FIX (permintaan Faiz): anchor kompetitor TIDAK BOLEH = ask kita sendiri.
            # /market minAskIn bisa jadi harga ask KITA (kita yang termurah) → kalau dipakai
            # sebagai "comp", kita malah undercut diri sendiri. Solusi: kalau comp <= our
            # DAN comp ~= our (dalam deadband — berarti itu ask kita), pakai level
            # kompetitor MURNI terendah dari orderbook yang sudah dikurangi ask kita.
            # Kalau comp JAUH di bawah our (> deadband), itu kompetitor sejati yang murah —
            # JANGAN null-kan (nanti diproses: ≤ trigger → abaikan / > trigger → undercut).
            if comp is not None and our > 0 and abs(comp - our) <= 1e-4:
                comp_levels_real = [p for p, _q in levels if p > 0]
                if comp_levels_real:
                    # level kompetitor murni TERENDAH yang > our (di atas kita)
                    above = [p for p in comp_levels_real if p > our + 1e-6]
                    if above:
                        comp = round(min(above), 6)
                    else:
                        # semua kompetitor murni ≤ our → kita leader
                        comp = None
                else:
                    # tidak ada kompetitor murni → kita sendiri di market → leader
                    comp = None

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

            # ── LOGIKA FAIZ v4 (MURNI — sesuai permintaan): trigger = harga BATAS.
            #   kompetitor yang MELEWATI batas (≤ trigger) → ABAIKAN, jangan diladenin.
            #   kompetitor di LUAR batas (> trigger) → kita undias 0.1% di bawahnya.
            #   TIDAK ADA self-correct. TIDAK ada naikin harga ke batas.
            #   Kalau kita lebih murah dari semua kompetitor wajar → DIAM (leader).
            #   Kalau tidak ada kompetitor wajar sama sekali → DIAM di harga kita.

            # kalau kita SUDAH lebih murah / setara kompetitor (our <= comp) → DIAM.
            if comp is None or our <= comp + 1e-6:
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"kita ≤ kompetitor (our ${our:.4f} ≤ comp ${comp or 0:.4f}) - diam/leader | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})"})
                continue

            # ── Kompetitor di DALAM batas (≤ trigger) TIDAK jadi target undercut.
            # TAPI jangan langsung hold: tetap cek level orderbook NON-TRIGGER di bawah.
            # Kalau ada kompetitor wajar (> trigger) yang lebih murah dari kita,
            # kita undias level itu. (Anchor minAskIn di trigger ≠ tidak ada target wajar.)

            # cari level orderbook NON-TRIGGER terendah (harga wajar paling murah)
            # kompetitor di range trigger diabaikan — fokus di range non-trigger.
            # PENTING: exclude harga kita sendiri (our) — jangan undercut diri sendiri.
            nontrig_prices = [p for p, _q in levels if p > trigger_px and abs(p - our) > 1e-6]
            if not nontrig_prices:
                # tidak ada level non-trigger selain kita → jangan turun, diam di harga kita
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"komp ${comp:.4f} di trigger ${trigger_px:.4f}; tdk ada level non-trigger kompetitor utk diundercut, hold di ${our:.4f} | posisi komp {pos_komp}"})
                continue

            # acuan = level NON-TRIGGER terendah di orderbook
            ref_price = nontrig_prices[0]
            target = round(ref_price - offset, 6)
            # jangan pernah masuk ke range trigger
            target = max(target, trigger_px)
            # jangan melebihi max slot harga (max_in)
            if max_in > 0:
                target = min(target, max_in)
            target = max(0.0, round(target, 6))
            if abs(target - our) <= 0.5e-4:
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"already at ${our:.4f} (non-trigger low ${ref_price:.4f} - 0.1%) - hold | posisi komp {pos_komp}"})
                continue
            # arah: turun = undercut; naik = jemput kompetitor (resume) —
            # kalau hanya kita di harga itu, kita naik ke level kompetitor di atas.
            action = "undercut" if target < our else "resume"

            if effective_dry:
                log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} trigger=${trigger_px:.4f} -> {action} non-trigger ${ref_price:.4f}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{'DRY' if not ARMED else 'ARMED'}]")
                decisions.append({**a, "action": action, "target": target, "comp": comp,
                                  "reason": f"{action} 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})"})
                continue
            st, res = set_ask(slug, cid, target, a["ask_out"], official=official)
            status = "OK" if st in (200, 204) else f"HTTP{st}"
            log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} -> {action} non-trigger ${ref_price:.4f}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{status}]")
            if st in (200, 204):
                hold[hk] = {"mode": action, "our": target, "comp": comp, "ts": now}
                # AP-6: sukses → reset backoff (buang skip_until)
                hold[hk].pop("skip_until", None)
                decisions.append({**a, "action": action, "target": target, "comp": comp,
                                  "reason": f"{action} 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})", "http": st})
            elif st in (429, 0):
                # AP-6: 429/timeout → backoff: skip model ini selama BACKOFF detik
                hold[hk] = {"mode": "backoff", "our": our, "comp": comp, "ts": prev_ts,
                            "skip_until": now + BACKOFF}
                log(f"  !! [{slug}] {mid}: {status} (429/timeout) — skip + backoff {BACKOFF}s")
                decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip + backoff", "http": st})
            else:
                log(f"  !! [{slug}] {mid}: {status} — skip, no retry this cycle")
                decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip", "http": st})
            continue

    save_hold_state(hold)
    n_lead = sum(1 for d in decisions if d["action"] == "leader")
    n_und = sum(1 for d in decisions if d["action"] in ("undercut", "undercut_floor", "resume"))
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
