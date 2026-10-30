"""S7c: audio regression goldens — the render path, exercised.

Pre-S7c nothing in the test stack rendered audio: both fuzzers
reported "0 renders", so a voice, the arrangement, or the master
chain could break silently. These goldens render short slices
(4 bars, ~2-5 s each) and pin length / peak / RMS per seed.

Tolerances, honestly chosen:
  * length is EXACT — it is pure arithmetic (bars x tempo x SR);
  * peak is tight (±0.02) — the master normalizes to 0.89 before
    the fades, so the peak is anchored by construction;
  * RMS is loose (±5% relative) — it is a mix statistic and drifts
    a little with numpy/FFT versions, which is exactly the variance
    the README's softened "same seed" claim describes.
A failure here means the *sound* changed: if the change was
intentional (a voice, the arrangement, a stream tag), re-measure
and re-pin consciously — don't just widen the tolerances.
"""
import unittest

import numpy as np

from kcat.dsp import SR
from kcat.recipes import generate_recipe
from kcat.render import render_recipe

# (seed, channel, bars, length_samples, peak, rms) — measured on the
# S7c tree (sections arrangement + crackle's own noise tag).
GOLDENS = [
    (42, "dusty", 4, 579945, 0.8900, 0.2114),
    (7, "jazz-cat", 4, 510072, 0.8503, 0.2098),
    (5, "minyo", 4, 717559, 0.8900, 0.2136),
    (99, "sunrise", 4, 516292, 0.8900, 0.2097),
    (42, "dusty", 8, 1159890, 0.8900, 0.1961),
]


class TestRenderGoldens(unittest.TestCase):
    def test_golden_renders(self):
        for seed, channel, bars, want_len, want_peak, want_rms in GOLDENS:
            with self.subTest(seed=seed, channel=channel, bars=bars):
                buf = render_recipe(generate_recipe(seed, channel), bars=bars)
                self.assertEqual(buf.shape, (want_len, 2))
                self.assertEqual(len(buf) / SR, want_len / SR)
                peak = float(np.max(np.abs(buf)))
                rms = float(np.sqrt(np.mean(buf ** 2)))
                self.assertLessEqual(peak, 0.891)
                self.assertAlmostEqual(peak, want_peak, delta=0.02)
                self.assertAlmostEqual(rms, want_rms, delta=want_rms * 0.05)
                self.assertTrue(np.all(np.isfinite(buf)))

    def test_silence_is_not_a_render(self):
        # A golden that accidentally rendered zeros would pass peak
        # checks on some paths — assert real energy in both channels.
        buf = render_recipe(generate_recipe(42, "dusty"), bars=2)
        for ch in range(2):
            self.assertGreater(float(np.max(np.abs(buf[:, ch]))), 0.3)


if __name__ == "__main__":
    unittest.main()
