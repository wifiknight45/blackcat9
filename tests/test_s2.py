"""S2 tests: the Moog module — ladder filter, drift, glide, patches.

Run: python3 -m unittest discover -s tests -v   (needs numpy)
Buffers are kept short (<= ~1.2 s) so the sample-by-sample ladder
stays fast.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from kcat.dsp import SR, midi_freq, np_rng
from kcat.moog import (analog_osc, ladder_filter, moog_lead, moog_pad,
                       taurus_bass)


def _band_energy_ratio(x: np.ndarray, lo: float, hi: float) -> float:
    """Fraction of spectral energy in [lo, hi] Hz (steady-state tail)."""
    seg = x[len(x) // 2:]
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    freqs = np.fft.rfftfreq(len(seg), d=1.0 / SR)
    band = (freqs >= lo) & (freqs <= hi)
    return float(spec[band].sum() / (spec.sum() or 1.0))


def _peak_freq(x: np.ndarray, lo: float = 150.0, hi: float = 800.0) -> float:
    """Dominant frequency in a band, via a zero-padded Hann FFT.

    Zero-crossing counting is unreliable on sawtooths (the Gibbs
    ripple at the discontinuity adds phantom crossings); the spectral
    peak of the fundamental is not fooled."""
    seg = x * np.hanning(len(x))
    n_fft = 1 << 18
    spec = np.abs(np.fft.rfft(seg, n=n_fft))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / SR)
    band = (freqs >= lo) & (freqs <= hi)
    idx = int(np.argmax(spec[band]))
    return float(freqs[band][idx])


class TestLadder(unittest.TestCase):
    def test_high_resonance_noise_stays_bounded(self):
        rng = np_rng(1234)
        noise = rng.standard_normal(SR)  # 1 s of full-scale-ish noise
        y = ladder_filter(noise, 1000.0, 0.95)
        self.assertTrue(np.all(np.isfinite(y)))
        self.assertLess(float(np.max(np.abs(y))), 2.0)

    def test_self_oscillation_edge_is_bounded(self):
        x = np.zeros(SR // 2)
        x[0] = 1.0  # an impulse to excite the loop
        y = ladder_filter(x, 800.0, 1.0)
        self.assertTrue(np.all(np.isfinite(y)))
        self.assertLess(float(np.max(np.abs(y))), 2.0)

    def test_resonance_adds_energy_near_cutoff(self):
        saw = analog_osc(110.0, 1.0)  # clean saw, no drift
        fc = 1200.0
        plain = ladder_filter(saw, fc, 0.0)
        resonant = ladder_filter(saw, fc, 0.8)
        e_plain = _band_energy_ratio(plain, 0.6 * fc, 1.5 * fc)
        e_res = _band_energy_ratio(resonant, 0.6 * fc, 1.5 * fc)
        self.assertGreater(e_res, e_plain * 1.5)

    def test_per_sample_cutoff_accepted(self):
        x = analog_osc(220.0, 0.25)
        sweep = np.linspace(400.0, 4000.0, len(x))
        y = ladder_filter(x, sweep, 0.4)
        self.assertEqual(len(y), len(x))
        self.assertTrue(np.all(np.isfinite(y)))


class TestDrift(unittest.TestCase):
    def test_same_seed_identical(self):
        a = taurus_bass(38, 0.8, seed=5)
        b = taurus_bass(38, 0.8, seed=5)
        self.assertTrue(np.array_equal(a, b))

    def test_different_seed_differs(self):
        a = taurus_bass(38, 0.8, seed=5)
        c = taurus_bass(38, 0.8, seed=6)
        self.assertFalse(np.allclose(a, c))


class TestGlide(unittest.TestCase):
    def test_lead_glides_up_from_a_fifth_below(self):
        # A4 (69) approached from D4 (62): a perfect fifth below.
        y = moog_lead(69, 0.9, seed=3, glide_from=62)
        f_start = _peak_freq(y[: int(0.06 * SR)])
        f_end = _peak_freq(y[-int(0.2 * SR):])
        d_start = abs(np.log2(f_start / midi_freq(62)))
        d_target = abs(np.log2(f_start / midi_freq(69)))
        self.assertLess(d_start, d_target)
        self.assertAlmostEqual(f_end / midi_freq(69), 1.0, delta=0.04)


class TestPatches(unittest.TestCase):
    def _check(self, y: np.ndarray, dur_s: float):
        self.assertAlmostEqual(len(y), int(round(dur_s * SR)), delta=2)
        self.assertTrue(np.all(np.isfinite(y)))
        rms = float(np.sqrt(np.mean(y ** 2)))
        self.assertGreater(rms, 0.01)
        self.assertLessEqual(float(np.max(np.abs(y))), 1.0 + 1e-6)

    def test_taurus_bass(self):
        self._check(taurus_bass(36, 0.8, seed=1), 0.8)

    def test_moog_lead(self):
        self._check(moog_lead(69, 0.8, seed=1), 0.8)

    def test_moog_pad(self):
        self._check(moog_pad([57, 60, 64], 1.2, seed=1), 1.2)


if __name__ == "__main__":
    unittest.main()
