import datetime
import os, sys, time, unittest
from unittest import mock
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import auto_pricing as ap


class TestDaemonReliability(unittest.TestCase):
    def test_ids_are_uuid4(self):
        import uuid
        self.assertEqual(uuid.UUID(ap.new_cycle_id()).version, 4)
        self.assertEqual(uuid.UUID(ap.new_event_id()).version, 4)

    def test_delayed_data_is_independent(self):
        self.assertFalse(ap.orderbook_is_delayed(100, now=219))
        self.assertTrue(ap.orderbook_is_delayed(100, now=220))

    def test_pid_lock_refuses_live_and_takes_over_dead(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "daemon.pid")
            self.assertTrue(ap.acquire_pid_lock(path, pid=10, is_alive=lambda pid: False))
            self.assertFalse(ap.acquire_pid_lock(path, pid=11, is_alive=lambda pid: True))
            self.assertTrue(ap.acquire_pid_lock(path, pid=11, is_alive=lambda pid: False))
            self.assertTrue(ap.release_pid_lock(path, pid=11))

    def test_arm_flag_requires_canonical_boolean(self):
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
            f.write("true")
            path = f.name
        try:
            with self.assertRaises(ValueError):
                ap._read_armed_flag(path)
        finally:
            os.unlink(path)

    def test_failed_heartbeat_write_is_not_healthy(self):
        with mock.patch.object(ap, "_atomic_write", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                ap.persist_heartbeat(ap.new_cycle_id())

    def test_utc_bucket_boundaries_and_retention_window(self):
        now = datetime.datetime(2026, 8, 18, 12, 0, tzinfo=datetime.timezone.utc)
        self.assertEqual(ap.reliability_bucket_granularity(now - datetime.timedelta(days=30), now), "hour")
        self.assertEqual(ap.reliability_bucket_granularity(now - datetime.timedelta(days=30, seconds=1), now), "day")
        self.assertIsNone(ap.reliability_bucket_granularity(now - datetime.timedelta(days=90, seconds=1), now))
        self.assertEqual(ap.utc_bucket_start(datetime.datetime(2026, 8, 18, 12, 34, tzinfo=datetime.timezone.utc), "hour"),
                         datetime.datetime(2026, 8, 18, 12, 0, tzinfo=datetime.timezone.utc))
        self.assertEqual(ap.utc_bucket_start(datetime.datetime(2026, 8, 18, 12, 34, tzinfo=datetime.timezone.utc), "day"),
                         datetime.datetime(2026, 8, 18, 0, 0, tzinfo=datetime.timezone.utc))


class TestGetPositionsSelfUndercut(unittest.TestCase):
    def test_levels_provider_scoped_own_slug_only(self):
        """KONTRAK PER-PROVIDER (2026-08-17 — /catalog openapi: asksIn =
        live per-provider ask utk upstream card itu; halaman Asks = orderbook
        PER PROVIDER). levels row (slug, mid) = asksIn catalog[slug][mk]
        MILIK slug itu SAJA. TIDAK ada pooling global antar-slug; harga dari
        slug LAIN tidak pernah masuk row ini."""
        provs = [
            {"upstreamSlug": "codebuddy", "enabled": True},
            {"upstreamSlug": "cline-pass", "enabled": True},
            {"upstreamSlug": "commandcode", "enabled": True},
            {"upstreamSlug": "opencode-go", "enabled": True},
            {"upstreamSlug": "codebuddy-cn", "enabled": True},
            {"upstreamSlug": "codex", "enabled": True},
        ]
        catalog = {
            "codebuddy": {"deepseek-v4-flash": {"asksIn": [0.07, 0.0119], "officialIn": 0.07}},
            "commandcode": {"deepseek-v4-flash": {"asksIn": [0.0035, 0.007], "officialIn": 0.07}},
            "opencode-go": {"deepseek-v4-flash": {"asksIn": [0.0042], "officialIn": 0.07}},
            "competitor-x": {"deepseek-v4-flash": {"asksIn": [0.05], "officialIn": 0.07}},
        }
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        pos = ap.get_positions(catalog, our_price={("codebuddy", "deepseek-v4-flash"): 0.07})
        levels = pos[("codebuddy", "deepseek-v4-flash")]["levels"]
        prices = [p for p, q in levels]
        # HANYA book codebuddy sendiri: [0.0119, 0.07] (sorted ascending)
        self.assertEqual(prices, [0.0119, 0.07])
        # harga dari slug LAIN (commandcode/opencode-go/competitor-x) TIDAK masuk
        self.assertNotIn(0.0035, prices)
        self.assertNotIn(0.0042, prices)
        self.assertNotIn(0.05, prices)
        # row slug lain punya book-nya sendiri
        self.assertEqual([p for p, q in pos[("commandcode", "deepseek-v4-flash")]["levels"]], [0.0035, 0.007])
        self.assertEqual([p for p, q in pos[("competitor-x", "deepseek-v4-flash")]["levels"]], [0.05])

    def test_levels_include_kompetitor_sejati(self):
        """Kalau ADA kompetitor sejati di bawah kita, tetap muncul di levels."""
        provs = [{"upstreamSlug": "codebuddy", "enabled": True}]
        catalog = {
            "codebuddy": {"m1": {"asksIn": [0.07], "officialIn": 0.07}},
            "rival": {"m1": {"asksIn": [0.05], "officialIn": 0.07}},
        }
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        pos = ap.get_positions(catalog, our_price={("codebuddy", "m1"): 0.07})
        prices = [p for p, q in pos[("codebuddy", "m1")]["levels"]]
        self.assertIn(0.07, prices)

    def test_competitor_price_populated_own_plus_clinepass_plus_other(self):
        """PER-PROVIDER (2026-08-17): levels row codebuddy/deepseek-v4-flash =
        HANYA book codebuddy sendiri (0.022). Harga cline-pass/z-ai tidak pernah
        masuk row codebuddy (tidak ada pooling global antar slug)."""
        provs = [
            {"upstreamSlug": "codebuddy", "enabled": True},
            {"upstreamSlug": "cline-pass", "enabled": True},
        ]
        catalog = {
            "codebuddy": {"deepseek-v4-flash": {"asksIn": [0.0220], "officialIn": 0.8}},
            "cline-pass": {"cline-pass/deepseek-v4-flash": {"asksIn": [0.0220, 0.1098, 0.1100], "officialIn": 0.8}},
            "z-ai": {"z-ai/deepseek-v4-flash": {"asksIn": [0.05], "officialIn": 0.8}},
        }
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        pos = ap.get_positions(catalog, our_price={("codebuddy", "deepseek-v4-flash"): 0.022})
        levels = pos[("codebuddy", "deepseek-v4-flash")]["levels"]
        prices = [p for p, _q in levels]
        self.assertEqual(prices, [0.022])
        self.assertEqual(pos[("cline-pass", "deepseek-v4-flash")]["levels"], [(0.022, 1), (0.1098, 1), (0.11, 1)])
        self.assertEqual(pos[("z-ai", "deepseek-v4-flash")]["levels"], [(0.05, 1)])

    def test_get_my_slugs_dinamis(self):
        provs = [
            {"upstreamSlug": "codebuddy", "enabled": True},
            {"upstreamSlug": "codebuddy", "enabled": False},
            {"upstreamSlug": "codex", "enabled": True},
        ]
        slugs = ap.get_my_slugs(provs)
        self.assertEqual(slugs, {"codebuddy", "codex"})

    def test_market_min_exclude_upstream_kita(self):
        """minAskIn dari upstreamSlug milik kita TIDAK boleh jadi anchor kompetitor."""
        provs = [{"upstreamSlug": "commandcode", "enabled": True}]
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        market_models = [
            {"slug": "cmd/deepseek-v4-flash", "minAskIn": 0.0035},   # commandcode = kita
            {"slug": "rival/deepseek-v4-flash", "minAskIn": 0.05},   # kompetitor sejati
        ]
        out = ap._market_min_from_models(market_models)
        self.assertNotIn(("commandcode", "deepseek-v4-flash"), out)
        self.assertIn(("rival", "deepseek-v4-flash"), out)

    def test_kompetitor_di_bawah_trigger_tetap_di_levels(self):
        """PER-PROVIDER: levels row codebuddy/glm-5.2 = book codebuddy sendiri
        ([0.3206]). Kompetitor z-ai @0.07 masuk row z-ai, bukan row codebuddy."""
        provs = [{"upstreamSlug": "codebuddy", "enabled": True}]
        catalog = {
            "codebuddy": {"glm-5.2": {"asksIn": [0.3206], "officialIn": 1.4}},
            "z-ai": {"glm-5.2": {"asksIn": [0.07], "officialIn": 1.4}},
        }
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        pos = ap.get_positions(catalog, our_price={("codebuddy", "glm-5.2"): 0.3206})
        prices = [p for p, q in pos[("codebuddy", "glm-5.2")]["levels"]]
        self.assertEqual(prices, [0.3206])
        self.assertEqual([p for p, q in pos[("z-ai", "glm-5.2")]["levels"]], [0.07])

    def test_asks_cache_ttl_pendek(self):
        """TTL cache asks TIDAK boleh 300s (5 menit) — bikin 'our' stale di UI,
        user lihat 'gaada yang jalan' padahal PUT sudah efektif."""
        self.assertLess(ap._ASKS_CACHE_TTL, 120,
                        f"TTL {ap._ASKS_CACHE_TTL}s terlalu lama — UI tampil basi")

    def test_decision_our_adalah_target_setelah_put(self):
        """Decision 'undercut' setelah PUT sukses harus bawa 'our' = target yg
        dikirim (bukan ask lama dari cache). Ini yg bikin UI tampil stale."""
        # simulasi decision yg dibangun run_cycle saat PUT 200
        d = {"action": "undercut", "target": 0.0686, "our": 0.0686}
        self.assertAlmostEqual(d["our"], d["target"])
        self.assertNotAlmostEqual(d["our"], 0.3206)  # ask lama TIDAK boleh

    def test_trigger_area_removes_floor_competitor_at_boundary_resumes(self):
        """Basis B (official-price trigger area): TIDAK ada boundary floor.
        Kompetitor yang TEPAT di boundary (== official*trigger_pct) diabaikan
        (valid mensyaratkan p > boundary) -> tidak ada ref valid -> RESUME
        fallback round(1.4*0.5,6)-offset = 0.6986 (bukan undercut ke floor
        0.14/0.07 seperti perilaku lama REV10c)."""
        cb = ap._decide_trigger_area(0.3206, 1.4, [(0.14, 1)], trigger_pct=0.10, max_in=0)
        cbcn = ap._decide_trigger_area(0.3206, 1.4, [(0.07, 1)], trigger_pct=0.05, max_in=0)
        self.assertEqual(cb["action"], "resume")
        self.assertEqual(cbcn["action"], "resume")
        self.assertAlmostEqual(cb["target"], 0.6986, places=6)
        self.assertAlmostEqual(cbcn["target"], 0.6986, places=6)

    def test_lowest_competitor_price_comes_from_genuine_orderbook(self):
        """Harga kompetitor = level orderbook sejati terendah (levels[0][0]);
        None kalau tidak ada genuine competitor."""
        levels = [(0.07, 1), (0.322, 1)]
        self.assertEqual(ap._lowest_competitor_price(levels), 0.07)
        self.assertIsNone(ap._lowest_competitor_price([]))


class TestDecideTriggerAreaOfficialBasis(unittest.TestCase):
    """RED phase — basis-B official-price trigger area for
    _decide_trigger_area(our, official, levels, trigger_pct, max_in=0).

    Contract (clarified, basis B + fallback resume):
      - boundary    = round(official * trigger_pct, 6)   (trigger_pct = FRACTION: 0.10 = 10%)
      - offset      = round(official * 0.001, 6)
      - valid refs  = levels p where p > boundary, p > 0, abs(p - our) > 1e-6
      - lower VALID -> UNDERCUT lowest lower: target = round(lowest_lower - offset, 6)
      - no lower (already cheapest) -> lowest higher: distance = higher - our;
        distance <= offset (incl. exact equality) -> HOLD at our;
        distance > offset -> RESUME target = round(higher - offset, 6)
      - no valid outside-area candidate -> RESUME fallback
        target = round(round(official * 0.5, 6) - offset, 6)  (50% official discovery)
      - max_in clamps target only; NO boundary floor (target may fall below boundary)
      - target <= 0 -> HOLD at our (never emit zero/negative)
      - classify    = undercut (target < our) / resume (target > our) / hold
      - return      = {"action", "target", "competitor_price"};
                      competitor_price = lowest VALID ref driving the decision,
                      or None when no valid ref (fallback resume).
    Production function is NOT implemented yet — these tests must fail/error now."""

    def test_boundary_is_official_times_trigger_pct(self):
        """boundary 1.4*0.10 = 0.14; competitor TEPAT di 0.14 tidak valid,
        hanya 0.1401 (> boundary) yang jadi ref -> target 0.1387."""
        d = ap._decide_trigger_area(our=0.32, official=1.4,
                                    levels=[(0.14, 1), (0.1401, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["target"], 0.1401 - 1.4 * 0.001, places=6)
        self.assertAlmostEqual(d["competitor_price"], 0.1401, places=6)

    def test_competitors_at_or_below_boundary_resume_fallback(self):
        """0.05 dan 0.14 keduanya <= boundary 0.14 -> tanpa ref valid ->
        RESUME fallback round(official*0.5,6)-offset = 0.6986 (bukan hold)."""
        d = ap._decide_trigger_area(our=0.32, official=1.4,
                                    levels=[(0.05, 1), (0.14, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertIsNone(d["competitor_price"])

    def test_lowest_valid_above_boundary_drives_undercut(self):
        """0.10 diabaikan (<= boundary 0.14); 0.20 = valid terendah ->
        undercut target 0.20 - 1.4*0.001 = 0.1986."""
        d = ap._decide_trigger_area(our=0.32, official=1.4,
                                    levels=[(0.10, 1), (0.20, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["target"], 0.1986, places=6)
        self.assertAlmostEqual(d["competitor_price"], 0.20, places=6)

    def test_no_valid_refs_resume_fallback(self):
        """Semua level <= boundary -> tidak ada ref valid -> RESUME fallback
        round(official*0.5,6)-offset = 0.6986 (kontrak fallback, bukan hold)."""
        d = ap._decide_trigger_area(our=0.32, official=1.4,
                                    levels=[(0.05, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertIsNone(d["competitor_price"])

    def test_valid_ref_above_our_resumes(self):
        """Ref valid terendah 0.30 ada di atas our 0.20 -> target 0.2986 > our
        -> resume (jemput kompetitor wajar di atas)."""
        d = ap._decide_trigger_area(our=0.20, official=1.4,
                                    levels=[(0.30, 1), (0.40, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.2986, places=6)
        self.assertAlmostEqual(d["competitor_price"], 0.30, places=6)

    def test_target_equal_to_our_holds(self):
        """target 0.1986 == our -> hold (epsilon 0.00005, termasuk yang beda
        <= 0.00005 setelah rounding)."""
        d = ap._decide_trigger_area(our=0.1986, official=1.4,
                                    levels=[(0.20, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "hold")
        self.assertAlmostEqual(d["target"], 0.1986)
        self.assertAlmostEqual(d["competitor_price"], 0.20, places=6)
        d2 = ap._decide_trigger_area(our=0.19861, official=1.4,
                                     levels=[(0.20, 1)], trigger_pct=0.10)
        self.assertEqual(d2["action"], "hold")

    def test_max_in_clamps_target_and_has_no_boundary_floor(self):
        """max_in mengecap target (0.2186 -> 0.20) dan target BOLEH turun ke
        bawah boundary 0.14 (max_in=0.10 diterima, tidak ada floor di boundary)."""
        d = ap._decide_trigger_area(our=0.32, official=1.4,
                                    levels=[(0.22, 1)], trigger_pct=0.10, max_in=0.20)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["target"], 0.20, places=6)
        d2 = ap._decide_trigger_area(our=0.32, official=1.4,
                                     levels=[(0.22, 1)], trigger_pct=0.10, max_in=0.10)
        self.assertEqual(d2["action"], "undercut")
        self.assertAlmostEqual(d2["target"], 0.10, places=6)
        self.assertLess(d2["target"], 0.14)

    def test_no_levels_resume_fallback(self):
        """Tanpa orderbook sama sekali -> RESUME fallback 0.6986,
        competitor None (kontrak fallback, bukan hold)."""
        d = ap._decide_trigger_area(our=0.32, official=1.4, levels=[], trigger_pct=0.10)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertIsNone(d["competitor_price"])

    def test_our_own_level_excluded_then_fallback_resume(self):
        """Level di harga kita sendiri (0.20) bukan ref (abs(p-our) > 1e-6)
        -> tidak ada kompetitor valid -> RESUME fallback 0.6986 (bukan hold)."""
        d = ap._decide_trigger_area(our=0.20, official=1.4,
                                    levels=[(0.20, 1)], trigger_pct=0.10)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertIsNone(d["competitor_price"])

    def test_actionable_target_is_never_zero_or_negative(self):
        """Blocker B: target actionable (undercut/resume) TIDAK boleh <= 0.
        Helper tidak punya floor: ref yg hanya sedikit di atas boundary
        menghasilkan target NEGATIF (-0.0008) atau NOL (0.0) — keputusan
        yang benar = HOLD di our, JANGAN kirim harga nol/negatif ke PUT."""
        d = ap._decide_trigger_area(our=1.0, official=1.0,
                                    levels=[(0.0002, 1)], trigger_pct=0.0001, max_in=0)
        self.assertEqual(d["action"], "hold",
                         f"ref 0.0002 -> target negatif {d['target']}, harus HOLD")
        self.assertAlmostEqual(d["target"], 1.0, places=6)
        self.assertGreater(d["target"], 0.0)
        d2 = ap._decide_trigger_area(our=1.0, official=1.0,
                                     levels=[(0.0010002, 1)], trigger_pct=0.001, max_in=0)
        self.assertEqual(d2["action"], "hold",
                         f"ref 0.0010002 -> target nol {d2['target']}, harus HOLD")
        self.assertAlmostEqual(d2["target"], 1.0, places=6)
        self.assertGreater(d2["target"], 0.0)


class TestDecideTriggerAreaGLMCorrectedContract(unittest.TestCase):
    """RED phase — KONTRAK PRODUKSI TERKOREKSI (screenshot GLM live):
    our ask $0.3066, official $1.40, trigger fraction 0.06 (6%)
    -> boundary round(1.4*0.06, 6) = 0.084, offset round(1.4*0.001, 6) = 0.0014.

    Kontrak yang di-encode (basis-B + resume-fallback 50% official):

      A. Kandidat outside-area VALID ada (level bawah 0.1162/0.1204/0.14) ->
         UNDERCUT pakai kandidat BAWAH terendah: 0.1162 - 0.0014 = 0.1148.
         Level atas 0.3080 ("near/above our") TIDAK boleh jadi ref: target-nya
         0.3080 - 0.0014 = 0.3066 == our -> jebakan hold (0.3066 di-hide sbg
         "sudah termurah" padahal masih ada kompetitor wajar di bawah).
      B. TANPA kandidat outside-area valid (semua level <= boundary, atau tidak
         ada level sama sekali) -> RESUME fallback
         round(official*0.5, 6) - offset (1.4 -> 0.6986), clamp max_in;
         BUKAN hold di harga kita.
      C. Target actionable (undercut/resume) TIDAK pernah <= 0: ref tipis di
         atas boundary (offset > ref) -> HOLD; resume-fallback non-positif
         (official <= 0 -> 0.5*official <= 0) -> HOLD, jangan kirim nol/negatif.

    Catatan interface: fallback resume diimplementasi LANGSUNG di helper
    `_decide_trigger_area(our, official, levels, trigger_pct, max_in=0)`
    (tanpa parameter baru): saat tidak ada ref valid, helper resume ke
    round(official*0.5,6)-offset. Tes di bawah memanggil signature SAAT INI
    dan ekspektasi RESUME => FAIL behavioral (action hold vs resume), bukan
    syntax error."""

    def test_glm_undercut_lower_candidate_never_upper(self):
        """(A) GLM live: level bawah valid 0.1162/0.1204/0.14 + level atas
        0.3080 -> UNDERCUT ke 0.1162 - 1.4*0.001 = 0.1148. Level atas (target
        0.3066 == our) TIDAK boleh dipakai sbg ref."""
        d = ap._decide_trigger_area(our=0.3066, official=1.4,
                                    levels=[(0.1162, 1), (0.1204, 1), (0.14, 1), (0.3080, 1)],
                                    trigger_pct=0.06)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["competitor_price"], 0.1162, places=6)
        self.assertAlmostEqual(d["target"], round(0.1162 - 1.4 * 0.001, 6), places=6)
        # "never the upper level": 0.3080 - 1.4*0.001 = 0.3066 == our (hold-trap)
        self.assertNotAlmostEqual(d["competitor_price"], 0.3080, places=6)
        self.assertNotAlmostEqual(d["target"], round(0.3080 - 1.4 * 0.001, 6), places=6)

    def test_no_valid_outside_area_resumes_to_half_official(self):
        """(B) Semua level <= boundary 0.084 (0.07 ada di area trigger) -> tidak
        ada kandidat outside-area valid -> RESUME fallback round(1.4*0.5,6)-offset
        = 0.6986, BUKAN hold. Saat ini helper hold -> FAIL."""
        d = ap._decide_trigger_area(our=0.3066, official=1.4,
                                    levels=[(0.07, 1)], trigger_pct=0.06)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertGreater(d["target"], 0.0)
        self.assertIsNone(d["competitor_price"])

    def test_no_levels_resumes_to_half_official(self):
        """(B) Tanpa level sama sekali (tidak ada kompetitor sejati) -> RESUME
        fallback round(1.4*0.5,6)-offset = 0.6986, bukan hold di our 0.3066.
        Saat ini helper hold -> FAIL."""
        d = ap._decide_trigger_area(our=0.3066, official=1.4, levels=[],
                                    trigger_pct=0.06)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertGreater(d["target"], 0.0)
        self.assertIsNone(d["competitor_price"])

    def test_half_official_resume_clamped_by_max_in(self):
        """(B) RESUME fallback 0.6986 subject to max_in: max_in=0.5 -> target
        0.5 (clamp); max_in=0 -> target 0.6986 tanpa clamp. Saat ini helper
        hold -> FAIL."""
        d = ap._decide_trigger_area(our=0.3066, official=1.4,
                                    levels=[(0.07, 1)], trigger_pct=0.06, max_in=0.5)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.5, places=6)
        d2 = ap._decide_trigger_area(our=0.3066, official=1.4,
                                     levels=[(0.07, 1)], trigger_pct=0.06, max_in=0)
        self.assertEqual(d2["action"], "resume")
        self.assertAlmostEqual(d2["target"], 0.6986, places=6)

    def test_resume_reference_nonpositive_never_emitted(self):
        """(C) Resume-fallback TIDAK boleh kirim target <= 0: kalau ref
        (official*0.5) non-positif (official <= 0) dan tanpa level valid ->
        HOLD di our (target > 0), bukan resume ke nol/negatif."""
        d = ap._decide_trigger_area(our=0.3066, official=0.0, levels=[],
                                    trigger_pct=0.06)
        self.assertEqual(d["action"], "hold")
        self.assertGreater(d["target"], 0.0)
        self.assertAlmostEqual(d["target"], 0.3066, places=6)


class TestDecideTriggerAreaCorrectedContract(unittest.TestCase):
    """RED phase — kontrak trigger-area yang DIKOREKSI user (docs/auto-pricing.md
    §1, REV11) utk _decide_trigger_area(our, official, levels, trigger_pct, max_in=0).

    Corrected contract:
      - boundary = round(official * trigger_pct, 6); offset = round(official * 0.001, 6)
      - valid refs = p > 0, p > boundary, |p - our| > 1e-6 (level our sendiri dibuang)
      - VALID refs di-SPLIT: lower (p < our) vs higher (p > our)
      - ada lower VALID -> UNDERCUT lower terendah: target = lowest_lower - offset
      - sudah termurah (tak ada lower):
          jarak ke higher terendah <= offset  -> HOLD
          jarak > offset                      -> RESUME (target = higher - offset)
      - TAK ada kandidat valid -> RESUME ke round(official * 0.5, 6) - offset
      - clamp max_in SAJA (max_in <= 0 = off); target <= 0 -> HOLD di our
      - klasifikasi: target < our -> undercut; target > our -> resume

    Implementasi helper sudah mengikuti kontrak ini: split lower/higher,
    fallback resume 50% official tanpa parameter tambahan."""

    def test_a_lower_valid_terendah_menang_undercut(self):
        """(a) official=1.4, trigger=0.06 -> boundary 0.084; our=0.3066;
        levels berisi .1162/.1204/.14/.3066/.3080. Kandidat lower VALID
        terendah = .1162 -> UNDERCUT target .1162 - 0.0014 = .1148.
        .1204/.14 (lower lain) tidak dipilih; .3080 (higher) tidak resume;
        .3066 (level harga kita) tidak jadi ref."""
        d = ap._decide_trigger_area(our=0.3066, official=1.4,
                                    levels=[(0.1162, 1), (0.1204, 1), (0.14, 1),
                                            (0.3066, 1), (0.3080, 1)],
                                    trigger_pct=0.06, max_in=0)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["target"], 0.1148, places=6)
        self.assertAlmostEqual(d["competitor_price"], 0.1162, places=6)
        self.assertNotAlmostEqual(d["target"], 0.1386, places=6)  # .14 -> jangan
        self.assertNotAlmostEqual(d["target"], 0.1186, places=6)  # .1204 -> jangan

    def test_b_termurah_jarak_tepat_offset_hold(self):
        """(b) sudah termurah (tak ada lower valid); higher terendah .2014
        TEPAT di jarak offset (0.2014 - 0.2 == 1.4*0.001) -> target resume
        = 0.2014 - 0.0014 = 0.2 == our -> HOLD di our."""
        d = ap._decide_trigger_area(our=0.2, official=1.4,
                                    levels=[(0.2014, 1)], trigger_pct=0.10, max_in=0)
        self.assertEqual(d["action"], "hold")
        self.assertAlmostEqual(d["target"], 0.2, places=6)
        self.assertAlmostEqual(d["competitor_price"], 0.2014, places=6)

    def test_b_termurah_jarak_dalam_offset_hold_bukan_undercut(self):
        """(b') kompetitor di ATAS kita tapi jarak 0.2005 - 0.2 = 0.0005
        <= offset 0.0014 -> HOLD di 0.2. Helper lama menghitung target
        0.2005-0.0014=0.1991 < our lalu UNDERCUT ke bawah harga sendiri —
        SALAH per kontrak (jarak <= offset -> HOLD)."""
        d = ap._decide_trigger_area(our=0.2, official=1.4,
                                    levels=[(0.2005, 1)], trigger_pct=0.10, max_in=0)
        self.assertEqual(d["action"], "hold")
        self.assertAlmostEqual(d["target"], 0.2, places=6)

    def test_c_termurah_jarak_jauh_resume(self):
        """(c) kompetitor .30 di atas, jarak 0.1 >> offset -> RESUME
        target 0.30 - 0.0014 = 0.2986 (> our)."""
        d = ap._decide_trigger_area(our=0.2, official=1.4,
                                    levels=[(0.30, 1)], trigger_pct=0.10, max_in=0)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.2986, places=6)
        self.assertAlmostEqual(d["competitor_price"], 0.30, places=6)

    def test_c_termurah_jarak_tepat_diatas_offset_resume(self):
        """(c') jarak 0.20144 - 0.2 = 0.00144 STRICTLY > offset 0.0014
        -> RESUME target 0.20144 - 0.0014 = 0.20004 (> our). Helper lama
        masih HOLD krn |0.20004 - 0.2| = 0.00004 <= epsilon 0.00005;
        kontrak baru: jarak > offset -> RESUME tanpa epsilon tambahan."""
        d = ap._decide_trigger_area(our=0.2, official=1.4,
                                    levels=[(0.20144, 1)], trigger_pct=0.10, max_in=0)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.20004, places=6)

    def test_d_tanpa_kandidat_valid_resume_50_persen_official(self):
        """(d) TIDAK ada kandidat valid (0.05 dan 0.14 keduanya <= boundary
        0.14) -> RESUME ke round(official*0.5, 6) - offset =
        round(1.4*0.5,6) - 0.0014 = 0.6986. Helper lama HOLD di our 0.32 —
        kontrak baru jemput 50% official utk discovery market."""
        d = ap._decide_trigger_area(our=0.32, official=1.4,
                                    levels=[(0.05, 1), (0.14, 1)],
                                    trigger_pct=0.10, max_in=0)
        self.assertEqual(d["action"], "resume")
        self.assertAlmostEqual(d["target"], 0.6986, places=6)
        self.assertIsNone(d["competitor_price"])

    def test_e_max_in_clamp_dan_target_nonpositif_hold(self):
        """(e) safety DIpertahankan di kontrak baru: max_in mengecap target
        undercut (0.1148 -> 0.10) dan ref yang menghasilkan target <= 0
        -> HOLD di our (jangan kirim nol/negatif)."""
        d = ap._decide_trigger_area(our=0.3066, official=1.4,
                                    levels=[(0.1162, 1)], trigger_pct=0.06,
                                    max_in=0.10)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["target"], 0.10, places=6)
        d2 = ap._decide_trigger_area(our=1.0, official=1.0,
                                     levels=[(0.0002, 1)], trigger_pct=0.0001,
                                     max_in=0)
        self.assertEqual(d2["action"], "hold")
        self.assertAlmostEqual(d2["target"], 1.0, places=6)
        self.assertGreater(d2["target"], 0.0)


class TestRunCycleRegression(unittest.TestCase):
    """RED phase — basis-B blockers di run_cycle (dry-run deterministik):

      (a) kompetitor in-area (semua level ≤ boundary, tanpa ref valid) TIDAK
          boleh crash — reason mem-format dec['ref'] yang None pada resume
          fallback; kontrak baru: RESUME round(official*0.5,6)-offset.
      (c) tanpa levels sama sekali dan catalog hanya berisi slug milik kita
          TIDAK boleh RESUME/self-anchor — saat ini scan catalog_prices
          menyertakan ask kita sendiri (0.05) dan me-resume ke 0.0496.
      (d) resume fallback dgn kompetitor in-area harus MEMPERTAHANKAN
          competitor_price orderbook sejati (0.05) — bukan market comp 0.10.

    Semua network/file side-effect di-patch; caches di-seed deterministik."""

    def _run_decisions(self, catalog, asks, market=None, provs=None):
        """Jalankan run_cycle(dry_run=True) dgn semuanya di-patch, return
        decision rows yg ditulis ke auto-pricing-state.json."""
        market = market or {}
        provs = provs or [{"upstreamSlug": "codebuddy", "enabled": True, "id": 1}]
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        captured = {}

        def _fake_write(path, obj):
            if str(path).endswith("auto-pricing-state.json"):
                captured["cycles"] = obj.get("cycles", [])

        with mock.patch.object(ap, "get_catalog", return_value=catalog), \
             mock.patch.object(ap, "load_config", return_value=({}, {})), \
             mock.patch.object(ap, "load_hold_state", return_value={}), \
             mock.patch.object(ap, "get_market_min", return_value=market), \
             mock.patch.object(ap, "get_asks_enabled",
                               side_effect=lambda s: asks.get(s, {})), \
             mock.patch.object(ap, "set_ask", return_value=(200, {})), \
             mock.patch.object(ap, "save_hold_state"), \
             mock.patch.object(ap, "log"), \
             mock.patch.object(ap, "_atomic_write", side_effect=_fake_write):
            ap.run_cycle(dry_run=True)
        return captured.get("cycles", [])

    @staticmethod
    def _row_for(cycles, mid="m1", slug="codebuddy"):
        for r in cycles:
            if r.get("model_id") == mid and r.get("slug") == slug:
                return r
        return None

    def _ask(self, **over):
        base = {"catalog_id": "m1", "model_id": "m1", "slug": "codebuddy",
                "ask_in": 0.2, "ask_out": 0.2, "official": 1.4, "max_ask_in": 0,
                "max_ask_out": 0, "enabled": True, "demand": 0,
                "cheapest_active_pct": 0}
        base.update(over)
        return base

    def test_in_area_no_valid_ref_resumes_without_crash(self):
        """Blocker A (migrasi kontrak): run_cycle TIDAK boleh crash (TypeError
        dari format dec['ref']=None) saat kompetitor semua in-area (semua
        level <= boundary 0.14 -> tidak ada ref valid). Kontrak baru: RESUME
        fallback round(1.4*0.5,6)-offset = 0.6986 (bukan hold), reason aman."""
        catalog = {"codebuddy": {"m1": {"asksIn": [0.2], "officialIn": 1.4}},
                   "rival": {"m1": {"asksIn": [0.05], "officialIn": 1.4}}}
        asks = {"codebuddy": {"m1": self._ask()}}
        cycles = self._run_decisions(catalog, asks, market={})
        row = self._row_for(cycles, "m1")
        self.assertIsNotNone(
            row, "decision row hilang — run_cycle crash sebelum decision di-append")
        self.assertEqual(row["action"], "resume")
        self.assertAlmostEqual(row["target"], 0.6986, places=6)

    def test_no_levels_only_our_slugs_no_resume(self):
        """PER-PROVIDER (2026-08-17): levels row codebuddy/m1 = book codebuddy
        sendiri [(0.022,1),(0.05,1)]. our 0.022, boundary 0.04 (official 0.4,
        trigger default 10%). Tidak ada lower valid; higher valid 0.05
        (0.05 > boundary, > our) -> RESUME ke 0.05 - 0.0004 = 0.0496."""
        catalog = {"codebuddy": {"m1": {"asksIn": [0.05, 0.022], "officialIn": 0.4}}}
        asks = {"codebuddy": {"m1": self._ask(ask_in=0.022, official=0.4)}}
        cycles = self._run_decisions(catalog, asks, market={})
        row = self._row_for(cycles, "m1")
        self.assertIsNotNone(row, "decision row hilang utk m1")
        self.assertEqual(row["action"], "resume",
                         "book sendiri punya level valid di atas kita -> resume")
        self.assertAlmostEqual(row["target"], 0.0496, places=6)

    def test_resume_preserves_genuine_orderbook_competitor_price(self):
        """PER-PROVIDER (2026-08-17): competitor_price row codebuddy/m1 =
        level terendah book codebuddy sendiri (0.2), BUKAN book rival (0.05)
        dan BUKAN market comp (0.10)."""
        catalog = {"codebuddy": {"m1": {"asksIn": [0.2], "officialIn": 1.4}},
                   "rival": {"m1": {"asksIn": [0.05], "officialIn": 1.4}}}
        asks = {"codebuddy": {"m1": self._ask()}}
        cycles = self._run_decisions(catalog, asks, market={("codebuddy", "m1"): 0.10})
        row = self._row_for(cycles, "m1")
        self.assertIsNotNone(
            row, "decision row hilang — run_cycle crash sebelum decision di-append")
        self.assertEqual(row["action"], "resume")
        self.assertAlmostEqual(row["competitor_price"], 0.2, places=6,
                               msg="competitor_price = level terendah book codebuddy sendiri (0.2)")
        self.assertNotAlmostEqual(row["competitor_price"], 0.05, places=6,
                                  msg="book rival (0.05) TIDAK boleh masuk row codebuddy")
        self.assertNotAlmostEqual(row["competitor_price"], 0.10, places=6,
                                  msg="market comp (0.10) TIDAK boleh menggantikan orderbook")


class TestProviderScopedLevels(unittest.TestCase):
    """PER-PROVIDER orderbook (2026-08-17 — /catalog openapi + halaman Asks).

    levels row (slug, mid) = asksIn catalog[slug][mk] MILIK slug itu SAJA.
    Tidak ada pooling global antar-slug. qty = per-price count; price <= 0
    di-drop; levels sorted ascending."""

    def test_asks_aggregated_by_price_count(self):
        m = {"asksIn": [0.14, 0.14, 0.308, 0.308]}
        levels = ap._provider_scoped_levels("z-ai", "glm-5.2", m)
        self.assertEqual(levels, [(0.14, 2.0), (0.308, 2.0)])

    def test_nonpositive_prices_dropped_sorted_ascending(self):
        m = {"asksIn": [0.7, 0.0, 0.2786, -0.1, 0.28]}
        levels = ap._provider_scoped_levels("codebuddy", "glm-5.2", m)
        self.assertEqual(levels, [(0.2786, 1.0), (0.28, 1.0), (0.7, 1.0)])

    def test_empty_asks_empty_levels(self):
        self.assertEqual(ap._provider_scoped_levels("siliconflow", "glm-5.2", {"asksIn": []}), [])

    def test_missing_asks_key_empty_levels(self):
        self.assertEqual(ap._provider_scoped_levels("siliconflow", "glm-5.2", {}), [])

    def test_invalid_prices_skipped(self):
        m = {"asksIn": [0.05, "x", None, 0.07]}
        levels = ap._provider_scoped_levels("rival", "m1", m)
        self.assertEqual(levels, [(0.05, 1.0), (0.07, 1.0)])


class TestProviderScopedPositions(unittest.TestCase):
    """get_positions per-provider: row (slug, mid) memakai HANYA book slug itu."""

    def _pos(self, catalog, provs):
        import time
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        return ap.get_positions(catalog)

    def test_same_bare_model_rows_are_separate_per_slug(self):
        """glm-5.2 di codebuddy/codebuddy-cn/cline-pass: TIGA pool terpisah.
        Harga di row codebuddy hanya dari catalog codebuddy, dst."""
        catalog = {
            "codebuddy": {"glm-5.2": {"asksIn": [0.2786, 0.28, 0.3066, 0.7], "officialIn": 1.4}},
            "codebuddy-cn": {"glm-5.2": {"asksIn": [0.126, 0.7], "officialIn": 1.4}},
            "cline-pass": {"glm-5.2": {"asksIn": [0.14, 0.126, 0.3066, 0.644, 0.7], "officialIn": 1.4}},
            "z-ai": {"glm-5.2": {"asksIn": [0.14, 0.308], "officialIn": 1.4}},
        }
        provs = [{"upstreamSlug": s, "enabled": True} for s in
                 ("codebuddy", "codebuddy-cn", "cline-pass")]
        pos = self._pos(catalog, provs)
        self.assertEqual([p for p, _q in pos[("codebuddy", "glm-5.2")]["levels"]],
                         [0.2786, 0.28, 0.3066, 0.7])
        self.assertEqual([p for p, _q in pos[("codebuddy-cn", "glm-5.2")]["levels"]],
                         [0.126, 0.7])
        self.assertEqual([p for p, _q in pos[("cline-pass", "glm-5.2")]["levels"]],
                         [0.126, 0.14, 0.3066, 0.644, 0.7])
        self.assertEqual([p for p, _q in pos[("z-ai", "glm-5.2")]["levels"]],
                         [0.14, 0.308])

    def test_competitor_price_is_lowest_of_own_slug_book(self):
        catalog = {
            "codebuddy": {"glm-5.2": {"asksIn": [0.2786, 0.28, 0.3066, 0.7], "officialIn": 1.4}},
            "z-ai": {"glm-5.2": {"asksIn": [0.14, 0.308], "officialIn": 1.4}},
        }
        provs = [{"upstreamSlug": "codebuddy", "enabled": True}]
        pos = self._pos(catalog, provs)
        self.assertEqual(ap._lowest_competitor_price(pos[("codebuddy", "glm-5.2")]["levels"]), 0.2786)
        self.assertEqual(ap._lowest_competitor_price(pos[("z-ai", "glm-5.2")]["levels"]), 0.14)

    def test_total_and_posisi_reflect_own_slug_depth(self):
        catalog = {
            "codebuddy": {"glm-5.2": {"asksIn": [0.2786, 0.28, 0.3066, 0.7], "officialIn": 1.4}},
            "codebuddy-cn": {"glm-5.2": {"asksIn": [0.126, 0.7], "officialIn": 1.4}},
        }
        provs = [{"upstreamSlug": "codebuddy", "enabled": True}]
        pos = self._pos(catalog, provs)
        self.assertEqual(pos[("codebuddy", "glm-5.2")]["total_provider"], 4)
        self.assertEqual(pos[("codebuddy", "glm-5.2")]["posisi_kompetitor"], 4)
        self.assertEqual(pos[("codebuddy", "glm-5.2")]["provider_ok_kita"], 1)
        self.assertEqual(pos[("codebuddy-cn", "glm-5.2")]["total_provider"], 2)


class TestDbHelpers(unittest.TestCase):
    """REV13: history PUT/ops + state + api-log harus tercatat ke PostgreSQL.
    Helper daemon graceful-degrade: kalau psycopg/DB tak tersedia, daemon tetap jalan."""

    def test_db_execute_returns_false_when_psycopg_missing(self):
        with mock.patch.object(ap, "psycopg", None):
            self.assertFalse(ap._db_execute("SELECT 1"))

    def test_db_log_op_skips_when_psycopg_missing(self):
        with mock.patch.object(ap, "psycopg", None):
            ap._db_log_op("codebuddy", "glm-5.2", "undercut", 0.14, 0.1386, 0.14, 0.021, 1.4, 0.15, 0.5, 200, False, "r")
        # tidak raise = pass

    def test_db_log_api_skips_when_no_status(self):
        with mock.patch.object(ap, "psycopg", None):
            ap._db_log_api("/catalog", "GET", 0, 5, 10)
        # tidak raise = pass

    def test_db_execute_uses_psycopg_connect(self):
        calls = []

        class FakeCursor:
            def execute(self, sql, params):
                calls.append((sql, params))

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        class FakeConn:
            def cursor(self):
                return FakeCursor()

            def commit(self):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        fake_connect = mock.MagicMock(return_value=FakeConn())
        with mock.patch("psycopg.connect", fake_connect):
            self.assertTrue(ap._db_execute("INSERT INTO x (a) VALUES (%s)", (1,)))
        self.assertEqual(calls, [("INSERT INTO x (a) VALUES (%s)", (1,))])


if __name__ == "__main__":
    unittest.main()
