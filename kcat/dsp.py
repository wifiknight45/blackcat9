"""Small DSP helpers: filters, envelopes, stereo placement.

Offline rendering lets us use zero-phase FFT filters — simple, fast,
and good-sounding for warmth/brightness shaping. Anything that must
run in real time later (the web engine) uses its own native nodes;
the recipe, not the filter, is the shared contract.
"""

import numpy as np

SR = 44100


def midi_freq(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def np_rng(seed_u64: int) -> np.random.Generator:
    """Deterministic numpy RNG seeded from our SplitMix64 world."""
    return np.random.default_rng(np.uint64(seed_u64 & 0xFFFFFFFFFFFFFFFF))


def _fft_filter(x: np.ndarray, cutoff: float, kind: str) -> np.ndarray:
    n = len(x)
    if n == 0:
        return x
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, d=1.0 / SR)
    if kind == "low":
        gain = 1.0 / (1.0 + (freqs / cutoff) ** 4)  # gentle 2nd-order-ish slope
    elif kind == "high":
        gain = 1.0 / (1.0 + (cutoff / np.maximum(freqs, 1.0)) ** 4)
        gain[0] = 0.0
    else:
        raise ValueError(kind)
    return np.fft.irfft(spec * gain, n=n)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    return _fft_filter(x, cutoff, "low")


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    return _fft_filter(x, cutoff, "high")


def bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return lowpass(highpass(x, lo), hi)


def adsr_env(n: int, attack_s: float, decay_tau_s: float,
             sustain: float = 0.0) -> np.ndarray:
    """Attack ramp into an exponential decay toward a sustain floor."""
    t = np.arange(n) / SR
    attack = 1.0 - np.exp(-t / max(attack_s, 1e-4))
    decay = sustain + (1.0 - sustain) * np.exp(-t / max(decay_tau_s, 1e-3))
    return attack * decay


def exp_env(n: int, tau_s: float, attack_s: float = 0.002) -> np.ndarray:
    t = np.arange(n) / SR
    attack = 1.0 - np.exp(-t / max(attack_s, 1e-4))
    return attack * np.exp(-t / max(tau_s, 1e-3))


def place(buf: np.ndarray, signal: np.ndarray, start: int, pan: float,
          gain: float) -> None:
    """Add a mono signal into a stereo buffer (shape (n, 2)) with
    constant-power panning. Clips safely at buffer edges."""
    if start >= len(buf):
        return
    if start < 0:
        # Humanization can push an event a few ms before zero; trim
        # the signal's head rather than wrapping around.
        signal = signal[-start:]
        start = 0
    end = min(len(buf), start + len(signal))
    if end <= start:
        return
    seg = signal[: end - start] * gain
    angle = (pan + 1.0) * np.pi / 4.0
    buf[start:end, 0] += seg * np.cos(angle)
    buf[start:end, 1] += seg * np.sin(angle)


def soft_clip(x: np.ndarray, drive: float = 1.15) -> np.ndarray:
    return np.tanh(x * drive) / np.tanh(drive)


def normalize_peak(x: np.ndarray, peak: float = 0.89) -> np.ndarray:
    m = np.max(np.abs(x))
    if m <= 0:
        return x
    return x * (peak / m)


def place_stereo(buf: np.ndarray, signal: np.ndarray, start: int,
                 gain: float) -> None:
    """Add a stereo signal of shape (n, 2) into the mix buffer."""
    if start < 0:
        signal = signal[-start:]
        start = 0
    if start >= len(buf):
        return
    end = min(len(buf), start + len(signal))
    if end <= start:
        return
    buf[start:end] += signal[: end - start] * gain
