"""The damage chain: vinyl crackle, tape wobble, warmth.

This is where lofi actually lives. The crackle is modelled on a real
record, not generic static:

- a **surface bed** of pink-tilted noise, decorrelated between the
  channels the way groove noise is, breathing once per revolution;
- a dense rain of **micro-ticks** — the "frying" texture of vinyl;
- **clicks** built as a transient plus a short resonant ring, the way
  a stylus actually reports a defect (a noise burst sounds like a
  radio, a ring sounds like a record);
- **scratches that repeat every revolution** (33⅓ rpm = 1.8 s), the
  signature flaw of a real pressing: the same pop comes back around
  until the side ends.

Wobble warps the time axis of the finished mix (true varispeed pitch
drift, wow + flutter); warmth is a dust-dependent lowpass at mastering.
"""

import numpy as np

from .dsp import SR, lowpass, np_rng

REV_S = 1.8  # one revolution at 33 1/3 rpm


def _place_event(out: np.ndarray, sig: np.ndarray, pos: int, pan: float) -> None:
    if pos < 0 or pos >= len(out):
        return
    end = min(len(out), pos + len(sig))
    if end <= pos:
        return
    seg = sig[: end - pos]
    angle = (pan + 1.0) * np.pi / 4.0
    out[pos:end, 0] += seg * np.cos(angle)
    out[pos:end, 1] += seg * np.sin(angle)


def _click(rng: np.random.Generator, amp: float, ring_hz: float,
           ring_tau_ms: float, dur_ms: float) -> np.ndarray:
    """Transient + resonant ring: a stylus hitting a defect."""
    n = max(8, int(dur_ms * SR / 1000.0))
    t = np.arange(n) / SR
    transient = rng.standard_normal(n) * np.exp(-t / 0.00035)
    ring = np.sin(2 * np.pi * ring_hz * t) * np.exp(-t / (ring_tau_ms / 1000.0))
    thock = np.sin(2 * np.pi * 210.0 * t) * np.exp(-t / 0.0008)
    sig = 0.65 * transient + 0.55 * ring + 0.30 * thock
    peak = np.max(np.abs(sig)) or 1.0
    return sig / peak * amp


def crackle(duration_s: float, dust: float, seed: int) -> np.ndarray:
    """Stereo vinyl bed: surface noise, micro-ticks, clicks, and
    scratches repeating once per revolution. Density and level
    scale with `dust` (0..1)."""
    rng = np_rng(seed)
    n = int(duration_s * SR)
    out = np.zeros((n, 2))
    if dust <= 0.0 or n == 0:
        return out
    t = np.arange(n) / SR

    # --- surface bed: pink-tilted, decorrelated per channel, with a
    # once-per-revolution swell like a slightly warped pressing.
    for ch in range(2):
        white = rng.standard_normal(n)
        spec = np.fft.rfft(white)
        freqs = np.fft.rfftfreq(n, d=1.0 / SR)
        tilt = 1.0 / np.sqrt(np.maximum(freqs, 40.0))
        tilt /= tilt.max()
        bed = np.fft.irfft(spec * tilt, n=n)
        bed = lowpass(bed, 4200.0)
        bed /= (np.max(np.abs(bed)) or 1.0)
        swell = 0.85 + 0.15 * np.sin(2 * np.pi * t / REV_S + ch * 1.7)
        out[:, ch] += bed * swell * 0.011 * dust

    # --- micro-ticks: the continuous frying texture.
    ticks = int(dust * 70 * duration_s)
    for _ in range(ticks):
        pos = int(rng.integers(0, n))
        length = int(rng.integers(10, 55))
        amp = float(rng.uniform(0.008, 0.085)) * (0.25 + 0.75 * dust)
        idx = np.arange(length)
        sig = rng.standard_normal(length) * np.exp(-idx / (length / 3.0))
        peak = np.max(np.abs(sig)) or 1.0
        _place_event(out, sig / peak * amp, pos, float(rng.uniform(-0.85, 0.85)))

    # --- clicks: fewer, larger, each with its own ring pitch.
    clicks = int(dust * 5 * duration_s)
    for _ in range(clicks):
        pos = int(rng.integers(0, n))
        amp = float(rng.uniform(0.10, 0.42)) * (0.3 + 0.7 * dust)
        sig = _click(rng, amp,
                     ring_hz=float(rng.uniform(1600.0, 4200.0)),
                     ring_tau_ms=float(rng.uniform(0.7, 1.6)),
                     dur_ms=float(rng.uniform(2.5, 6.0)))
        _place_event(out, sig, pos, float(rng.uniform(-0.85, 0.85)))

    # --- scratches: a few flaws fixed on the record's surface, so
    # they return every 1.8 s with slightly varying force.
    n_scratches = 1 + int(rng.random() * (1.0 + dust * 2.0))
    revs = int(duration_s / REV_S) + 1
    for _ in range(n_scratches):
        phase = float(rng.uniform(0.1, REV_S - 0.1))
        base_amp = float(rng.uniform(0.16, 0.34)) * (0.3 + 0.7 * dust)
        ring_hz = float(rng.uniform(900.0, 1700.0))
        pan = float(rng.uniform(-0.7, 0.7))
        for rev in range(revs):
            pos = int((phase + rev * REV_S) * SR)
            if pos >= n:
                break
            amp = base_amp * float(rng.uniform(0.85, 1.15))
            sig = _click(rng, amp, ring_hz=ring_hz,
                         ring_tau_ms=float(rng.uniform(1.2, 2.2)),
                         dur_ms=float(rng.uniform(3.5, 7.0)))
            _place_event(out, sig, pos, pan)
    return out


def apply_wobble(buf: np.ndarray, wobble: float) -> np.ndarray:
    """Varispeed pitch drift: resample along a slowly warped time axis.
    wobble 0..1 scales both wow (0.09 Hz) and flutter (0.45 Hz) depth."""
    if wobble <= 0.0:
        return buf
    n = len(buf)
    t = np.arange(n) / SR
    rate = (1.0
            + wobble * 0.0035 * np.sin(2 * np.pi * 0.45 * t)
            + wobble * 0.0020 * np.sin(2 * np.pi * 0.09 * t + 1.3))
    idx = np.cumsum(rate)
    idx *= (n - 1) / idx[-1]
    base = np.arange(n)
    out = np.empty_like(buf)
    for ch in range(buf.shape[1]):
        out[:, ch] = np.interp(idx, base, buf[:, ch])
    return out
