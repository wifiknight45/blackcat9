"""The Moog module: ladder filter, drifting oscillators, glide, and
the three house patches (Taurus bass, singing lead, dark pad).

The heart is the ladder: four one-pole stages in a feedback loop,
the topology Moog patented and everyone since has copied. We run the
classic discrete version — each stage `y += g * (x - y)` with
g = 1 - exp(-2*pi*fc/sr) — with a tanh saturation where the feedback
re-enters, which is both authentic (the hardware's stages saturate)
and a seatbelt: stage inputs are bounded to +/-1, so resonance can
run right up to self-oscillation without ever blowing up the render.

Oscillators are additive band-limited saws (and squares) built from a
single phase trajectory, so tuning DRIFT (a seeded random walk in
cents) and GLIDE (an exponential pitch slew) are just ways of shaping
that trajectory before the harmonics are summed. No aliasing, no
phase discontinuities, deterministic from the seed.
"""

import math

import numpy as np

from .dsp import SR, adsr_env, midi_freq, np_rng
from .rng import SplitMix64

# Per-patch stream tags, same convention as render.py: each patch gets
# its own deterministic sub-stream derived from the caller's seed.
_TAG_TAURUS = 0x7A02
_TAG_LEAD = 0x1EAD
_TAG_PAD = 0x9AD0


def _seeded_rng(seed: int, tag: int) -> np.random.Generator:
    return np_rng(SplitMix64(seed ^ tag).next_u64())


def _tame(x: np.ndarray, ceiling: float = 0.92) -> np.ndarray:
    """Scale down (only) so the peak stays under the ceiling."""
    peak = np.max(np.abs(x)) if len(x) else 0.0
    if peak > ceiling:
        x = x * (ceiling / peak)
    return x


def _end_fade(x: np.ndarray, fade_s: float) -> np.ndarray:
    """Linear fade over the last fade_s seconds, so note ends
    never click. Length is preserved."""
    n = len(x)
    fade = min(n, int(fade_s * SR))
    if fade > 1:
        x[-fade:] *= np.linspace(1.0, 0.0, fade)
    return x


# ---------------------------------------------------------------- filter

def ladder_filter(x: np.ndarray, cutoff_hz, resonance: float,
                  sr: int = SR) -> np.ndarray:
    """Four-pole Moog-style ladder lowpass.

    `cutoff_hz` is a scalar or a per-sample array (for filter
    envelopes). `resonance` runs 0..1; 1.0 is the self-oscillation
    edge, kept bounded by tanh saturation in the feedback path.
    """
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    if n == 0:
        return x.copy()
    res = float(min(1.0, max(0.0, resonance)))
    k = 4.0 * res  # loop gain: oscillation threshold is k = 4

    fc = np.asarray(cutoff_hz, dtype=np.float64)
    fc = np.clip(fc, 10.0, 0.45 * sr)
    if fc.ndim == 0:
        g_list = None
        g_scalar = float(1.0 - math.exp(-2.0 * math.pi * float(fc) / sr))
    else:
        g_list = (1.0 - np.exp(-2.0 * np.pi * fc / sr)).tolist()
        g_scalar = 0.0

    xs = x.tolist()
    out = [0.0] * n
    s1 = s2 = s3 = s4 = 0.0
    tanh = math.tanh
    if g_list is None:
        g = g_scalar
        for i in range(n):
            v = tanh(xs[i] - k * s4)
            s1 += g * (v - s1)
            s2 += g * (s1 - s2)
            s3 += g * (s2 - s3)
            s4 += g * (s3 - s4)
            out[i] = s4
    else:
        for i in range(n):
            g = g_list[i]
            v = tanh(xs[i] - k * s4)
            s1 += g * (v - s1)
            s2 += g * (s1 - s2)
            s3 += g * (s2 - s3)
            s4 += g * (s3 - s4)
            out[i] = s4
    return np.asarray(out)


# ------------------------------------------------------------- oscillator

def _drift_cents(n: int, rng: np.random.Generator, amount: float,
                 sr: int) -> np.ndarray:
    """A smooth random walk in cents, peak-normalized to `amount`,
    plus a small static detune — the sound of a VCO warming up and
    never quite sitting still."""
    step = max(1, sr // 100)  # a new control point every ~10 ms
    m = int(math.ceil(n / step)) + 1
    walk = np.cumsum(rng.standard_normal(m))
    if m >= 5:
        walk = np.convolve(walk, np.ones(5) / 5.0, mode="same")
    peak = np.max(np.abs(walk)) or 1.0
    walk = walk * (amount / peak)
    cents = np.interp(np.arange(n), np.arange(m) * step, walk)
    cents += rng.uniform(-0.4 * amount, 0.4 * amount)
    return cents


def analog_osc(freq, dur_s: float, *, sr: int = SR,
               rng: np.random.Generator = None,
               drift_cents: float = 5.0, detune_cents: float = 0.0,
               square_mix: float = 0.0, sub: float = 0.0) -> np.ndarray:
    """Analog-style oscillator: a band-limited additive sawtooth,
    with optional square blend and a sub-octave sine.

    `freq` is a scalar Hz or a per-sample Hz array (e.g. a glide
    trajectory). Tuning drift is a seeded random walk; pass the same
    rng stream and the same seed upstream and the wobble is identical
    forever. Harmonic count is capped so partials stay below ~0.42*sr.
    """
    n = int(round(dur_s * sr))
    if n <= 0:
        return np.zeros(0)
    f0 = np.full(n, float(freq)) if np.ndim(freq) == 0 \
        else np.asarray(freq, dtype=np.float64)[:n]

    cents = np.full(n, float(detune_cents))
    if rng is not None and drift_cents > 0.0:
        cents = cents + _drift_cents(n, rng, drift_cents, sr)
    f = f0 * (2.0 ** (cents / 1200.0))

    phase = 2.0 * np.pi * np.cumsum(f) / sr
    fmax = float(np.max(f)) if n else 1.0
    kmax = int(min(48, max(1, 0.42 * sr / max(fmax, 1.0))))

    saw = np.zeros(n)
    square = np.zeros(n) if square_mix > 0.0 else None
    for kk in range(1, kmax + 1):
        partial = np.sin(kk * phase) / kk
        saw += partial
        if square is not None and kk % 2 == 1:
            square += partial
    # The infinite saw sum peaks at pi/2; 0.55 keeps partial sums tame.
    out = saw * 0.55
    if square is not None:
        out = out * (1.0 - square_mix) + square * 1.1 * square_mix
    if sub > 0.0:
        out = out + sub * np.sin(0.5 * phase)
    return out


# ----------------------------------------------------------------- glide

def glide_trajectory(midi_from: float, midi_to: float, dur_s: float,
                     tau_s: float, sr: int = SR) -> np.ndarray:
    """Per-sample midi trajectory slewing exponentially from
    `midi_from` to `midi_to` with time constant `tau_s` (seconds to
    cover ~63% of the remaining interval — constant-rate in cents,
    the way a real portamento circuit charges)."""
    n = int(round(dur_s * sr))
    t = np.arange(n) / sr
    return midi_to + (midi_from - midi_to) * np.exp(-t / max(tau_s, 1e-3))


# ---------------------------------------------------------------- patches

def taurus_bass(midi: float, dur_s: float, velocity: float = 1.0,
                seed: int = 0) -> np.ndarray:
    """Taurus-style bass: saw + sub sine through the ladder, with a
    punchy filter envelope that bites at the attack and settles into
    the floor. Deep, round, a little bit rude."""
    n = int(round(dur_s * SR))
    if n <= 0:
        return np.zeros(0)
    rng = _seeded_rng(seed, _TAG_TAURUS)
    t = np.arange(n) / SR
    osc = analog_osc(midi_freq(midi), dur_s, rng=rng,
                     drift_cents=3.0, sub=0.85)
    cutoff = 260.0 + 1500.0 * np.exp(-t / 0.13)
    y = ladder_filter(osc, cutoff, 0.38)
    y = y * adsr_env(n, 0.005, 0.25, sustain=0.80)
    y = _end_fade(y, 0.025)
    return _tame(y, 0.92) * velocity


def moog_lead(midi: float, dur_s: float, velocity: float = 1.0,
              seed: int = 0, glide_from: float = None,
              glide_s: float = 0.13) -> np.ndarray:
    """The singing lead: two saws a few cents apart, moderate
    resonance, vibrato that blooms in over the note. With
    `glide_from` (a midi note), the pitch slews exponentially from
    that note to the target — legato playing, Moog-style."""
    n = int(round(dur_s * SR))
    if n <= 0:
        return np.zeros(0)
    rng = _seeded_rng(seed, _TAG_LEAD)
    t = np.arange(n) / SR

    if glide_from is None:
        m_traj = np.full(n, float(midi))
    else:
        m_traj = glide_trajectory(glide_from, midi, dur_s, glide_s)
    # Vibrato blooms in: depth ramps up with a ~0.3 s time constant.
    vib = 6.0 * (1.0 - np.exp(-t / 0.30)) * np.sin(2.0 * np.pi * 5.4 * t)
    freq = midi_freq(m_traj + vib / 100.0)

    osc_a = analog_osc(freq, dur_s, rng=rng, drift_cents=4.0,
                       detune_cents=-6.0)
    osc_b = analog_osc(freq, dur_s, rng=rng, drift_cents=4.0,
                       detune_cents=6.0)
    mix = 0.5 * (osc_a + osc_b)

    cutoff = 2600.0 + 1400.0 * np.exp(-t / 0.25)
    y = ladder_filter(mix, cutoff, 0.50)
    y = y * adsr_env(n, 0.03, 0.40, sustain=0.85)
    y = _end_fade(y, 0.04)
    return _tame(y, 0.92) * velocity


def moog_pad(midis, dur_s: float, velocity: float = 1.0,
             seed: int = 0) -> np.ndarray:
    """Dark pad: every note is two detuned, drifting saws; the whole
    stack runs through one ladder at a low cutoff, the way a poly
    patch shares a filter. Slow swell in, gentle release out."""
    n = int(round(dur_s * SR))
    midis = list(midis)
    if n <= 0 or not midis:
        return np.zeros(max(0, n))
    rng = _seeded_rng(seed, _TAG_PAD)
    t = np.arange(n) / SR

    stack = np.zeros(n)
    for m in midis:
        for detune in (-9.0, 9.0):
            stack += analog_osc(midi_freq(m), dur_s, rng=rng,
                                drift_cents=6.0, detune_cents=detune)
    stack /= max(1.0, float(len(midis)))

    y = ladder_filter(stack, 800.0, 0.22)
    swell = 1.0 - np.exp(-t / max(0.35 * dur_s, 1e-3))
    release = np.clip((dur_s - t) / max(0.20 * dur_s, 1e-3), 0.0, 1.0)
    y = y * swell * np.minimum(1.0, release + 0.15)
    y = _end_fade(y, 0.03)
    return _tame(y, 0.90) * velocity
