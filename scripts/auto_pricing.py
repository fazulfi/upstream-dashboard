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
import json, os, time, datetime, argparse, threading, uuid, errno
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
PID_LOCK_FILE = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing.pid")
DELAYED_DATA_SECONDS = 120


def new_cycle_id():
    return str(uuid.uuid4())


def new_event_id():
    return str(uuid.uuid4())


def orderbook_is_delayed(observed_at, now=None, threshold=DELAYED_DATA_SECONDS):
    if observed_at is None:
        return True
    return (time.time() if now is None else now) - float(observed_at) >= threshold


def acquire_pid_lock(path=PID_LOCK_FILE, pid=None, is_alive=None):
    pid = os.getpid() if pid is None else int(pid)
    is_alive = (lambda value: _pid_is_alive(value)) if is_alive is None else is_alive
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for _ in range(2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w") as lock:
                lock.write(str(pid) + "\n")
                lock.flush()
                os.fsync(lock.fileno())
            return True
        except FileExistsError:
            try:
                with open(path) as lock:
                    owner = int(lock.read().strip())
            except (OSError, ValueError):
                owner = None
            if owner and is_alive(owner):
                return False
            try:
                os.unlink(path)
            except FileNotFoundError:
                continue
    return False


def _pid_is_alive(pid):
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError as exc:
        return exc.errno == errno.EPERM
    return True


def release_pid_lock(path=PID_LOCK_FILE, pid=None):
    try:
        with open(path) as lock:
            owner = int(lock.read().strip())
        if pid is None or owner == int(pid):
            os.unlink(path)
            return True
    except (OSError, ValueError):
        pass
    return False


def heartbeat_payload(cycle_id, status, **extra):
    return {"cycle_id": cycle_id, "event_id": new_event_id(), "status": status,
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(), **extra}


def persist_heartbeat(cycle_id, **extra):
    payload = heartbeat_payload(cycle_id, "healthy", **extra)
    _atomic_write(STATE_FILE, payload)
    return payload

PREFIX = {"codebuddy": "cb", "cline-pass": "cp", "codebuddy-cn": "cbcn"}

BACKOFF = 180  # detik — kalau PUT kena 429/timeout, skip model itu selama ini (AP-6)
_refresh_lock = threading.Lock()
COOLDOWN_CB = 10           # detik — cb/cbcn: reaktif, nggak kebekuan lama
COOLDOWN_CP = 15           # detik — cline-pass: reaktif


DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise RuntimeError("UPSTREAM_DB must be configured")


def _load_config_db():
    """Baca config dari tabel PostgreSQL auto_pricing_config + global trigger upstream.
    return ({ (upstream, model_id): {trigger_pct, rebound_pct} }, { upstream: global_trigger_pct })
    None kalau DB error / tak tersedia."""
    if not psycopg:
        return None
    try:
        with psycopg.connect(DB_DSN, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT upstream, model_id, trigger_pct, rebound_pct FROM auto_pricing_config")
                rows = cur.fetchall()
                cur.execute("SELECT upstream, global_trigger_pct FROM pricing_config_upstream WHERE global_trigger_pct IS NOT NULL")
                grows = cur.fetchall()
        out = {}
        globals_map = {}
        for upstream, model_id, trigger_pct, rebound_pct in rows:
            out[(upstream, model_id)] = {
                "trigger_pct": float(trigger_pct or 0),
                "rebound_pct": float(rebound_pct or 0),
            }
        for upstream, gtp in grows:
            globals_map[upstream] = float(gtp)
        return out, globals_map
    except Exception:
        return None


def load_config():
    """Baca config per upstream×model + global trigger upstream.
    Prioritas trigger: override eksplisit (auto_pricing_config) > global upstream
    (pricing_config_upstream.global_trigger_pct) > default band (band_for).
    C6 — source of truth = DB PostgreSQL, fallback file JSON lama, lalu default."""
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
        globals_map = {}
        for g in (dj.get("globals") or []):
            globals_map[g.get("upstream")] = float(g.get("global_trigger_pct"))
        return out, globals_map
    except Exception:
        return {}, {}


def _db_execute(sql, params=None):
    """Jalankan statement DML/DDL di Postgres (auto_pricing_*). Return True sukses,
    False kalau psycopg/DB tidak tersedia (daemon tetap jalan tanpa DB)."""
    if not psycopg:
        return False
    try:
        with psycopg.connect(DB_DSN, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params or [])
            conn.commit()
        return True
    except Exception:
        return False


def _db_ensure_schema():
    """Use the backend's sole canonical, additive DDL owner."""
    if not psycopg:
        return False
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
        from db_schema import ensure_schema

        with psycopg.connect(DB_DSN, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                ensure_schema(cur)
            conn.commit()
        return True
    except Exception:
        return False


def _db_reliability_cycle_start(cycle_id):
    return _db_execute(
        "INSERT INTO reliability_cycles (cycle_id, status, summary) VALUES (%s, %s, %s) ON CONFLICT (cycle_id) DO NOTHING",
        (cycle_id, "running", json.dumps({})),
    )


def _db_reliability_event(cycle_id, event_type, severity, payload, event_id=None):
    event_id = event_id or new_event_id()
    return _db_execute(
        "INSERT INTO reliability_events (event_id, cycle_id, event_type, severity, payload) "
        "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (event_id) DO NOTHING",
        (event_id, cycle_id, event_type, severity, json.dumps(payload or {})),
    )


def _db_reliability_cycle_finish(cycle_id, status, summary):
    return _db_execute(
        "UPDATE reliability_cycles SET completed_at = now(), status = %s, summary = %s WHERE cycle_id = %s",
        (status, json.dumps(summary or {}), cycle_id),
    )


def _db_log_api(endpoint, method, status, ms, nbytes):
    if psycopg and status:
        _db_execute("INSERT INTO auto_pricing_api_log (endpoint, method, status, ms, bytes) VALUES (%s,%s,%s,%s,%s)",
                    (endpoint, method, int(status), int(ms), int(nbytes)))


def _db_log_op(slug, mid, action, our, target, ref, boundary, official, t_pct, max_in, http_status, dry_run, reason):
    if not psycopg:
        return
    _db_execute(
        "INSERT INTO auto_pricing_ops (slug, model_id, action, our, target, ref, boundary, official, trigger_pct, max_in, http_status, dry_run, reason) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (slug, mid, action, float(our), float(target),
         float(ref) if ref is not None else None,
         float(boundary) if boundary is not None else None,
         float(official), float(t_pct),
         float(max_in) if max_in is not None else None,
         http_status, bool(dry_run), reason))


def _db_upsert_state(rows):
    """Upsert snapshot state per model ke auto_pricing_state. rows = list decision dict."""
    if not psycopg or not rows:
        return
    try:
        with psycopg.connect(DB_DSN, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                for r in rows:
                    cur.execute("""
                        INSERT INTO auto_pricing_state
                            (slug, model_id, catalog_id, ask_in, ask_out, official, max_ask_in, enabled, demand,
                             competitor_price, action, target, comp, reason, updated_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                        ON CONFLICT (slug, model_id) DO UPDATE SET
                            catalog_id=EXCLUDED.catalog_id, ask_in=EXCLUDED.ask_in,
                            ask_out=EXCLUDED.ask_out, official=EXCLUDED.official,
                            max_ask_in=EXCLUDED.max_ask_in, enabled=EXCLUDED.enabled,
                            demand=EXCLUDED.demand, competitor_price=EXCLUDED.competitor_price,
                            action=EXCLUDED.action, target=EXCLUDED.target, comp=EXCLUDED.comp,
                            reason=EXCLUDED.reason, updated_at=now()
                    """, (
                        r.get("slug"), r.get("model_id"), r.get("catalog_id"),
                        r.get("ask_in"), r.get("ask_out"), r.get("official"),
                        r.get("max_ask_in"), r.get("enabled"), r.get("demand"),
                        r.get("competitor_price"), r.get("action"), r.get("target"),
                        r.get("comp"), r.get("reason"),
                    ))
            conn.commit()
        return True
    except Exception:
        return False


def utc_bucket_start(value, granularity):
    """Return a deterministic UTC bucket boundary for a reliability timestamp."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    value = value.astimezone(datetime.timezone.utc)
    if granularity == "hour":
        return value.replace(minute=0, second=0, microsecond=0)
    if granularity == "day":
        return value.replace(hour=0, minute=0, second=0, microsecond=0)
    raise ValueError("granularity must be hour or day")


def reliability_bucket_granularity(occurred_at, now_utc=None):
    """Use hourly buckets through 30 UTC days, daily buckets through 90 days."""
    now_utc = now_utc or datetime.datetime.now(datetime.timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=datetime.timezone.utc)
    age = now_utc.astimezone(datetime.timezone.utc) - occurred_at.astimezone(datetime.timezone.utc)
    if age < datetime.timedelta(days=0) or age <= datetime.timedelta(days=30):
        return "hour"
    if age <= datetime.timedelta(days=90):
        return "day"
    return None


def _db_reliability_maintenance(now_utc=None):
    """Bounded, idempotent W6 maintenance; operational rows remain separate."""
    if not psycopg:
        return {"status": "unavailable", "deleted_events": 0, "deleted_aggregates": 0}
    now_utc = now_utc or datetime.datetime.now(datetime.timezone.utc)
    result = {"status": "ok", "deleted_events": 0, "deleted_aggregates": 0}
    try:
        with psycopg.connect(DB_DSN, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM reliability_events e
                    USING reliability_cycles c
                    WHERE e.cycle_id = c.cycle_id
                      AND e.occurred_at < (%s AT TIME ZONE 'UTC') - INTERVAL '30 days'
                      AND c.completed_at IS NOT NULL
                """, (now_utc.replace(tzinfo=None),))
                result["deleted_events"] = cur.rowcount
                cur.execute("""
                    DELETE FROM reliability_aggregates
                    WHERE bucket_start < (%s AT TIME ZONE 'UTC') - INTERVAL '90 days'
                """, (now_utc.replace(tzinfo=None),))
                result["deleted_aggregates"] = cur.rowcount
                cur.execute("""
                    INSERT INTO reliability_aggregates
                        (bucket_start, bucket_granularity, metric, value, updated_at)
                    SELECT date_trunc(
                               CASE WHEN e.occurred_at >= (%s AT TIME ZONE 'UTC') - INTERVAL '30 days'
                                    THEN 'hour' ELSE 'day' END,
                               e.occurred_at AT TIME ZONE 'UTC'
                           ) AT TIME ZONE 'UTC',
                           CASE WHEN e.occurred_at >= (%s AT TIME ZONE 'UTC') - INTERVAL '30 days'
                                THEN 'hour' ELSE 'day' END,
                           'event_count', count(*)::double precision, now()
                    FROM reliability_events e
                    WHERE e.occurred_at >= (%s AT TIME ZONE 'UTC') - INTERVAL '90 days'
                    GROUP BY 1, 2
                    ON CONFLICT (bucket_start, bucket_granularity, metric)
                    DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                """, (now_utc.replace(tzinfo=None), now_utc.replace(tzinfo=None), now_utc.replace(tzinfo=None)))
            conn.commit()
    except Exception as exc:
        result.update(status="error", error=type(exc).__name__)
    return result


def _db_retention(days=30):
    """Preserve existing 30-day operational-row policy, then run W6 maintenance."""
    if not psycopg:
        return
    _db_execute("DELETE FROM auto_pricing_ops WHERE ts < now() - make_interval(days => %s)", (days,))
    _db_execute("DELETE FROM auto_pricing_api_log WHERE ts < now() - make_interval(days => %s)", (days,))
    return _db_reliability_maintenance()


def band_for(slug, mid, conf, globals_map=None):
    """trigger_pct per model — prioritas: override eksplisit > global upstream > default 10%.
    REBOUND DIHAPUS (nilai rebound_pct hanya kompatibilitas config lama, tak dipakai)."""
    if conf:
        return conf["trigger_pct"] / 100.0, conf["rebound_pct"] / 100.0
    if globals_map and slug in globals_map:
        return globals_map[slug] / 100.0, 0.10
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
    _t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            _db_log_api(path, method, r.status, int((time.time() - _t0) * 1000), len(body))
            return (r.status, json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"raw": str(e)}
        _db_log_api(path, method, e.code, int((time.time() - _t0) * 1000), len(json.dumps(body)))
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
_ASKS_CACHE_TTL = 60   # 2026-08-15: 300s membuat our/state UI stale 5 menit
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
def get_my_slugs(provs=None):
    """Semua upstreamSlug milik kita (satu publisher) — dari providers enabled.
    Dipakai utk exclude ask kita lintas-upstream dari orderbook & market anchor.
    Self-undercut fix (2026-08-15): 6 upstream (codebuddy, cline-pass, codebuddy-cn,
    codex, commandcode, opencode-go) = satu publisher — ask mereka semua adalah ask KITA."""
    if provs is None:
        provs = _get_providers_cached()
    return {p.get("upstreamSlug") for p in provs if p.get("enabled") and p.get("upstreamSlug")}


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


def _market_min_from_models(models):
    """Terjemahkan /market models -> {(slug, model): minAskIn}, EXCLUDE slug milik kita.
    Prefix petakan: cb->codebuddy, cp->cline-pass, cbcn->codebuddy-cn, dst.
    Self-undercut fix (2026-08-15): slug yang milik kita (satu publisher) TIDAK boleh
    jadi anchor — kalau kita yang termurah di market, minAskIn = ask kita sendiri.
    Slug yang BUKAN milik kita (kompetitor sejati) tetap di-anchor."""
    my = get_my_slugs()
    prefix_map = {"cb": "codebuddy", "cp": "cline-pass", "cbcn": "codebuddy-cn"}
    out = {}
    for m in (models or []):
        slug_full = m.get("slug") or ""
        min_in = m.get("minAskIn")
        if not slug_full or not min_in:
            continue
        # slug = "<prefix>/<model>"; prefix seperti cb, cp, cbcn, cx, zai.
        parts = slug_full.split("/")
        if len(parts) < 2:
            continue
        model = parts[-1]
        pc = parts[0]
        # petakan prefix -> slug scope; fallback: prefix itu sendiri
        slug = prefix_map.get(pc) or pc
        if slug in my:
            continue  # ask kita sendiri — jangan jadi anchor
        out[(slug, model)] = min_in
    return out


def get_market_min(use_cache=True):
    """Anchor kompetitor dari /market — minAskIn per (table-prefix/model).
    EXCLUDE upstream milik kita (satu publisher) — anchor TIDAK pernah ask sendiri.
    Cache TTL 120s (rate limit)."""
    if use_cache and time.time() - _MARKET_CACHE["ts"] < _ANCHOR_TTL:
        return _MARKET_CACHE["data"]
    try:
        st, d = api("/market")
        if st != 200 or not isinstance(d, dict):
            return _MARKET_CACHE["data"] if _MARKET_CACHE["data"] else {}
        out = _market_min_from_models(d.get("models") or [])
        _MARKET_CACHE["ts"] = time.time()
        _MARKET_CACHE["data"] = out
        return out
    except Exception:
        return _MARKET_CACHE["data"] if _MARKET_CACHE["data"] else {}
def _provider_scoped_levels(slug, mid, m):
    """Orderbook PER-PROVIDER (2026-08-17 — /catalog openapi: asksIn =
    live per-provider ask utk upstream card itu; halaman Asks = orderbook
    PER PROVIDER, user: 'bukan model di provider itu yang kamu baca').

    levels row (slug, mid) = asksIn catalog[slug][mk] MILIK slug itu SAJA.
    TIDAK ada pooling global antar-slug; harga dari slug LAIN tidak pernah
    masuk row ini. qty = per-price count; harga <= 0 di-drop; sorted asc."""
    agg = {}
    for price in (m.get("asksIn") or []):
        try:
            p = round(float(price), 6)
        except (TypeError, ValueError):
            continue
        if p > 0:
            agg[p] = agg.get(p, 0.0) + 1.0
    return sorted((p, q) for p, q in agg.items())


def get_positions(catalog, our_price=None):
    """POSISI KOMPETITOR per (slug, model) (Faiz v2 — wajib tiap cycle).

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

    PER-PROVIDER (2026-08-17 — /catalog openapi + halaman Asks): levels row
    (slug, mid) = asksIn catalog[slug][mk] MILIK slug itu SAJA. TIDAK ada
    pooling global antar-slug (bug lama: book[mid] global menyatukan semua
    slug utk model yg sama — row provider A membaca level milik provider B).
    Harga dari slug LAIN tidak pernah masuk row ini.

    Return {(slug, model_id): {"total_provider", "provider_ok_kita",
                                "posisi_kompetitor", "levels"}}
    levels = sorted list of (price, qty) — orderbook PER-PROVIDER slug tsb.
    """
    provs = []
    try:
        provs = _get_providers_cached()
    except Exception:
        pass
    ok_kita = {}
    if provs:
        for p in provs:
            if p.get("enabled") and p.get("upstreamSlug"):
                s = p.get("upstreamSlug")
                ok_kita[s] = ok_kita.get(s, 0) + 1

    items_by_slug = catalog.items() if isinstance(catalog, dict) else []
    out = {}
    for slug, sub in items_by_slug:
        if not isinstance(sub, dict):
            continue
        for mk, m in sub.items():
            if not isinstance(m, dict):
                continue
            mid = mk.split("/")[-1].strip().lower()
            levels = _provider_scoped_levels(slug, mid, m)
            total = int(sum(q for _p, q in levels))
            ok = ok_kita.get(slug, 0)
            out[(slug, mid)] = {
                "total_provider": total,
                "provider_ok_kita": ok,
                "posisi_kompetitor": total,
                "levels": levels,
            }
    return out
def _lowest_competitor_price(levels):
    """Harga kompetitor sejati terendah dari orderbook (levels[0][0]); None kalau kosong."""
    if not levels:
        return None
    return float(levels[0][0])

def _decide_trigger_area(our, official, levels, trigger_pct, max_in=0):
    """Official-price trigger-area decision (contract basis B + fallback).

    boundary = round(official * trigger_pct, 6) when official and
    trigger_pct are both positive, else None (no boundary filter).
    offset   = round(official * 0.001, 6) when official > 0 else 0.
    Valid competitor refs: price p > 0, strictly above boundary (when
    present), and not equal to our own ask within 1e-6.

    Contract (corrected):
      - valid refs split into lower (p < our) and higher (p > our)
      - lower valid exists -> UNDERCUT lowest lower:
          target = round(lowest_lower - offset, 6)
      - already cheapest (no lower) -> lowest higher:
          distance = higher - our; distance <= offset (incl. exact
          equality) -> HOLD at our; distance > offset -> RESUME
          target = round(higher - offset, 6)
      - no valid outside-area candidate -> RESUME fallback
          target = round(round(official * 0.5, 6) - offset, 6)
      - max_in clamps target only (max_in <= 0 disables the clamp)
      - target <= 0 -> HOLD at our (never emit zero or negative)
    """
    boundary = (round(float(official) * float(trigger_pct), 6)
                if float(official) > 0 and float(trigger_pct) > 0 else None)
    offset = round(float(official) * 0.001, 6) if float(official) > 0 else 0.0
    our_f = float(our)
    refs = [float(p) for p, _q in levels
            if float(p) > 0
            and (boundary is None or float(p) > boundary)
            and abs(float(p) - our_f) > 1e-6]
    lower = [p for p in refs if p < our_f]
    higher = [p for p in refs if p > our_f]

    def _clamp(t):
        if max_in > 0:
            t = min(t, float(max_in))
        return t

    if lower:
        ref = min(lower)
        target = _clamp(round(ref - offset, 6))
        if target <= 0:
            return {"action": "hold", "target": our_f, "ref": ref,
                    "boundary": boundary, "competitor_price": ref}
        return {"action": "undercut", "target": target, "ref": ref,
                "boundary": boundary, "competitor_price": ref}

    if higher:
        ref = min(higher)
        target = _clamp(round(ref - offset, 6))
        if target <= 0 or target <= our_f:
            # sudah termurah & target resume tak di atas our (jarak ke higher
            # <= offset, termasuk tepat 0.1% official) -> HOLD di our
            return {"action": "hold", "target": our_f, "ref": ref,
                    "boundary": boundary, "competitor_price": ref}
        return {"action": "resume", "target": target, "ref": ref,
                "boundary": boundary, "competitor_price": ref}

    # Tidak ada kandidat luar-area valid -> RESUME fallback 50% official.
    target = _clamp(round(round(float(official) * 0.5, 6) - offset, 6))
    if target <= 0 or target <= our_f:
        return {"action": "hold", "target": our_f, "ref": None,
                "boundary": boundary, "competitor_price": None}
    return {"action": "resume", "target": target, "ref": None,
            "boundary": boundary, "competitor_price": None}


def _read_armed_flag(path=None):
    path = path or os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-arm")
    with open(path, "r", encoding="utf-8") as f:
        value = f.read().strip()
    if value not in {"0", "1"}:
        raise ValueError("auto-pricing arm flag must be exactly 0 or 1")
    return value == "1"


def run_cycle(dry_run=False):
    cycle_id = new_cycle_id()
    persistence_warning = not _db_reliability_cycle_start(cycle_id)
    _db_reliability_event(cycle_id, "cycle_started", "warning" if persistence_warning else "info", {"dry_run": bool(dry_run)})
    ARMED = True
    try:
        ARMED = _read_armed_flag()
    except (OSError, ValueError):
        ARMED = False
    effective_dry = dry_run or not ARMED

    catalog = get_catalog()
    if not catalog:
        log("WARN: /catalog kosong, skip")
        if not _db_reliability_event(cycle_id, "catalog_empty", "warning", {}):
            persistence_warning = True
        _db_reliability_event(cycle_id, "cycle_completed", "warning", {"status": "catalog_empty", "models": 0})
        if not _db_reliability_cycle_finish(cycle_id, "skipped", {"status": "catalog_empty", "models": 0, "persistence_warning": persistence_warning}):
            persistence_warning = True
        persist_heartbeat(cycle_id, status="skipped", models=0)
        return 0
    config, globals_map = load_config()
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
            max_in = a["max_ask_in"]
            mid = a["model_id"]
            if official <= 0:
                cat_models_slug = catalog.get(slug, {})
                cat_model = cat_models_slug.get(mid)
                if cat_model is None:
                    cat_model = cat_models_slug.get(mid.split("/")[-1])
                if cat_model:
                    official = _f(cat_model.get("officialIn")) or _f(cat_model.get("official")) or official

            # config key bisa bare ("deepseek-v4-flash") atau prefixed ("codebuddy-cn/deepseek-v4-flash")
            conf = config.get((slug, mid))
            if conf is None:
                conf = config.get((slug, f"{slug}/{mid}"))
            t_pct, _r_pct = band_for(slug, mid, conf, globals_map)   # trigger% (rebound dihapus v2)
            hk = f"{slug}|{mid}"
            prev = hold.get(hk, {})
            prev_ts = prev.get("ts", 0)

            # BACKOFF hanya untuk 429/timeout API; bukan cooldown harga.
            skip_until = prev.get("skip_until", 0)
            if now < skip_until:
                remain = int(skip_until - now)
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
            levels = pos.get("levels", []) if pos else []
            a["competitor_price"] = _lowest_competitor_price(levels)


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

            trigger_px = round(official * t_pct, 6)

            if not levels:
                # Blocker C: levels kosong = tidak ada kompetitor sejati
                # (semua ask slug milik kita sudah di-exclude di get_positions)
                # → HOLD. TIDAK ada self-anchor resume dari catalog/ask sendiri.
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
                _db_log_op(slug, mid, "hold", our, our, None, trigger_px, official, t_pct, max_in, None, dry_run,
                           f"no orderbook levels (our ${our:.4f} comp ${comp or 0:.4f}) | posisi komp {pos_komp}")
                decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                                  "reason": f"no orderbook levels (our ${our:.4f} comp ${comp or 0:.4f}) | posisi komp {pos_komp}"})
                continue

            # ── KEPUTUSAN LEVEL: _decide_trigger_area (basis B) ──
            # boundary = round(official * trigger_pct, 6). Ref kompetitor valid =
            # level orderbook sejati terendah yang > boundary (kompetitor di
            # area trigger / ≤ boundary DIABAIKAN) dan ≠ ask kita (1e-6).
            # target = ref - 0.1% official, clamp max_in SAJA (tanpa floor
            # boundary). target <= 0 → helper HOLD (tidak pernah kirim
            # nol/negatif). action = undercut / resume / hold (epsilon
            # 0.00005). Tanpa market-anchor override — level orderbook
            # kompetitor murni (ask semua slug kita sudah di-exclude di
            # get_positions) langsung dipakai helper ini.
            # competitor_price di decision row = a['competitor_price']
            # (_lowest_competitor_price(levels), orderbook SEJATI), bukan comp.
            dec = _decide_trigger_area(our, official, levels, t_pct, max_in)
            target = dec["target"]
            action = dec["action"]
            if action == "hold":
                # Blocker A: jangan format dec['ref'] (None saat tak ada ref
                # valid) — hold di-append duluan, reason tanpa ref.
                # Blocker D: pertahankan competitor_price orderbook sejati
                # (a['competitor_price']), bukan comp market.
                hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
                _db_log_op(slug, mid, "hold", our, our, dec.get("ref"), dec.get("boundary"), official, t_pct, max_in,
                           None, dry_run,
                           f"hold from trigger area (boundary ${dec.get('boundary') or 0:.4f}, orderbook ${a.get('competitor_price') or 0:.4f}) our ${our:.4f} | posisi komp {pos_komp}")
                decisions.append({**a, "action": "hold", "target": our, "our": our, "comp": comp,
                                  "competitor_price": a.get("competitor_price"),
                                  "reason": f"hold from trigger area (boundary ${dec.get('boundary') or 0:.4f}, orderbook ${a.get('competitor_price') or 0:.4f}) our ${our:.4f} | posisi komp {pos_komp}"})
                continue
            # Actionable (undercut/resume): undercut/resume dari lower/higher
            # selalu punya ref valid. Resume fallback 50%-official punya
            # dec['ref']=None — format reason dengan ref_txt biar tidak crash.
            ref_txt = f"${dec['ref']:.4f}" if dec.get("ref") is not None else "50%-official"
            reason = (f"{action} 0.1% dr ref {ref_txt} -> ${target:.4f} "
                      f"(boundary ${dec.get('boundary') or 0:.4f}) | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})")
            if effective_dry:
                log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} trigger=${trigger_px:.4f} -> {action} ref {ref_txt}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{'DRY' if not ARMED else 'ARMED'}]")
                _db_log_op(slug, mid, action, our, target, dec.get("ref"), dec.get("boundary"), official, t_pct,
                           max_in, None, True, reason)
                decisions.append({**a, "action": action, "target": target, "our": target, "comp": comp,
                                  "reason": reason})
                continue
            st, _ = set_ask(slug, cid, target, a["ask_out"], official=official)
            status = "OK" if st in (200, 204) else f"HTTP{st}"
            log(f"  [{slug}] {mid}: our=${our:.4f} comp=${comp or 0:.4f} -> {action} ref {ref_txt}-0.1% = ${target:.4f} totProv={tot_prov} okKita={ok_kita} posKomp={pos_komp} [{status}]")
            _db_log_op(slug, mid, action, our, target, dec.get("ref"), dec.get("boundary"), official, t_pct,
                       max_in, st, False, reason)
            if st in (200, 204):
                hold[hk] = {"mode": action, "our": target, "comp": comp, "ts": now}
                # AP-6: sukses → reset backoff (buang skip_until)
                hold[hk].pop("skip_until", None)
                decisions.append({**a, "action": action, "target": target, "our": target, "comp": comp,
                                  "reason": reason, "http": st})
            elif st in (429, 0):
                # AP-6: 429/timeout → backoff: skip model ini selama BACKOFF detik
                hold[hk] = {"mode": "backoff", "our": our, "comp": comp, "ts": prev_ts,
                            "skip_until": now + BACKOFF}
                log(f"  !! [{slug}] {mid}: {status} (429/timeout) — skip + backoff {BACKOFF}s")
                decisions.append({**a, "action": "error", "target": our, "our": our, "comp": comp,
                                  "reason": f"{status} — skip + backoff", "http": st})
            else:
                log(f"  !! [{slug}] {mid}: {status} — skip, no retry this cycle")
                decisions.append({**a, "action": "error", "target": our, "our": our, "comp": comp,
                                  "reason": f"{status} — skip", "http": st})
            continue

    # Tanpa post-loop fallback ke market comp: competitor_price hanya dari
    # orderbook sejati (_lowest_competitor_price(levels)), bukan row['comp'].
    save_hold_state(hold)
    n_und = sum(1 for d in decisions if d["action"] in ("undercut", "undercut_floor", "resume"))
    n_hold = sum(1 for d in decisions if d["action"] in ("hold", "stable"))
    n_err = sum(1 for d in decisions if d["action"] == "error")
    log(f"cycle done: {len(decisions)} model, {n_und} undercut, {n_hold} hold, {n_err} error")

    state = {"ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
             "cycle_id": cycle_id, "event_id": new_event_id(), "status": "healthy",
             "cycles": decisions}
    _atomic_write(STATE_FILE, state)
    try:
        state["status"] = "healthy"
        if not _db_upsert_state(decisions):
            persistence_warning = True
        if not _db_reliability_event(cycle_id, "cycle_completed", "warning" if persistence_warning else "info", {"models": len(decisions), "errors": n_err}):
            persistence_warning = True
        if not _db_reliability_cycle_finish(cycle_id, "completed", {"models": len(decisions), "errors": n_err, "persistence_warning": persistence_warning}):
            persistence_warning = True
    except Exception:
        persistence_warning = True
    if persistence_warning:
        state["status"] = "persistence_warning"
        log(f"WARN persistence_warning cycle_id={cycle_id}")
    _atomic_write(STATE_FILE, state)
    return n_und


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--interval", type=int, default=INTERVAL)
    args = ap.parse_args()

    if not acquire_pid_lock():
        log("AUTO-PRICING already running; refusing duplicate PID")
        return
    try:
        _db_ensure_schema()
        _db_retention()

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
    finally:
        release_pid_lock()


if __name__ == "__main__":
    main()
