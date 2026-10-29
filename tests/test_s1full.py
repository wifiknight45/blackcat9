"""S1-full tests: lead + pad voices and the richer arrangement.

Run: python3 -m unittest discover -s tests -v   (needs numpy)
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from kcat import voices
from kcat.dsp import SR
from kcat.recipes import generate_recipe
from kcat.render import render_recipe


class TestVoices(unittest.TestCase):
    def test_lead_note_decays_and_is_bounded(self):
        sig = voices.lead_note(76, 1.2, velocity=0.8)
        self.assertAlmostEqual(len(sig), int(1.2 * SR), delta=2)
        self.assertLessEqual(float(np.max(np.abs(sig))), 0.8 + 1e-6)
        half = len(sig) // 2
        rms = lambda x: float(np.sqrt(np.mean(x ** 2)))
        self.assertLess(rms(sig[half:]), rms(sig[:half]))

    def test_pad_is_stereo_and_decorrelated(self):
        sig = voices.pad_chord([57, 60, 64], 1.5)
        self.assertEqual(sig.shape, (int(1.5 * SR), 2))
        self.assertFalse(np.allclose(sig[:, 0], sig[:, 1]))
        self.assertLess(float(np.max(np.abs(sig))), 1.0)


class TestArrangement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = generate_recipe(7, "jazz-cat")
        cls.full = render_recipe(cls.recipe, bars=8)

    def test_deterministic_with_full_arrangement(self):
        again = render_recipe(self.recipe, bars=8)
        self.assertTrue(np.array_equal(self.full, again))

    def test_melody_changes_the_mix(self):
        no_mel = render_recipe(self.recipe, bars=8, melody=False)
        self.assertFalse(np.array_equal(self.full, no_mel))

    def test_pad_changes_the_mix(self):
        no_pad = render_recipe(self.recipe, bars=8, pad=False)
        self.assertFalse(np.array_equal(self.full, no_pad))


if __name__ == "__main__":
    unittest.main()
