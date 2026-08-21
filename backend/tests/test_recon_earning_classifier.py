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


def test_seed_artifact_classified():
    # Kurva seed sintetis (db_seed): baris per-jam, balance fixed > lifetime, withdrawn=0
    assert classify_earning_violation(99.3171, 0.0, 81.5703, "2026-08-10 18:00:00",
                                      baseline="2026-08-10 17:56:45") == "seed"


def test_seed_artifact_late_row_classified():
    # Baris seed terakhir (delta mengecil ke 0.08) tetap seed — bukan unexplained
    assert classify_earning_violation(99.3171, 0.0, 99.2346, "2026-08-18 17:00:00",
                                      baseline="2026-08-10 17:56:45") == "seed"


def test_subminute_same_values_still_unexplained():
    # Baris live (sub-menit) dengan balance>lifetime & delta>0.05 TETAP unexplained:
    # bukan artefak seed (seed selalu per-jam).
    assert classify_earning_violation(99.3171, 0.0, 81.5703, "2026-08-11 12:34:56",
                                      baseline="2026-08-10 17:56:45") == "unexplained"
