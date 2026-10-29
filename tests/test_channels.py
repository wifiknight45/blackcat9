"""Japanese stations tests: in/yo/ryukyu scales, the minyo and
wa-jazz channels, and the Karplus-Strong pluck voice.

Run: python3 -m unittest discover -s tests -v   (needs numpy)
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from kcat import voices
from kcat.recipes import generate_recipe
from kcat.render import render_recipe
from kcat.theory import scale_pcs


class TestJapaneseScales(unittest.TestCase):
    def test_in_scale_is_miyako_bushi(self):
        # A in-scale: A Bb D E F — the Sakura sound.
        self.assertEqual(scale_pcs("A", "in"), [9, 10, 2, 4, 5])

    def test_ryukyu_scale(self):
        self.assertEqual(scale_pcs("C", "ryukyu"), [0, 4, 5, 7, 11])

    def test_yo_scale(self):
        # D yo: D E G A B — the open festival scale, no semitones.
        self.assertEqual(scale_pcs("D", "yo"), [2, 4, 7, 9, 11])


class TestNewChannels(unittest.TestCase):
    def test_minyo_recipe_is_pentatonic_safe(self):
        for seed in range(12):
            r = generate_recipe(seed, "minyo")
            self.assertIn(r.mode, ("in", "yo", "ryukyu"))
            self.assertLessEqual(max(r.progression["degrees"]), 5)
            self.assertEqual(r.channel, "minyo")

    def test_wa_jazz_recipe(self):
        r = generate_recipe(24, "wa-jazz")
        self.assertIn(r.mode, ("dorian", "mixolydian", "lydian"))
        self.assertGreaterEqual(r.tempo_bpm, 84)

    def test_new_channels_round_trip(self):
        from kcat.recipes import Recipe
        for channel in ("minyo", "wa-jazz"):
            r = generate_recipe(3, channel)
            self.assertEqual(Recipe.from_json(r.to_json()), r)


class TestPluck(unittest.TestCase):
    def test_pluck_decays_bounded_deterministic(self):
        a = voices.pluck_note(69, 1.0, velocity=0.9, seed=5)
        b = voices.pluck_note(69, 1.0, velocity=0.9, seed=5)
        c = voices.pluck_note(69, 1.0, velocity=0.9, seed=6)
        self.assertTrue(np.array_equal(a, b))
        self.assertFalse(np.array_equal(a, c))
        self.assertLessEqual(float(np.max(np.abs(a))), 0.9 + 1e-6)
        q = len(a) // 4
        rms = lambda x: float(np.sqrt(np.mean(x ** 2)))
        self.assertLess(rms(a[-q:]), rms(a[:q]))


class TestNewChannelRenders(unittest.TestCase):
    def test_minyo_and_wa_jazz_render(self):
        for channel, seed in (("minyo", 9), ("wa-jazz", 24)):
            r = generate_recipe(seed, channel)
            buf = render_recipe(r, bars=4)
            self.assertEqual(buf.shape[1], 2)
            self.assertTrue(np.all(np.isfinite(buf)))
            self.assertGreater(float(np.sqrt(np.mean(buf ** 2))), 0.02)


if __name__ == "__main__":
    unittest.main()
