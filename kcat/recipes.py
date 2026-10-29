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
        "templates": ["ii_V_I", "midnight_turnaround", "backdoor"],
    },
    "sunrise": {
        "label": "SUNRISE 101.3 — warm & weightless",
        "tempo": (80, 100),
        "modes": ["major", "lydian"],
        "keys": ["C", "D", "F", "G", "A"],
        "swing": (0.00, 0.08),
        "dust": (0.15, 0.45),
        "wobble": (0.20, 0.50),
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


def generate_title(rng: SplitMix64) -> str:
    shape = rng.randint(0, 2)
    if shape == 0:
        return f"{rng.choice(_WEATHER)} over {rng.choice(_PLACES)}"
    if shape == 1:
        return f"{rng.choice(_TIMES)} in {rng.choice(_PLACES)}"
    return f"{rng.choice(_PLACES)} {rng.choice(_WEATHER)}"


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

    title = generate_title(rng)
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
