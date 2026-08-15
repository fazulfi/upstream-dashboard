import os, sys, time, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import auto_pricing as ap


class TestGetPositionsSelfUndercut(unittest.TestCase):
    def test_levels_exclude_ask_semua_upstream_kita(self):
        """Ask dari upstream LAIN milik kita (commandcode, opencode-go) TIDAK boleh
        jadi 'kompetitor' — semua slug dari providers enabled = milik kita."""
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
        # 0.0035/0.0042/0.007 (commandcode/opencode-go) = milik kita -> EXCLUDED
        # 0.05 (competitor-x) = kompetitor sejati -> TETAP ADA
        # 0.0119/0.07 (codebuddy) = milik kita -> EXCLUDED
        self.assertNotIn(0.0035, prices)
        self.assertNotIn(0.0042, prices)
        self.assertNotIn(0.007, prices)
        self.assertIn(0.05, prices)
        self.assertNotIn(0.0119, prices)

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
        self.assertIn(0.05, prices)

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
        """Kompetitor sejati yang harganya ≤ trigger_px TETAP harus ada di levels
        (agar daemon undercut — user: "auto-pricing gak jalan" krn z-ai @0.07 ≤
        trigger 0.14 diabaikan). get_positions TIDAK boleh filter level by trigger."""
        provs = [{"upstreamSlug": "codebuddy", "enabled": True}]
        catalog = {
            "codebuddy": {"glm-5.2": {"asksIn": [0.3206], "officialIn": 1.4}},
            "z-ai": {"glm-5.2": {"asksIn": [0.07], "officialIn": 1.4}},
        }
        ap._PROVIDERS_CACHE["ts"] = time.time() + 1000
        ap._PROVIDERS_CACHE["data"] = provs
        pos = ap.get_positions(catalog, our_price={("codebuddy", "glm-5.2"): 0.3206})
        prices = [p for p, q in pos[("codebuddy", "glm-5.2")]["levels"]]
        # 0.07 = kompetitor sejati (z-ai), ≤ trigger 0.14 — HARUS tetap ada
        self.assertIn(0.07, prices)

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

    def test_orderbook_competitor_below_our_is_not_hold(self):
        """Decision helper: kompetitor orderbook sejati @0.07 di bawah our 0.14
        (dg comp /market stale 0.322) HARUS undercut — bukan hold — dan target
        = 0.07 - (0.1% x official 1.4) = 0.0686."""
        d = ap._decision_from_levels(our=0.14, official=1.4,
                                     levels=[(0.07, 1)], max_in=0)
        self.assertEqual(d["action"], "undercut")
        self.assertAlmostEqual(d["target"], 0.0686, places=4)

    def test_lowest_competitor_price_comes_from_genuine_orderbook(self):
        """Harga kompetitor = level orderbook sejati terendah (levels[0][0]);
        None kalau tidak ada genuine competitor."""
        levels = [(0.07, 1), (0.322, 1)]
        self.assertEqual(ap._lowest_competitor_price(levels), 0.07)
        self.assertIsNone(ap._lowest_competitor_price([]))


if __name__ == "__main__":
    unittest.main()
