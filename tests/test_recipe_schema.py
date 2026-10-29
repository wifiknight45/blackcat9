"""Recipe schema: every generated recipe, on every station, is whole.

A recipe is the contract between the two renderers — if a field is
missing or out of range, both engines break in different ways. This
sweeps a seed spread across all channels and checks the shape.
"""
import unittest

from kcat.recipes import CHANNELS, generate_recipe

SEEDS = [0, 1, 7, 42, 1234, 999999]


class TestRecipeSchema(unittest.TestCase):
    def check_recipe(self, r):
        cfg = CHANNELS[r.channel]
        self.assertIsInstance(r.title, str)
        self.assertTrue(r.title.strip())
        self.assertGreaterEqual(r.tempo_bpm, cfg["tempo"][0])
        self.assertLessEqual(r.tempo_bpm, cfg["tempo"][1])
        self.assertIn(r.mode, cfg["modes"])
        self.assertIn(r.key_root, cfg["keys"])
        self.assertGreaterEqual(r.swing, cfg["swing"][0] - 1e-9)
        self.assertLessEqual(r.swing, cfg["swing"][1] + 1e-9)
        self.assertGreaterEqual(r.dust, cfg["dust"][0] - 1e-9)
        self.assertLessEqual(r.dust, cfg["dust"][1] + 1e-9)
        self.assertGreaterEqual(r.wobble, cfg["wobble"][0] - 1e-9)
        self.assertLessEqual(r.wobble, cfg["wobble"][1] + 1e-9)
        self.assertIsInstance(r.version, int)
        self.assertGreaterEqual(r.version, 1)
        self.assertGreaterEqual(r.bars, 8)
        chords = r.progression["chords"]
        self.assertGreaterEqual(len(chords), 2)
        for ch in chords:
            self.assertTrue(ch["symbol"])
            self.assertTrue(ch["notes"])
            for n in ch["notes"]:
                self.assertIsInstance(n, int)
                self.assertGreaterEqual(n, 24)
                self.assertLessEqual(n, 100)

    def test_schema_across_stations_and_seeds(self):
        for channel in CHANNELS:
            for seed in SEEDS:
                with self.subTest(channel=channel, seed=seed):
                    self.check_recipe(generate_recipe(seed, channel))

    def test_forced_traditional_tunes_keep_schema(self):
        for tune in ("sakura", "furusato"):
            with self.subTest(tune=tune):
                r = generate_recipe(5, "minyo", tune)
                self.assertEqual(r.tune, tune)
                self.check_recipe(r)


if __name__ == "__main__":
    unittest.main()
