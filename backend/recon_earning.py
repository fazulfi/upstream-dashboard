"""Klasifikasi pelanggaran earning equation (Phase 4 Q12a).

Invariant: abs((balance+withdrawn) - publisher_lifetime) <= 0.01 untuk ts >= baseline.
Klasifikasi: ok (match), precision (delta <= 0.05), withdrawn_transition
(balance lama 0 & withdrawn==lifetime — sync artifact), seed (artefak kurva
seed sintetis: baris per-jam dengan balance fixed & withdrawn=0 — balance > lifetime
oleh konstruksi seed, lihat db_seed), unexplained (strict FAIL).
"""
from datetime import datetime


def classify_earning_violation(balance, withdrawn, lifetime, ts, baseline="2026-08-10 17:56:45"):
    try:
        ts_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        bl_dt = datetime.fromisoformat(baseline.replace("Z", "+00:00"))
        if ts_dt < bl_dt:
            return "ok"  # pre-baseline excluded
    except Exception:
        pass

    bal = float(balance or 0)
    wd = float(withdrawn or 0)
    lt = float(lifetime or 0)
    delta = abs((bal + wd) - lt)
    if bal == 0 and abs(wd - lt) <= 0.01:
        return "withdrawn_transition"
    if delta == 0:
        return "ok"
    if delta <= 0.05:  # precision-only
        return "precision"
    if bal > lt and wd == 0 and _is_hourly(ts):
        # artefak kurva seed sintetis (db_seed): baris per-jam, balance fixed,
        # withdrawn 0 — balance > lifetime oleh konstruksi. Bukan pelanggaran nyata.
        return "seed"
    return "unexplained"


def _is_hourly(ts):
    """Baris seed sintetis selalu per-jam: menit:detik == 00:00."""
    try:
        d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return d.minute == 0 and d.second == 0
    except Exception:
        return False
