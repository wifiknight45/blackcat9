"""Recipes: the deterministic DNA of a K-CAT song.

A recipe fully describes one track: seed, channel, tempo, key,
progression, feel knobs. Any engine (Python today, Web Audio later)
that reads the same recipe must produce the same musical events.
Recipes serialize to JSON and round-trip exactly.
"""

import json
from dataclasses import asdict, dataclass, field, fields

from .rng import SplitMix64
from .theory import NOTE_TO_PC, SCALES, generate_progression
from .traditional import TUNES

RECIPE_VERSION = 1

# The signature track: the first sound the app makes. Aubrey picked
# this render by ear on 2026-10-28 — seed 42 on DUST, "Shimokitazawa
# Umbrellas". The web console boots on this recipe; the radio idles
# here. Change it only on Aubrey's say-so.
SIGNATURE_SEED = 42
SIGNATURE_CHANNEL = "dusty"

# Channel presets: the five stations on the TUNING dial. Ranges are
# (min, max) drawn uniformly by the recipe RNG.
CHANNELS = {
    "dusty": {
        "label": "DUST 88.5 — boom-bap & tape",
        "tempo": (68, 84),
        "modes": ["dorian", "natural_minor", "harmonic_minor"],
        "keys": ["C", "Eb", "F", "G", "Bb", "Ab"],
        "swing": (0.18, 0.30),
        "dust": (0.70, 1.00),
        "wobble": (0.40, 0.80),
        "melody_density": 0.50,
        "pad_level": 0.07,
        "drum_density": 1.0,
        "lead_voice": "vibes",
        "note_len": 1.0,
        "templates": ["lofi_minor_loop", "sad_city_vamp",
                      "midnight_turnaround"],
    },
    "jazz-cat": {
        "label": "JAZZ CAT 94.7 — modal & melancholy",
        "tempo": (72, 90),
        "modes": ["dorian", "major", "mixolydian"],
        "keys": ["D", "F", "Eb", "A", "C", "Bb"],
        "swing": (0.10, 0.22),
        "dust": (0.40, 0.80),
        "wobble": (0.30, 0.60),
        "melody_density": 0.62,
        "pad_level": 0.15,
        "drum_density": 1.0,
        "lead_voice": "vibes",
        "note_len": 1.0,
        "templates": ["ii_V_I", "midnight_turnaround", "backdoor"],
    },
    "minyo": {
        "label": "MIN'YO 76.2 — folk songs & field rain",
        "tempo": (56, 72),
        "modes": ["in", "yo", "ryukyu"],
        "keys": ["A", "D", "G", "C", "E"],
        "swing": (0.00, 0.06),
        "dust": (0.50, 0.85),
        "wobble": (0.30, 0.60),
        "templates": ["folk_drift", "river_loop", "festival"],
        "melody_density": 0.38,
        "pad_level": 0.12,
        "drum_density": 0.45,
        "lead_voice": "pluck",
        "note_len": 1.9,
    },
    "wa-jazz": {
        "label": "KISSATEN 82.9 — jazz cafe & smoke",
        "tempo": (84, 104),
        "modes": ["dorian", "mixolydian", "lydian"],
        "keys": ["F", "Bb", "Eb", "G", "D"],
        "swing": (0.08, 0.18),
        "dust": (0.25, 0.50),
        "wobble": (0.20, 0.45),
        "templates": ["ii_V_I", "backdoor", "midnight_turnaround"],
        "melody_density": 0.70,
        "pad_level": 0.10,
        "drum_density": 1.0,
        "lead_voice": "vibes",
        "note_len": 0.8,
    },
    "sunrise": {
        "label": "SUNRISE 101.3 — warm & weightless",
        "tempo": (80, 100),
        "modes": ["major", "lydian"],
        "keys": ["C", "D", "F", "G", "A"],
        "swing": (0.00, 0.08),
        "dust": (0.15, 0.45),
        "wobble": (0.20, 0.50),
        "melody_density": 0.42,
        "pad_level": 0.24,
        "drum_density": 1.0,
        "lead_voice": "moog",
        "note_len": 1.1,
        "templates": ["sunrise_climb", "backdoor", "ii_V_I"],
    },
}

_SECTION_NAMES = {"intro", "verse", "bridge", "outro"}

SECTION_FORMS = [
    ["intro", "verse", "verse", "bridge", "verse", "outro"],
    ["intro", "verse", "bridge", "verse", "verse", "outro"],
    ["intro", "verse", "verse", "verse", "bridge", "outro"],
]

_PLACES = ["Ikebukuro", "Shimokitazawa", "Koenji", "Nakameguro",
           "Shinjuku", "Asakusa", "Kichijoji", "Ueno", "Ginza",
           "Daikanyama", "Sangenjaya", "Yanaka"]
_WEATHER = ["Rain", "Wet Neon", "Umbrellas", "Puddles", "Steam",
            "Drizzle", "After the Rain", "Night Rain"]
_TIMES = ["3AM", "Midnight", "Dusk", "Last Train", "First Light"]
_FOLK_PLACES = ["Sado Island", "Aizu", "Shirakawa-go", "the Mogami River",
                "the Rice Fields", "Mount Asama", "Hida", "the Old Village"]
_FOLK_IMAGES = ["Harvest Moon", "Fireflies", "First Snow", "River Mist",
                "Bamboo Wind", "Lanterns", "Cicadas", "Pine Smoke"]
_FOLK_TIMES = ["Planting Season", "Festival Night", "Dusk", "First Light"]


def generate_title(rng: SplitMix64, folk: bool = False) -> str:
    places = _FOLK_PLACES if folk else _PLACES
    images = _FOLK_IMAGES if folk else _WEATHER
    times = _FOLK_TIMES if folk else _TIMES
    shape = rng.randint(0, 2)
    if shape == 0:
        return f"{rng.choice(images)} over {rng.choice(places)}"
    if shape == 1:
        return f"{rng.choice(times)} in {rng.choice(places)}"
    return f"{rng.choice(places)} {rng.choice(images)}"


@dataclass
class Recipe:
    version: int
    seed: int
    channel: str
    title: str
    tempo_bpm: int
    key_root: str
    mode: str
    bars: int
    swing: float
    dust: float
    wobble: float
    progression: dict
    sections: list = field(default_factory=list)
    # Slug of an encoded traditional tune (kcat.traditional.TUNES),
    # carried only by MIN'YO recipes; None for fully generative
    # tracks. Defaulted so recipe JSON written before tunes existed
    # still loads.
    tune: str | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)

    @classmethod
    def from_json(cls, text: str) -> "Recipe":
        """Parse a recipe, validating the whole shape.

        Every problem raises ValueError naming the field and the
        offending value — an unknown mode, a mistyped tempo, or a
        stray extra key must fail here, at load time, not deep inside
        a renderer. (Pre-S7 this accepted mode="nope" and
        tempo_bpm="fast", and unknown keys raised a bare TypeError
        from the dataclass constructor.) The allowed key set is the
        dataclass itself; `sections` and `tune` are the only fields
        a payload may omit (they carry defaults). Mirrored by
        recipeFromJson in web/js/recipes.js — keep the two in step.
        """
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"invalid recipe JSON: {e}") from e
        if not isinstance(data, dict):
            raise ValueError(
                f"recipe JSON must be an object, got {type(data).__name__}")
        known = {f.name for f in fields(cls)}
        unknown = sorted(set(data) - known)
        if unknown:
            raise ValueError(
                f"unknown recipe field(s): {', '.join(unknown)}")
        optional = {"sections", "tune"}
        missing = sorted(known - set(data) - optional)
        if missing:
            raise ValueError(
                f"missing recipe field(s): {', '.join(missing)}")

        def _int(name):
            v = data[name]
            if isinstance(v, bool) or not isinstance(v, int):
                raise ValueError(
                    f"recipe field {name!r} must be an integer, got {v!r}")
            return v

        def _num(name):
            v = data[name]
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise ValueError(
                    f"recipe field {name!r} must be a number, got {v!r}")
            return v

        def _str(name):
            v = data[name]
            if not isinstance(v, str) or not v:
                raise ValueError(
                    f"recipe field {name!r} must be a non-empty string, "
                    f"got {v!r}")
            return v

        version = data["version"]
        if isinstance(version, bool) or not isinstance(version, int):
            raise ValueError(
                f"recipe field 'version' must be an integer, got {version!r}")
        if version != RECIPE_VERSION:
            raise ValueError(f"unsupported recipe version {version!r}")
        _int("seed")
        if _int("tempo_bpm") <= 0:
            raise ValueError(
                f"recipe field 'tempo_bpm' must be positive, "
                f"got {data['tempo_bpm']!r}")
        if _int("bars") <= 0:
            raise ValueError(
                f"recipe field 'bars' must be positive, got {data['bars']!r}")
        for name in ("swing", "dust", "wobble"):
            _num(name)
        channel = _str("channel")
        if channel not in CHANNELS:
            raise ValueError(
                f"unknown channel {channel!r} in recipe field 'channel'")
        _str("title")
        key_root = _str("key_root")
        if key_root not in NOTE_TO_PC:
            raise ValueError(
                f"unknown key_root {key_root!r} in recipe field 'key_root'")
        mode = _str("mode")
        if mode not in SCALES:
            raise ValueError(
                f"unknown mode {mode!r} in recipe field 'mode'")
        sections = data.get("sections", [])
        if (not isinstance(sections, list)
                or any(not isinstance(s, str) for s in sections)
                or any(s not in _SECTION_NAMES for s in sections)):
            raise ValueError(
                f"recipe field 'sections' must be a list drawn from "
                f"{sorted(_SECTION_NAMES)}, got {sections!r}")
        tune = data.get("tune")
        if tune is not None and tune not in TUNES:
            raise ValueError(
                f"unknown tune {tune!r} in recipe field 'tune'")
        progression = data["progression"]
        if not isinstance(progression, dict):
            raise ValueError(
                f"recipe field 'progression' must be an object, "
                f"got {progression!r}")
        chords = progression.get("chords")
        if (not isinstance(chords, list) or not chords
                or any(not isinstance(c, dict) for c in chords)
                or any(not isinstance(c.get("notes"), list) or not c["notes"]
                       or any(isinstance(n, bool) or not isinstance(n, int)
                              for n in c["notes"]) for c in chords)):
            raise ValueError(
                "recipe field 'progression.chords' must be a non-empty "
                "list of chords, each with a non-empty integer 'notes' list")
        return cls(**data)


def generate_recipe(seed: int, channel: str,
                    tune: str | None = None) -> Recipe:
    """Build the full recipe for a seed on a channel. Deterministic.

    On the minyo channel a recipe may carry a traditional tune (see
    kcat.traditional): pass ``tune`` to force one, or leave it None
    and the recipe RNG rolls 50/50 to feature one. A tuned recipe
    takes the tune's native scale as its mode — decided before the
    progression is generated, so the harmony fits the melody — and
    is titled after the tune. Other channels never carry tunes.
    """
    if channel not in CHANNELS:
        raise ValueError(f"unknown channel {channel!r}")
    if tune is not None:
        if channel != "minyo":
            raise ValueError(
                "traditional tunes only play on the minyo channel")
        if tune not in TUNES:
            raise ValueError(f"unknown tune {tune!r}")
    cfg = CHANNELS[channel]
    rng = SplitMix64(seed)

    if channel == "minyo" and tune is None and rng.chance(0.5):
        tune = rng.choice(sorted(TUNES))
    tuned = tune is not None

    if tuned:
        title = f"{TUNES[tune]['name']} (traditional)"
    else:
        title = generate_title(rng, folk=(channel == "minyo"))
    tempo = rng.randint(*cfg["tempo"])
    key_root = rng.choice(cfg["keys"])
    mode = TUNES[tune]["scale"] if tuned else rng.choice(cfg["modes"])
    swing = round(rng.uniform(*cfg["swing"]), 4)
    dust = round(rng.uniform(*cfg["dust"]), 4)
    wobble = round(rng.uniform(*cfg["wobble"]), 4)
    progression = generate_progression(rng, key_root, mode, cfg["templates"])
    sections = list(rng.choice(SECTION_FORMS))
    bars = 8 * len(sections)

    return Recipe(
        version=RECIPE_VERSION,
        seed=seed,
        channel=channel,
        title=title,
        tempo_bpm=tempo,
        key_root=key_root,
        mode=mode,
        bars=bars,
        swing=swing,
        dust=dust,
        wobble=wobble,
        progression=progression,
        sections=sections,
        tune=tune,
    )
