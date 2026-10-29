"""K-CAT radio: an endless station, rendered as a session.

A session is a deterministic sequence of tracks. It always opens
with the signature track (seed 42 on DUST — Aubrey's pick), then
wanders the dial: each next seed and station comes from the session
seed's SplitMix64 stream, so the same session seed replays the same
broadcast forever. Between tracks: a burst of tuning static and a
short synthesized station ident (the next channel's motif), with
equal-power crossfades throughout.

REC is the tape rack: with a tape dir, every track is also written
out individually, exactly as rendered, alongside a manifest — the
CLI ancestor of the console's wall of tapes.
"""

import json

import numpy as np

from . import voices
from .dsp import SR, bandpass, np_rng, place
from .recipes import (CHANNELS, SIGNATURE_CHANNEL, SIGNATURE_SEED,
                      Recipe, generate_recipe)
from .render import render_recipe
from .rng import SplitMix64

_TAG_SESSION = 0x9A17


def static_burst(duration_s: float = 1.3, seed: int = 0) -> np.ndarray:
    """Tuning static: band-swept noise with a rough AM tremor, the
    sound of the dial passing through empty air."""
    rng = np_rng(seed)
    n = int(duration_s * SR)
    noise = rng.standard_normal(n)
    # Sweep the passband down in three chunks: 3.4k -> 1.8k -> 900 Hz.
    out = np.zeros(n)
    edges = np.linspace(0, n, 4).astype(int)
    for i, hi in enumerate((3400.0, 1800.0, 950.0)):
        seg = slice(edges[i], edges[i + 1])
        out[seg] = bandpass(noise[seg], 300.0, hi)
    peak = np.max(np.abs(out)) or 1.0
    out = out / peak
    t = np.arange(n) / SR
    am = 0.75 + 0.25 * np.sin(2 * np.pi * 27.0 * t)
    env = np.sin(np.pi * np.arange(n) / max(1, n - 1)) ** 1.5
    stereo = np.stack([out * am * env, out * am * env], axis=1)
    return stereo * 0.5


def ident_for(recipe: Recipe) -> np.ndarray:
    """A 2.4 s station ident: the incoming channel's motif — three
    ascending chord tones in the station's own lead voice — over the
    tail of the static, with a soft chord swell beneath."""
    dur_s = 2.4
    n = int(dur_s * SR)
    buf = np.zeros((n, 2))
    chord = recipe.progression["chords"][0]
    voice = CHANNELS[recipe.channel].get("lead_voice", "vibes")
    motif = sorted(chord["notes"])[-3:]
    motif = [m + 12 for m in motif]
    swell = voices.ep_chord(chord["notes"], dur_s * 0.95, velocity=0.5)
    place(buf, swell, 0, pan=0.0, gain=0.20)
    for i, midi in enumerate(motif):
        t = int((0.25 + i * 0.22) * SR)
        dur = 0.9
        if voice == "pluck":
            sig = voices.pluck_note(midi, dur, velocity=0.8,
                                    seed=recipe.seed ^ (0x1DE17 + i))
        elif voice == "moog":
            from . import moog
            sig = moog.moog_lead(midi, dur, velocity=0.8,
                                 seed=recipe.seed ^ (0x1DE17 + i))
        else:
            sig = voices.lead_note(midi, dur, velocity=0.8)
        place(buf, sig, t, pan=0.1, gain=0.5)
    return buf


def plan_session(session_seed: int, channel: str = "all",
                 tracks: int = 6, signature: bool = True) -> list:
    """The tracklist for a session. Deterministic in the session seed.
    `channel` is a station name, or "all" to wander the whole dial."""
    if channel != "all" and channel not in CHANNELS:
        raise ValueError(f"unknown channel {channel!r}")
    rng = SplitMix64(session_seed ^ _TAG_SESSION)
    plan = []
    if signature:
        plan.append(generate_recipe(SIGNATURE_SEED, SIGNATURE_CHANNEL))
    stations = sorted(CHANNELS)
    while len(plan) < tracks:
        ch = channel if channel != "all" else rng.choice(stations)
        seed = int(rng.next_u64() % 1_000_000)
        if plan and seed == plan[-1].seed and ch == plan[-1].channel:
            continue
        plan.append(generate_recipe(seed, ch))
    return plan[:tracks]


def _xfade(a: np.ndarray, b: np.ndarray, fade_s: float) -> np.ndarray:
    n = int(min(fade_s * SR, len(a), len(b)))
    if n <= 0:
        return np.concatenate([a, b])
    t = np.linspace(0.0, np.pi / 2.0, n)[:, None]
    mid = a[-n:] * np.cos(t) + b[:n] * np.sin(t)
    return np.concatenate([a[:-n], mid, b[n:]])


def render_session(plan: list, session_seed: int = 0,
                   crossfade_s: float = 3.0, bridge_fade_s: float = 0.5,
                   track_bars: int = None, tape_dir: str = None):
    """Render a planned session to one continuous buffer + manifest.

    Bridges (static + ident) sit between tracks. With `tape_dir`,
    each track is also written there as its own WAV (the REC tapes).
    Returns (stereo_buffer, manifest list of dicts).
    """
    import os

    from .render import write_wav

    buf = None
    manifest = []
    cursor = 0.0
    for i, recipe in enumerate(plan):
        bars = track_bars if track_bars is not None else recipe.bars
        track = render_recipe(recipe, bars=bars)
        tape_file = None
        if tape_dir:
            os.makedirs(tape_dir, exist_ok=True)
            tape_file = os.path.join(
                tape_dir, f"tape-{i + 1:02d}-seed{recipe.seed}-{recipe.channel}.wav")
            write_wav(tape_file, track)
        if buf is None:
            start = 0.0
            buf = track
            cursor = len(track) / SR
        else:
            bridge = np.concatenate([
                static_burst(1.3, seed=session_seed + i),
                ident_for(recipe),
            ])
            buf = _xfade(buf, bridge, bridge_fade_s)
            cursor += len(bridge) / SR - bridge_fade_s
            start = cursor - crossfade_s  # track fades in under the ident tail
            buf = _xfade(buf, track, crossfade_s)
            cursor += len(track) / SR - crossfade_s
        manifest.append({
            "index": i + 1,
            "seed": recipe.seed,
            "channel": recipe.channel,
            "station": CHANNELS[recipe.channel]["label"],
            "title": recipe.title,
            "tempo_bpm": recipe.tempo_bpm,
            "key": f"{recipe.key_root} {recipe.mode}",
            "start_s": round(start, 2),
            "duration_s": round(len(track) / SR, 2),
            "tape": tape_file,
        })
    return buf, manifest


def manifest_json(manifest: list) -> str:
    return json.dumps(manifest, indent=2)
