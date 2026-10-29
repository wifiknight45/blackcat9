"""Music theory core: notes, scales, chords, voicings, progressions.

Everything here is pure functions over pitch classes and MIDI numbers,
deterministic and dependency-free. The web engine mirrors this module;
the recipe parity tests compare its outputs across implementations.
"""

from .rng import SplitMix64

# ---------------------------------------------------------------- notes

NOTE_TO_PC = {
    "C": 0, "B#": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4,
    "E#": 5, "F": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
}

# Preferred spellings for lofi-friendly keys.
PC_TO_NAME = {
    0: "C", 1: "Db", 2: "D", 3: "Eb", 4: "E", 5: "F",
    6: "Gb", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B",
}


def pc_of(name: str) -> int:
    return NOTE_TO_PC[name]


def name_of(pc: int) -> str:
    return PC_TO_NAME[pc % 12]


def midi_of(name: str, octave: int) -> int:
    """MIDI note number for e.g. ('Eb', 3). Middle C is C4 = 60."""
    return 12 * (octave + 1) + pc_of(name)


# ---------------------------------------------------------------- scales

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "natural_minor": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "major_pentatonic": [0, 2, 4, 7, 9],
    "minor_pentatonic": [0, 3, 5, 7, 10],
}


def scale_pcs(root: str, mode: str) -> list:
    r = pc_of(root)
    return [(r + step) % 12 for step in SCALES[mode]]


def scale_notes(root: str, mode: str, octave: int = 4) -> list:
    base = midi_of(root, octave)
    return [base + step for step in SCALES[mode]]


# ---------------------------------------------------------------- chords

# Chord qualities as semitone stacks from the root.
CHORD_QUALITIES = {
    "maj7": [0, 4, 7, 11],
    "maj9": [0, 4, 7, 11, 14],
    "6/9": [0, 4, 7, 9, 14],
    "min7": [0, 3, 7, 10],
    "min9": [0, 3, 7, 10, 14],
    "min11": [0, 3, 7, 10, 14, 17],
    "dom7": [0, 4, 7, 10],
    "dom9": [0, 4, 7, 10, 14],
    "7sus": [0, 5, 7, 10],
}

# Default quality per scale degree (1-based) for the modes we compose in.
DEGREE_QUALITIES = {
    "major": {1: "maj9", 2: "min9", 3: "min7", 4: "maj9",
              5: "dom9", 6: "min9", 7: "min7"},
    "lydian": {1: "maj9", 2: "dom9", 3: "min7", 4: "min7",
               5: "maj9", 6: "min9", 7: "min7"},
    "mixolydian": {1: "dom9", 2: "min7", 3: "min7", 4: "maj9",
                   5: "min7", 6: "min7", 7: "maj9"},
    "natural_minor": {1: "min9", 2: "min7", 3: "maj9", 4: "min9",
                      5: "min7", 6: "maj9", 7: "dom9"},
    "harmonic_minor": {1: "min9", 2: "min7", 3: "maj9", 4: "min9",
                       5: "dom9", 6: "maj9", 7: "dom9"},
    "dorian": {1: "min11", 2: "min7", 3: "maj9", 4: "dom9",
               5: "min9", 6: "min7", 7: "maj9"},
}

ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII"}


def chord_pcs(root_pc: int, quality: str) -> list:
    return [(root_pc + step) % 12 for step in CHORD_QUALITIES[quality]]


def voice_chord(root_pc: int, quality: str, drop2: bool = True) -> list:
    """Voice a chord as MIDI notes in an EP-friendly register.

    The root lands in the 53..64 window; remaining tones stack upward
    in close position. With drop2, the second-highest voice drops an
    octave, opening the voicing the way a Rhodes player would.
    """
    intervals = CHORD_QUALITIES[quality]
    root_midi = 53 + ((root_pc - 53) % 12)
    if root_midi > 64:
        root_midi -= 12
    notes = [root_midi]
    prev = root_midi
    for step in intervals[1:]:
        pc = (root_pc + step) % 12
        n = prev + 1
        while n % 12 != pc:
            n += 1
        notes.append(n)
        prev = n
    if drop2 and len(notes) >= 4:
        notes[-2] -= 12
        notes.sort()
    return notes


def chord_for_degree(root: str, mode: str, degree: int,
                     quality: str = None) -> dict:
    """Build the diatonic chord for a 1-based scale degree."""
    pcs = scale_pcs(root, mode)
    if not 1 <= degree <= len(pcs):
        raise ValueError(f"degree {degree} out of range for {mode}")
    root_pc = pcs[degree - 1]
    q = quality or DEGREE_QUALITIES[mode][degree]
    return {
        "degree": degree,
        "roman": ROMAN[degree],
        "root": name_of(root_pc),
        "root_pc": root_pc,
        "quality": q,
        "symbol": f"{name_of(root_pc)}{q}",
        "pcs": chord_pcs(root_pc, q),
        "notes": voice_chord(root_pc, q),
    }


# ------------------------------------------------------------ progressions

# Named progressions as degree sequences, per family. The composer also
# generates walks; these are the proven changes.
PROGRESSION_TEMPLATES = {
    "ii_V_I": [2, 5, 1, 1],
    "lofi_minor_loop": [1, 6, 3, 7],
    "sad_city_vamp": [1, 1, 4, 4],
    "sunrise_climb": [1, 5, 6, 4],
    "backdoor": [1, 4, 7, 3],
    "midnight_turnaround": [1, 6, 2, 5],
}

# Transition weights for the random-walk composer: from any degree,
# these degrees are favoured next. Index 0 unused (degrees are 1-based).
_WALK_WEIGHTS = [3, 1, 1, 2, 2, 2, 1]


def walk_progression(rng: SplitMix64, mode: str, length: int = 4) -> list:
    degrees = [1]
    while len(degrees) < length:
        nxt = rng.weighted_choice([1, 2, 3, 4, 5, 6, 7], _WALK_WEIGHTS)
        if nxt == degrees[-1] and rng.chance(0.7):
            continue  # usually avoid immediate repeats
        degrees.append(nxt)
    return degrees


def generate_progression(rng: SplitMix64, root: str, mode: str,
                         templates: list) -> dict:
    """Pick a named template (70%) or a random walk (30%), deterministically."""
    if rng.chance(0.7):
        name = rng.choice(templates)
        degrees = PROGRESSION_TEMPLATES[name]
        source = f"template:{name}"
    else:
        degrees = walk_progression(rng, mode, length=4)
        source = "walk"
    chords = [chord_for_degree(root, mode, d) for d in degrees]
    return {"source": source, "degrees": degrees, "chords": chords}
