"""Pure business logic — terpisah dari Flask app supaya unit-testable (≥80%).

Semua fungsi di sini murni (tanpa I/O, tanpa request/DB) — mudah diuji & di-review.
app.py mengimpor dari sini; jangan tarik dependency Flask di modul ini.
"""
import hmac
import hashlib
import time
import re


# ── Auth / sesi ──
def sign_session(exp, password):
    """HMAC-SHA256 signature utk token sesi (exp + password)."""
    return hmac.new(
        password.encode(),
        f"upstream-session:{exp}".encode(),
        hashlib.sha256,
    ).hexdigest()


def issue_token(password, session_ttl, now=None):
    """Terbitkan token sesi: '<expiry_epoch>.<sig>'."""
    now = int(now if now is not None else time.time())
    exp = now + int(session_ttl)
    return f"{exp}.{sign_session(exp, password)}"


def verify_token(token, password, now=None):
    """Validasi token sesi (format, expiry, signature)."""
    try:
        exp_s, sig = token.split(".", 1)
        exp = int(exp_s)
    except Exception:
        return False
    if exp < int(now if now is not None else time.time()):
        return False
    return hmac.compare_digest(sig, sign_session(exp, password))


def constant_time_eq(a, b):
    """Bandingkan dua string constant-time (utk password/token)."""
    return hmac.compare_digest(str(a or ""), str(b or ""))


# ── Rate limit ──
def rate_limit_hit(store, ip, limit, window, now=None):
    """Periksa & catat request per-IP. return True bila diizinkan, False bila 429.
    store: dict ip -> list[ts] (module app menyimpan defaultdict(list))."""
    now = float(now if now is not None else time.time())
    bucket = store[ip] = [t for t in store[ip] if now - t < window]
    if len(bucket) >= limit:
        return False
    store[ip].append(now)
    return True


# ── Bucketing history (C8) ──
RANGE_DUR_S = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "3h": 10800,
    "6h": 21600, "12h": 43200, "24h": 86400,
    "7d": 604800, "30d": 2592000, "90d": 7776000, "all": 0,
}
CANDLE_LEN = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "3h": 10800,
    "6h": 21600, "12h": 43200, "24h": 86400, "1w": 604800, "1mo": 2592000,
}
MAX_CANDLES = 120


def pick_window(range_id, data_span, max_candles=MAX_CANDLES):
    """Tentukan (candle_s, window, cutoff_delta) utk range.
    - 'all': candle = data_span//max_candles, window = data_span
    - lain: window = durasi range (7d/30d/90d benar), candle = CANDLE_LEN dgn clamp.
    return (candle_s, window_s, cutoff_epoch) — cutoff epoch = now - window.
    """
    if range_id == "all":
        candle_s = max(60, int(data_span) // max_candles)
        return candle_s, data_span, 0.0
    candle_s = CANDLE_LEN.get(range_id, 60)
    dur = RANGE_DUR_S.get(range_id)
    if dur:
        window = min(dur, data_span)
    else:
        window = candle_s * max_candles
    if window and candle_s > 0 and window // candle_s > max_candles:
        candle_s = max(60, int(window // max_candles))
    return candle_s, window, float(window)


def bucket_points(pts, candle_s, max_candles=MAX_CANDLES):
    """Bucket list[(epoch, earning)] jadi candles sum. return list[(slot_ts, total)]."""
    buckets = {}
    for epoch, earning in pts:
        slot = int(epoch // candle_s)
        buckets[slot] = buckets.get(slot, 0.0) + earning
    ordered = sorted(buckets)
    if len(ordered) > max_candles:
        ordered = ordered[-max_candles:]
    return [(slot * candle_s, buckets[s]) for s in ordered]


# ── PctOff & pricing (auto-pricing contract) ──
def pct_off(ask_in, official):
    """Persen diskon dari official (1 desimal), clamp [50, 99.9]. None bila official<=0."""
    if not official or official <= 0:
        return None
    p = round((1 - float(ask_in) / float(official)) * 100, 1)
    return max(50.0, min(p, 99.9))


def undercut_target(ref_price, official, trigger_px, max_in=0):
    """Target harga undercut: ref_price - 0.1%*official, clamp [trigger, max_in]."""
    offset = float(official) * 0.001
    target = round(float(ref_price) - offset, 6)
    target = max(target, trigger_px)
    if max_in and max_in > 0:
        target = min(target, float(max_in))
    return max(0.0, round(target, 6))


# ── Sanitize SVG (XSS — Topups) ──
_SVG_STRIP = (
    (re.compile(r"<!--[\s\S]*?-->"), ""),
    (re.compile(r"<script[\s\S]*?</script>", re.I), ""),
    (re.compile(r"<script[^>]*/>", re.I), ""),
    (re.compile(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I), ""),
    (re.compile(r"javascript\s*:", re.I), ""),
)


def sanitize_svg(svg):
    """Bersihkan string SVG dari script/event/javascript: — anti stored-XSS."""
    out = str(svg or "")
    for rx, repl in _SVG_STRIP:
        out = rx.sub(repl, out)
    return out


# ── Formatting (frontend-shared helpers, testable) ──
def fmt_usd(v):
    if v is None:
        return "$0.00"
    return "$" + format(float(v), ",.2f")


def fmt_idr(v, kurs):
    if v is None or not kurs:
        return ""
    return "Rp " + format(int(round(float(v) * float(kurs))), ",d").replace(",", ".")
