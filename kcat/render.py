"""The composer/renderer: turns a Recipe into stereo audio.

Scheduling is in 16th-note steps. Musical *decisions* (patterns,
stabs, humanization) come from SplitMix64 streams derived from the
recipe seed, so they are reproducible in any engine; numpy RNGs only
generate raw noise inside voices, which is texture, not composition.

Per-song arrangement for the slice: the first four bars are an intro
(EP + bass + hats, no kick drive or snare) when the render is 8+ bars.
"""

import wave

import numpy as np

from . import drums, moog, voices
from .damage import apply_wobble, crackle
from .dsp import SR, lowpass, normalize_peak, place, place_stereo, soft_clip
from .recipes import CHANNELS, Recipe
from .theory import SCALES, pc_of
from .rng import SplitMix64

# Stream tags: each subsystem gets its own deterministic stream so a
# change in one never reshuffles the others' decisions.
_TAG_DRUMS = 0xD001
_TAG_CHORDS = 0xC001
_TAG_BASS = 0xB001
_TAG_NOISE = 0xF001
_TAG_MELODY = 0xE001

_KICK_PATTERNS = [
    [0, 7, 10],
    [0, 6, 10],
    [0, 7, 8],
    [0, 10],
]
_STAB_PATTERNS = [  # in beats within the bar
    [],
    [2.5],
    [1.5, 3.0],
    [3.5],
    [0.75, 2.5],
]


def _bass_root_midi(root_pc: int) -> int:
    candidates = [m for m in range(30, 49) if m % 12 == root_pc]
    return min(candidates, key=lambda m: abs(m - 38))



def _melody_events(recipe: Recipe, bars: int, intro_bars: int):
    """A seeded lead line: random walk over the mode's scale, snapping
    to chord tones on strong steps, with a resting bar in every four —
    space is the Nujabes ingredient. Returns (abs_step, midi,
    dur_steps, velocity) tuples."""
    density = CHANNELS[recipe.channel]["melody_density"]
    rng = SplitMix64(recipe.seed ^ _TAG_MELODY)
    root_pc = pc_of(recipe.key_root)
    scale_pcs = {(root_pc + step) % 12 for step in SCALES[recipe.mode]}
    pool = [m for m in range(67, 87) if m % 12 in scale_pcs]
    chords = recipe.progression["chords"]
    candidates = [0, 3, 4, 6, 7, 8, 11, 12, 14]
    events = []
    idx = min(range(len(pool)), key=lambda i: abs(pool[i] - 76))
    for bar in range(intro_bars, bars):
        if bar % 4 == 2 and bar != bars - 1:
            continue
        chord = chords[bar % len(chords)]
        tones = {i for i, m in enumerate(pool) if m % 12 in chord["pcs"]}
        n_notes = rng.randint(2, 2 + int(5 * density))
        order = candidates[:]
        rng.shuffle(order)
        onsets = []
        for st in sorted(order):
            if all(abs(st - o) >= 2 for o in onsets):
                onsets.append(st)
            if len(onsets) >= n_notes:
                break
        onsets.sort()
        for j, step in enumerate(onsets):
            if step % 4 == 0 and tones:
                idx = min(tones, key=lambda i: abs(i - idx))
            else:
                idx = max(0, min(len(pool) - 1,
                                 idx + rng.choice([-2, -1, -1, 0, 1, 1, 2])))
            gap = (onsets[j + 1] - step) if j + 1 < len(onsets) else (16 - step)
            note_len = CHANNELS[recipe.channel].get("note_len", 1.0)
            dur_steps = max(1.5, min(float(gap), rng.uniform(2.5, 6.0) * note_len))
            events.append((bar * 16 + step, pool[idx], dur_steps,
                           rng.uniform(0.5, 0.78)))
    return events


def render_recipe(recipe: Recipe, bars: int = 16,
                  melody: bool = True, pad: bool = True) -> np.ndarray:
    bpm = recipe.tempo_bpm
    beat_s = 60.0 / bpm
    bar_s = 4 * beat_s
    step_s = bar_s / 16.0
    total_s = bars * bar_s
    n = int(total_s * SR)
    buf = np.zeros((n, 2))

    rng_drums = SplitMix64(recipe.seed ^ _TAG_DRUMS)
    rng_chords = SplitMix64(recipe.seed ^ _TAG_CHORDS)
    rng_bass = SplitMix64(recipe.seed ^ _TAG_BASS)
    noise = np.random.default_rng(np.uint64((recipe.seed ^ _TAG_NOISE) & (2**64 - 1)))

    def t_of(step: float) -> float:
        whole = int(step)
        t = step * step_s
        if whole % 2 == 1:
            t += recipe.swing * step_s
        return t

    def humanize(t: float, rng: SplitMix64) -> float:
        return t + (rng.random() * 2 - 1) * 0.006

    kick_pattern = _KICK_PATTERNS[rng_drums.randint(0, len(_KICK_PATTERNS) - 1)]
    chords = recipe.progression["chords"]
    intro_bars = 4 if bars >= 8 else 0

    for bar in range(bars):
        chord = chords[bar % len(chords)]
        bar_t = bar * bar_s
        intro = bar < intro_bars
        is_break = bars >= 16 and bar in (11, 15)

        # --- electric piano: long hit + seeded stabs + a top-note peek
        sig = voices.ep_chord(chord["notes"], bar_s * 0.95, velocity=0.9)
        place(buf, sig, int(bar_t * SR), pan=-0.15, gain=0.50)
        for beat in _STAB_PATTERNS[rng_chords.randint(0, len(_STAB_PATTERNS) - 1)]:
            t = t_of(bar * 16 + beat * 4)  # t_of takes song-relative steps
            stab = voices.ep_chord(chord["notes"], beat_s * 0.8, velocity=0.7)
            place(buf, stab, int(t * SR), pan=-0.15, gain=0.38)
        if rng_chords.chance(0.35):
            beat = rng_chords.choice([2.75, 3.5])
            t = t_of(bar * 16 + beat * 4)
            peek = voices.ep_note(max(chord["notes"]) + 12, beat_s * 0.5,
                                  velocity=0.5)
            place(buf, peek, int(t * SR), pan=-0.1, gain=0.35)

        # --- pad: warm stereo bed under the second half
        if pad and not intro:
            pad_sig = voices.pad_chord(chord["notes"], bar_s * 1.02)
            place_stereo(buf, pad_sig, int(bar_t * SR),
                         gain=CHANNELS[recipe.channel]["pad_level"])

        # --- bass: root anchor, fifth/octave bounce, chromatic approach
        root = _bass_root_midi(chord["root_pc"])
        nxt = chords[(bar + 1) % len(chords)]
        nxt_root = _bass_root_midi(nxt["root_pc"])
        bass_events = [(0.0, root, 1.1, 0.95), (2.0, root, 0.8, 0.85),
                       (3.0, nxt_root + rng_bass.choice([-1, 1, 2]), 0.5, 0.8)]
        if not rng_bass.chance(0.2):
            bass_events.append((1.5, root + rng_bass.choice([7, 12]), 0.45, 0.8))
        for beat, midi, dur_beats, vel in bass_events:
            t = bar_t + beat * beat_s
            note = voices.bass_note(midi, dur_beats * beat_s, velocity=vel)
            place(buf, note, int(t * SR), pan=0.0, gain=0.52)

        # --- drums
        for step in range(16):
            t = humanize(t_of(bar * 16 + step), rng_drums)
            start = int(t * SR)
            drum_density = CHANNELS[recipe.channel].get("drum_density", 1.0)
            if step in kick_pattern and not (intro and step != 0) and not (is_break and step != 0) and (step == 0 or drum_density >= 1.0 or rng_drums.chance(drum_density + 0.25)):
                place(buf, drums.kick(0.95), start, pan=0.0, gain=0.95)
            if step in (4, 12) and not intro and not is_break:
                place(buf, drums.snare(noise, 0.85), start, pan=0.05, gain=0.55)
            elif step == 15 and not intro and not is_break and rng_drums.chance(0.22):
                place(buf, drums.snare(noise, 0.3), start, pan=0.05, gain=0.4)
            if step % 2 == 0 and (drum_density >= 1.0 or step % 4 == 0 or rng_drums.chance(drum_density + 0.3)):
                vel = 0.8 if step % 4 == 0 else 0.55
                place(buf, drums.hat(noise, False, vel), start, pan=0.12, gain=0.30)
            elif not is_break and rng_drums.chance(0.30):
                place(buf, drums.hat(noise, False, 0.45), start, pan=0.12, gain=0.24)
            if step == 14 and not intro and not is_break and rng_drums.chance(0.45):
                place(buf, drums.hat(noise, True, 0.7), start, pan=0.12, gain=0.32)

    # --- the lead line, over the top; each station has its own voice
    if melody:
        voice = CHANNELS[recipe.channel].get("lead_voice", "vibes")
        prev_midi, prev_end = None, -99.0
        for abs_step, midi, dur_steps, vel in _melody_events(recipe, bars, intro_bars):
            dur_s = dur_steps * step_s
            note_seed = (recipe.seed ^ _TAG_MELODY ^ int(abs_step)) & (2 ** 64 - 1)
            if voice == "pluck":
                sig = voices.pluck_note(midi, dur_s, velocity=vel, seed=note_seed)
            elif voice == "moog":
                glide = prev_midi if abs_step - prev_end <= 2.5 else None
                sig = moog.moog_lead(midi, dur_s, velocity=vel,
                                     seed=note_seed, glide_from=glide)
            else:
                sig = voices.lead_note(midi, dur_s, velocity=vel)
            place(buf, sig, int(t_of(abs_step) * SR), pan=0.18, gain=0.42)
            prev_midi, prev_end = midi, abs_step + dur_steps

    # --- the room: crackle bed over everything
    buf += crackle(total_s, recipe.dust, recipe.seed ^ _TAG_NOISE)

    # --- master: warmth, wobble, gentle saturation, normalize, fades
    cutoff = 7000.0 + (4200.0 - 7000.0) * recipe.dust
    for ch in range(2):
        buf[:, ch] = lowpass(buf[:, ch], cutoff)
    buf = apply_wobble(buf, recipe.wobble)
    buf = soft_clip(buf, drive=1.12)
    buf = normalize_peak(buf, 0.89)
    fade_in = min(int(0.04 * SR), n)
    buf[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
    fade_out = min(int(1.4 * SR), n // 2)
    buf[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)[:, None]
    return buf


def write_wav(path: str, buf: np.ndarray) -> None:
    """Write a stereo float buffer as 16-bit PCM WAV (stdlib only)."""
    clipped = np.clip(buf, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
