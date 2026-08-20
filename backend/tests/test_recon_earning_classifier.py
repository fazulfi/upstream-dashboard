"""Test klasifikasi pelanggaran earning equation (P4-Q12a)."""
from recon_earning import classify_earning_violation


def test_exact_match_ok():
    assert classify_earning_violation(100.0, 30.0, 130.0, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "ok"


def test_precision_only_ok():
    assert classify_earning_violation(100.0, 30.0, 130.001, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "precision"


def test_withdrawn_transition_ok():
    # withdrawn naik 0->130 dalam satu baris: balance+withdrawn baru = lifetime
    assert classify_earning_violation(0.0, 130.0, 130.0, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "withdrawn_transition"


def test_unexplained_fail():
    assert classify_earning_violation(50.0, 30.0, 130.0, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "unexplained"


def test_pre_baseline_excluded():
    assert classify_earning_violation(50.0, 30.0, 130.0, "2026-08-09 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "ok"
