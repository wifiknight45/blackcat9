"""Recipes: the deterministic DNA of a K-CAT song.

A recipe fully describes one track: seed, channel, tempo, key,
progression, feel knobs. Any engine (Python today, Web Audio later)
that reads the same recipe must produce the same musical events.
Recipes serialize to JSON and round-trip exactly.
"""

import json
from dataclasses import asdict, dataclass, field

from .rng import SplitMix64
from .theory import generate_progression

RECIPE_VERSION = 1

# The signature track: the first sound the app makes. Aubrey picked
# this render by ear on 2026-10-28 — seed 42 on DUST, "Shimokitazawa
# Umbrellas". The web console boots on this recipe; the radio idles
# here. Change it only on Aubrey's say-so.
SIGNATURE_SEED = 42
SIGNATURE_CHANNEL = "dusty"

# Channel presets: the three stations on the TUNING dial. Ranges are
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

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)

    @classmethod
    def from_json(cls, text: str) -> "Recipe":
        data = json.loads(text)
        if data.get("version") != RECIPE_VERSION:
            raise ValueError(f"unsupported recipe version {data.get('version')}")
        return cls(**data)


def generate_recipe(seed: int, channel: str) -> Recipe:
    """Build the full recipe for a seed on a channel. Deterministic."""
    if channel not in CHANNELS:
        raise ValueError(f"unknown channel {channel!r}")
    cfg = CHANNELS[channel]
    rng = SplitMix64(seed)

    title = generate_title(rng, folk=(channel == "minyo"))
    tempo = rng.randint(*cfg["tempo"])
    key_root = rng.choice(cfg["keys"])
    mode = rng.choice(cfg["modes"])
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
    )
