"""Synthesized instruments (slice set): electric piano and bass.

Both are additive sine-partial voices — naturally alias-free, which is
how the engine stays lightweight *and* clean. Envelopes do the
character work.
"""

import numpy as np

from .dsp import SR, adsr_env, exp_env, lowpass, midi_freq

# (harmonic ratio, gain, decay tau in seconds relative to note length)
_EP_PARTIALS = [
    (1.0, 1.00, 0.55),
    (2.0, 0.45, 0.32),
    (3.0, 0.22, 0.20),
    (4.0, 0.10, 0.12),
]


def ep_note(midi: float, dur_s: float, velocity: float = 1.0) -> np.ndarray:
    """One Rhodes-ish note: warm partial stack + a short tine ping."""
    freq = midi_freq(midi)
    n = max(1, int(dur_s * SR))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, gain, tau_frac in _EP_PARTIALS:
        # Higher partials decay faster; velocity brightens slightly.
        tau = max(0.05, dur_s * tau_frac * (0.8 + 0.4 * velocity))
        out += gain * np.sin(2 * np.pi * freq * ratio * t) * exp_env(n, tau, 0.004)
    # The tine: a brief inharmonic ping at the attack.
    tine_n = min(n, int(0.045 * SR))
    if tine_n > 8:
        tt = np.arange(tine_n) / SR
        out[:tine_n] += 0.14 * np.sin(2 * np.pi * freq * 13.7 * tt) * \
            np.exp(-tt / 0.012)
    return out * velocity


def ep_chord(midis, dur_s: float, velocity: float = 1.0,
             tremolo_hz: float = 4.6, tremolo_depth: float = 0.12) -> np.ndarray:
    """A chord is its notes plus the Rhodes tremolo across the whole."""
    n = max(1, int(dur_s * SR))
    out = np.zeros(n)
    for m in midis:
        note = ep_note(m, dur_s, velocity / max(1, len(midis) ** 0.5))
        out[: len(note)] += note
    t = np.arange(n) / SR
    out *= 1.0 - tremolo_depth * (0.5 + 0.5 * np.sin(2 * np.pi * tremolo_hz * t))
    return out


def bass_note(midi: float, dur_s: float, velocity: float = 1.0) -> np.ndarray:
    """Round electric bass: sine fundamental, a breath of 2nd harmonic,
    plucky attack decaying to a steady sustain."""
    freq = midi_freq(midi)
    n = max(1, int(dur_s * SR))
    t = np.arange(n) / SR
    env = adsr_env(n, 0.006, dur_s * 0.45, sustain=0.55)
    out = (np.sin(2 * np.pi * freq * t)
           + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
           + 0.10 * np.sin(2 * np.pi * freq * 3 * t))
    # Gentle release so note ends don't click.
    rel = min(n, int(0.03 * SR))
    if rel > 1:
        out[-rel:] *= np.linspace(1.0, 0.0, rel)
    return out * env * velocity


# (ratio, gain, decay-tau as a fraction of note length) — inharmonic
# partials are what make a vibraphone a vibraphone.
_LEAD_PARTIALS = [
    (1.0, 1.00, 0.60),
    (3.98, 0.30, 0.28),
    (9.24, 0.07, 0.10),
]


def lead_note(midi: float, dur_s: float, velocity: float = 1.0) -> np.ndarray:
    """The melody voice: vibraphone-ish bars with a slow tremolo that
    blooms in after the attack, Nujabes-style space around each note."""
    freq = midi_freq(midi)
    n = max(1, int(dur_s * SR))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, gain, tau_frac in _LEAD_PARTIALS:
        out += gain * np.sin(2 * np.pi * freq * ratio * t) * \
            exp_env(n, max(0.06, dur_s * tau_frac), 0.006)
    trem_ramp = 1.0 - np.exp(-t / 0.12)
    out *= 1.0 - 0.10 * trem_ramp * (0.5 + 0.5 * np.sin(2 * np.pi * 5.2 * t))
    peak = np.max(np.abs(out))
    if peak > 1.0:
        out /= peak  # the partial stack runs hot at the attack; tame it
    return out * velocity * 0.9


_PAD_PARTIALS = [(1.0, 1.0), (2.0, 0.38), (3.0, 0.16), (4.0, 0.05)]


def pad_chord(midis, dur_s: float, velocity: float = 1.0) -> np.ndarray:
    """Warm stereo pad: each note is two detuned additive stacks
    (left a few cents flat, right a few sharp), slow swell, gentle
    release into the next bar. Returns shape (n, 2)."""
    n = max(1, int(dur_s * SR))
    t = np.arange(n) / SR
    env = (1.0 - np.exp(-t / 0.45)) * (0.55 + 0.45 * np.exp(-t / 1.2))
    tail = min(n, int(0.25 * SR))
    if tail > 1:
        env[-tail:] *= np.linspace(1.0, 0.0, tail)
    out = np.zeros((n, 2))
    scale = velocity * 0.5 / max(1, len(midis) ** 0.5)
    for ch, cents in enumerate((-5.0, 5.0)):
        detune = 2.0 ** (cents / 1200.0)
        stack = np.zeros(n)
        for m in midis:
            freq = midi_freq(m) * detune
            for ratio, gain in _PAD_PARTIALS:
                stack += gain * np.sin(2 * np.pi * freq * ratio * t)
        out[:, ch] = lowpass(stack * env, 3000.0) * scale
    return out


def pluck_note(midi: float, dur_s: float, velocity: float = 1.0,
               seed: int = 0) -> np.ndarray:
    """A plucked string (Karplus-Strong): a burst of noise recirculating
    through a one-period delay line with a lowpass in the loop, so the
    harmonics die in order and a pure-ish tone remains — the physics of
    a koto or shamisen string, in miniature. Processed one period at a
    time, which keeps it fast. Deterministic for a given seed."""
    from .dsp import np_rng

    freq = midi_freq(midi)
    n = max(1, int(dur_s * SR))
    period = max(2, int(round(SR / freq)))
    rng = np_rng(seed)
    burst = rng.standard_normal(period)
    peak = np.max(np.abs(burst)) or 1.0
    cur = burst / peak
    out = np.empty(n)
    damping = 0.996
    prev_last = 0.0
    pos = 0
    while pos < n:
        take = min(period, n - pos)
        out[pos:pos + take] = cur[:take]
        shifted = np.empty(period)
        shifted[0] = prev_last
        shifted[1:] = cur[:-1]
        prev_last = cur[-1]
        cur = damping * 0.5 * (cur + shifted)
        pos += take
    tail = min(n, int(0.04 * SR))
    if tail > 1:
        out[-tail:] *= np.linspace(1.0, 0.0, tail)
    return out * velocity * 0.85
