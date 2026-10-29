"""S1 slice tests: the renderer produces real, deterministic audio.

Run: python3 -m unittest discover -s tests -v   (needs numpy)
"""

import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from kcat.dsp import SR
from kcat.recipes import generate_recipe
from kcat.render import render_recipe, write_wav


class TestRender(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = generate_recipe(42, "dusty")
        cls.buf = render_recipe(cls.recipe, bars=4)

    def test_duration_and_shape(self):
        bar_s = 4 * 60.0 / self.recipe.tempo_bpm
        expected = int(4 * bar_s * SR)
        self.assertEqual(self.buf.shape[1], 2)
        self.assertAlmostEqual(len(self.buf), expected, delta=int(0.05 * SR))

    def test_audio_is_real_and_bounded(self):
        peak = float(np.max(np.abs(self.buf)))
        rms = float(np.sqrt(np.mean(self.buf ** 2)))
        self.assertGreater(peak, 0.3)
        self.assertLessEqual(peak, 0.90)
        self.assertGreater(rms, 0.02)

    def test_render_is_deterministic(self):
        again = render_recipe(self.recipe, bars=4)
        self.assertTrue(np.array_equal(self.buf, again))

    def test_knobs_change_the_sound(self):
        import copy
        dry = copy.deepcopy(self.recipe)
        dry.dust = 0.0
        dry.swing = 0.0
        other = render_recipe(dry, bars=4)
        self.assertFalse(np.array_equal(self.buf, other))

    def test_wav_round_trip(self):
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fh:
            path = fh.name
        write_wav(path, self.buf)
        with wave.open(path, "rb") as w:
            self.assertEqual(w.getframerate(), SR)
            self.assertEqual(w.getnchannels(), 2)
            self.assertEqual(w.getsampwidth(), 2)
            self.assertEqual(w.getnframes(), len(self.buf))


if __name__ == "__main__":
    unittest.main()
