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
import json, os, time, datetime, argparse, threading
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
_refresh_lock = threading.Lock()
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


def api(path, method="GET", payload=None, _retries=0):
    """HTTP ke InferHub. 429 rate-limit -> sleep retryAfter + retry (max 2).
    REV6: rate limit 30 req/min — tanpa retry, 429 bikin catalog kosong -> cycle 0."""
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
        # 429 rate-limit: tunggu retryAfter lalu retry (sekali lagi)
        if e.code == 429 and _retries < 2:
            wait = 5
            if isinstance(body, dict):
                ra = (body.get("error") or {}).get("retryAfter") if isinstance(body.get("error"), dict) else None
                if ra:
                    wait = int(ra)
            time.sleep(min(wait, 30))
            return api(path, method, payload, _retries + 1)
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


# REV6: cache catalog + market TTL 120s — anchor tidak perlu fetch tiap cycle
# (rate limit 30 req/min). Cycle lain pakai cache → request/cycle turun drastis.
_CATALOG_CACHE = {"ts": 0, "data": {}}
_MARKET_CACHE = {"ts": 0, "data": {}}
_ANCHOR_TTL = 120


def get_catalog(use_cache=True):
    """Catalog per upstream. return {slug: {model_id: {"asksIn":[...], "officialIn": float}, ...}}"""
    if use_cache and time.time() - _CATALOG_CACHE["ts"] < _ANCHOR_TTL:
        return _CATALOG_CACHE["data"]
    st, d = api("/catalog")
    if st != 200 or not isinstance(d, list):
        return _CATALOG_CACHE["data"] if _CATALOG_CACHE["data"] else {}
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
    _CATALOG_CACHE["ts"] = time.time()
    _CATALOG_CACHE["data"] = out
    return out


def _f(v):
    try:
        return float(v)
    except Exception:
        return 0.0

# Cache asks per upstream — REV6 (fix cycle 12-14 menit): fetch asks per-provider
# (cb 176+ provider) tiap cycle ~700-900 HTTP serial. TTL 90s: cycle kedua+
# pakai cache → cycle < 60s (interval daemon 60s benar-benar 1 menit).
_ASKS_CACHE = {}
_ASKS_CACHE_TTL = 300
_PROVIDERS_CACHE = {"ts": 0, "data": []}
_PROVIDERS_TTL = 60


def _fetch_asks_full(upstream):
    """Fetch asks untuk upstream (dari providers yg sudah di-cache)."""
    provs = _get_providers_cached()
    if not provs:
        return {}
    picks = []
    for p in provs:
        if p.get("enabled") and p.get("upstreamSlug") == upstream \
           and p.get("apiKeyCheckStatus") == "ok":
            picks.append(p)
    if not picks:
        for p in provs:
            if p.get("enabled") and p.get("upstreamSlug") == upstream:
                picks.append(p); break
    if not picks:
        return {}
    if len(picks) > 3:
        picks = picks[:3]
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
                continue
            out[mid] = {
                "catalog_id": mid, "model_id": a.get("upstreamModelId"),
                "slug": upstream, "ask_in": ask_in,
                "ask_out": float(a.get("askOutputPerMtok") or 0),
                "official": float(a.get("officialInputPerMtok") or 0),
                "max_ask_in": float(a.get("maxAskIn") or 0),
                "max_ask_out": float(a.get("maxAskOut") or 0),
                "enabled": bool(a.get("enabled")),
                "demand": int(a.get("avgPriceRequests") or 0),
                "cheapest_active_pct": float(a.get("cheapestActivePct") or 0),
            }
    return out

def _refresh_asks(upstream):
    """Background refresh utk cache asks — dipanggil saat cache miss.
    Lock biar 1 refresh/upstream pada satu waktu."""
    with _refresh_lock:
        # double-check: cache mungkin sudah segar setelah lock
        cur = _ASKS_CACHE.get(upstream)
        if cur and time.time() - cur["ts"] < _ASKS_CACHE_TTL:
            return
        try:
            out = _fetch_asks_full(upstream)
            if out:
                _ASKS_CACHE[upstream] = {"ts": time.time(), "data": out}
        except Exception as e:
            log(f"WARN _refresh_asks({upstream}): {e}")

def _get_providers_cached():
    """Fetch /publisher/providers TIDAK lebih dari 1x per _PROVIDERS_TTL.
    P1: 4x per cycle (3x get_asks_enabled + 1x get_positions) buang-buat 250KB."""
    if time.time() - _PROVIDERS_CACHE["ts"] < _PROVIDERS_TTL and _PROVIDERS_CACHE["data"]:
        return _PROVIDERS_CACHE["data"]
    st, provs = api("/publisher/providers")
    if st == 200 and isinstance(provs, list):
        _PROVIDERS_CACHE["ts"] = time.time()
        _PROVIDERS_CACHE["data"] = provs
        return provs
    return _PROVIDERS_CACHE["data"] or []  # fallback data lama


def get_asks_enabled(upstream, use_cache=True):
    """asks utk SEMUA provider enabled & apiKeyCheckStatus='ok' (bukan invalid).
    R16b: iterasi semua provider upstream (bukan cuma 1) — merge ke satu map
    model_id -> ask obj; konflik harga: pilih ask_in TERENDAH (paling kompetitif)."""
    if use_cache:
        hit = _ASKS_CACHE.get(upstream)
        if hit and time.time() - hit["ts"] < _ASKS_CACHE_TTL:
            return hit["data"]
        old = _ASKS_CACHE.get(upstream, {}).get("data")
        if old:
            threading.Thread(target=_refresh_asks, args=(upstream,), daemon=True).start()
            return old
    # Cold start: fetch sync (cycle pertama lambat)
    provs = _get_providers_cached()
    if not provs:
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
    # REV6: SAMPLE max 3 provider/upstream utk data ask (bukan SEMUA 176+) —
    # cukup utk our_price (harga terendah dari sample) + official + max_ask_in utk PUT.
    # Anchor kompetitor (market) & orderbook (catalog) TIDAK terpengaruh (full-fetch).
    if len(picks) > 3:
        picks = picks[:3]
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
    _ASKS_CACHE[upstream] = {"ts": time.time(), "data": out}
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
        pct_off = round((1 - ask_in / official) * 100, 1)
        payload["pctOff"] = pct_off
    else:
        # official tak diketahui → pctOff tak bisa dihitung; return 422 langsung
        # tanpa PUT ke API (AP-3). Ini menghindari 422 membingungkan dari API.
        log(f"WARN set_ask({cid}): official=0, pctOff tak dihitung — skip PUT (422)")
        return (422, {"error": "official=0, pctOff undefined"})
    return api(f"/publisher/upstreams/{slug}/asks/{cid}", method="PUT", payload=payload)


def get_market_min(use_cache=True):
    """Anchor kompetitor dari /market — minAskIn per (table-prefix/model). Kembalikan dict {(slug, model_id): minAskIn}.
    Prefix diterjemahkan utk cocokkan dgn slug scope. Cache TTL 120s (rate limit)."""
    if use_cache and time.time() - _MARKET_CACHE["ts"] < _ANCHOR_TTL:
        return _MARKET_CACHE["data"]
    try:
        st, d = api("/market")
        if st != 200 or not isinstance(d, dict):
            return _MARKET_CACHE["data"] if _MARKET_CACHE["data"] else {}
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
        _MARKET_CACHE["ts"] = time.time()
        _MARKET_CACHE["data"] = out
        return out
    except Exception:
        return _MARKET_CACHE["data"] if _MARKET_CACHE["data"] else {}


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
        provs = _get_providers_cached()
        ok_kita = {}
        if provs:
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
            # REV5 FIX: kita publish 1 ask per model (sample provider dari
            # get_asks_enabled) — BUKAN ok (jumlah provider upstream, bisa 40+).
            # remaining=ok salah: kurangi 40 dari orderbook yg cuma 6 ask →
            # semua level habis → levels kosong → resume mati ("nggak balik").
            remaining = 1
            comp_levels = []
            for p, q in sorted(cnt.items()):
                # kurangi ask kita (1) di level harga kita dulu
                if our_level is not None and abs(p - our_level) <= 1e-6 and remaining > 0:
                    take = min(q, remaining)
                    q_after = q - take
                    remaining -= take
                else:
                    q_after = q
                if q_after > 0:
                    comp_levels.append((p, q_after))
            # kalau ask kita tidak ada di orderbook (our_level tak match level mana pun),
            # jangan kurangi level kompetitor lain — ask kita bukan di orderbook itu.
            # levels = cnt penuh (kompetitor murni semua).
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
    _asks_snapshot = {}  # REV6: reuse hasil get_asks_enabled per cycle (1x fetch per upstream)
    for s in sorted(scope):
        asks_s = get_asks_enabled(s)
        _asks_snapshot[s] = asks_s
        for cid_s, a_s in asks_s.items():
            our_price[(s, a_s["model_id"])] = a_s["ask_in"]
    # POSISI KOMPETITOR per model (Faiz v2) — total provider vs provider OK kita.
    positions = get_positions(catalog, our_price=our_price)

    for slug in sorted(scope):
        cooldown = COOLDOWN_CP if slug == "cline-pass" else COOLDOWN_CB
        asks = _asks_snapshot.get(slug) or get_asks_enabled(slug)
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
            # cari level orderbook NON-TRIGGER (kompetitor wajar, > trigger_px, bukan kita)
            nontrig_prices = [p for p, _q in levels if p > trigger_px and abs(p - our) > 1e-6]
            # REV5: RESUME — kalau kompetitor wajar CUMAN di ATAS kita (kita yang
            # termurah di range wajar) DAN di level harga kita TIDAK ada kompetitor
            # lain (qty di level our sudah 0 setelah ask kita dikurangi), naik jemput
            # level wajar terendah di atas. Kalau masih ada kompetitor di level kita
            # -> jangan resume (kita masih bersaing di level itu). Persis permintaan user.
            nontrig_above = [p for p in nontrig_prices if p > our + 1e-6]
            nontrig_below = [p for p in nontrig_prices if p < our - 1e-6]
            # apakah masih ada kompetitor murni DI level harga kita (qty > 0 di our)?
            our_level_qty = 0
            for p, q in levels:
                if abs(p - our) <= 1e-6:
                    our_level_qty = q
                    break
            if not nontrig_below and nontrig_above and our_level_qty <= 0:
                # tidak ada kompetitor wajar di bawah & level kita kosong -> RESUME ke atas
                ref_price = min(nontrig_above)
                target = round(ref_price - offset, 6)
                if max_in > 0:
                    target = min(target, max_in)
                target = max(0.0, round(target, 6))
                if abs(target - our) <= 0.5e-4:
                    hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
                    decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                      "reason": f"already at ${our:.4f} (resume target ${target:.4f} ≈ our) - hold"})
                    continue
                if effective_dry:
                    log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} -> resume non-trigger ${ref_price:.4f}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{'DRY' if not ARMED else 'ARMED'}]")
                    decisions.append({**a, "action": "resume", "target": target, "comp": comp,
                                      "reason": f"resume 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} (kompetitor wajar di atas kita, level kita kosong) | posisi komp {pos_komp}"})
                    continue
                st, res = set_ask(slug, cid, target, a["ask_out"], official=official)
                status = "OK" if st in (200, 204) else f"HTTP{st}"
                log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} -> resume non-trigger ${ref_price:.4f}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{status}]")
                if st in (200, 204):
                    hold[hk] = {"mode": "resume", "our": target, "comp": comp, "ts": now}
                    hold[hk].pop("skip_until", None)
                    decisions.append({**a, "action": "resume", "target": target, "comp": comp,
                                      "reason": f"resume 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} (kompetitor wajar di atas kita) | posisi komp {pos_komp}", "http": st})
                elif st in (429, 0):
                    hold[hk] = {"mode": "backoff", "our": our, "comp": comp, "ts": prev_ts,
                                "skip_until": now + BACKOFF}
                    log(f"  !! [{slug}] {mid}: {status} (429/timeout) — skip + backoff {BACKOFF}s")
                    decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip + backoff", "http": st})
                else:
                    decisions.append({**a, "action": "error", "target": our, "comp": comp, "reason": f"{status} — skip", "http": st})
                continue
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
