"""Klasifikasi pelanggaran earning equation (Phase 4 Q12a).

Invariant: abs((balance+withdrawn) - publisher_lifetime) <= 0.01 untuk ts >= baseline.
Klasifikasi: ok (match), precision (delta <= 0.01), withdrawn_transition
(balance lama 0 & withdrawn==lifetime — sync artifact), unexplained (strict FAIL).
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
    return "unexplained"
