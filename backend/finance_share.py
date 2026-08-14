"""Publisher share — SATU-SATUNYA sumber kebenaran (R15).

DB `pricing_config.publisher_share_pct` menyimpan integer persen (mis. 80
= 80%), sedangkan semua perhitungan earning butuh float (0.80). Helper ini
membaca DB, mengonversi /100, cache per-proses, dan fallback ke 0.80 saat
tabel kosong / error (pricing_config ditulis sync_account_cluster SETELAH
sync_usage_logs — run pertama selalu belum ada baris).

Ganti semua hardcode 0.80 / PUBLISHER_SHARE = 0.80 di full_sync.py & app.py
dengan panggilan helper ini.
"""
import threading

DEFAULT_SHARE = 0.80  # fallback: 80% publisher share (konvensi lama)

_lock = threading.Lock()
_CACHE = None  # float | None


def publisher_share_pct(cur=None) -> float:
    """Return publisher share sebagai float (0.80 = 80%).

    cur: cursor psycopg opsional (dipakai bila caller sudah punya koneksi
    terbuka). Tanpa cur, buka koneksi DB sendiri via db_connect().
    """
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        if cur is None:
            from app import db_connect
            with db_connect() as conn, conn.cursor() as c:
                c.execute("SELECT publisher_share_pct FROM pricing_config WHERE id=1")
                rows = c.fetchall()
        else:
            cur.execute("SELECT publisher_share_pct FROM pricing_config WHERE id=1")
            rows = cur.fetchall()
        pct = int(rows[0]["publisher_share_pct"]) if rows else 0
        value = (pct / 100.0) if pct > 0 else DEFAULT_SHARE
    except Exception:
        value = DEFAULT_SHARE
    with _lock:
        _CACHE = value
    return value


def invalidate_publisher_share():
    """Panggil setelah pricing_config di-rewrite supaya cache segar."""
    global _CACHE
    with _lock:
        _CACHE = None
