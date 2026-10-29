"""Synthesized drum kit: kick, snare, hats. No samples anywhere.

Kick is a pitch-swept sine, snare is shaped noise over a body tone,
hats are high-passed noise ticks. Patterns and humanization live in
the composer; this module only makes the sounds.
"""

import numpy as np

from .dsp import SR, bandpass, exp_env, highpass, np_rng


def kick(velocity: float = 1.0) -> np.ndarray:
    dur = 0.28
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = 43.0 + (120.0 - 43.0) * np.exp(-t / 0.045)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * exp_env(n, 0.105, 0.0015)
    return body * velocity


def snare(rng: np.random.Generator, velocity: float = 1.0) -> np.ndarray:
    dur = 0.19
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    snap = bandpass(noise, 1300.0, 5200.0) * exp_env(n, 0.042, 0.001)
    body = np.sin(2 * np.pi * 186.0 * t) * exp_env(n, 0.05, 0.001)
    out = snap * 0.85 + body * 0.5
    peak = np.max(np.abs(out)) or 1.0
    return (out / peak) * 0.9 * velocity


def hat(rng: np.random.Generator, open_hat: bool = False,
        velocity: float = 1.0) -> np.ndarray:
    dur = 0.32 if open_hat else 0.055
    tau = 0.085 if open_hat else 0.011
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = highpass(noise, 7800.0) * exp_env(n, tau, 0.0008)
    peak = np.max(np.abs(out)) or 1.0
    return (out / peak) * 0.55 * velocity
