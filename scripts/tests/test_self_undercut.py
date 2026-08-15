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


if __name__ == "__main__":
    unittest.main()
