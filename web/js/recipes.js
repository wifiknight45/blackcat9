// Recipes — faithful port of kcat/recipes.py.
//
// RNG draw order is part of the contract and mirrors the Python
// statement-for-statement, including short-circuits:
//  - the minyo tune roll only happens when channel == "minyo" and no
//    tune was forced (Python's `and` chain never draws otherwise);
//  - a tuned recipe draws NO title (the title is the tune's name);
//  - a tuned recipe draws NO mode (the mode is the tune's scale).

import { SplitMix64 } from "./rng.js";
import { generate_progression } from "./theory.js";
import { TUNES } from "./traditional.js";

export const RECIPE_VERSION = 1;

export const SIGNATURE_SEED = 42;
export const SIGNATURE_CHANNEL = "dusty";

export const CHANNELS = {
  "dusty": {
    "label": "DUST 88.5 — boom-bap & tape",
    "tempo": [68, 84],
    "modes": ["dorian", "natural_minor", "harmonic_minor"],
    "keys": ["C", "Eb", "F", "G", "Bb", "Ab"],
    "swing": [0.18, 0.30],
    "dust": [0.70, 1.00],
    "wobble": [0.40, 0.80],
    "melody_density": 0.50,
    "pad_level": 0.07,
    "drum_density": 1.0,
    "lead_voice": "vibes",
    "note_len": 1.0,
    "templates": ["lofi_minor_loop", "sad_city_vamp", "midnight_turnaround"],
  },
  "jazz-cat": {
    "label": "JAZZ CAT 94.7 — modal & melancholy",
    "tempo": [72, 90],
    "modes": ["dorian", "major", "mixolydian"],
    "keys": ["D", "F", "Eb", "A", "C", "Bb"],
    "swing": [0.10, 0.22],
    "dust": [0.40, 0.80],
    "wobble": [0.30, 0.60],
    "melody_density": 0.62,
    "pad_level": 0.15,
    "drum_density": 1.0,
    "lead_voice": "vibes",
    "note_len": 1.0,
    "templates": ["ii_V_I", "midnight_turnaround", "backdoor"],
  },
  "minyo": {
    "label": "MIN'YO 76.2 — folk songs & field rain",
    "tempo": [56, 72],
    "modes": ["in", "yo", "ryukyu"],
    "keys": ["A", "D", "G", "C", "E"],
    "swing": [0.00, 0.06],
    "dust": [0.50, 0.85],
    "wobble": [0.30, 0.60],
    "templates": ["folk_drift", "river_loop", "festival"],
    "melody_density": 0.38,
    "pad_level": 0.12,
    "drum_density": 0.45,
    "lead_voice": "pluck",
    "note_len": 1.9,
  },
  "wa-jazz": {
    "label": "KISSATEN 82.9 — jazz cafe & smoke",
    "tempo": [84, 104],
    "modes": ["dorian", "mixolydian", "lydian"],
    "keys": ["F", "Bb", "Eb", "G", "D"],
    "swing": [0.08, 0.18],
    "dust": [0.25, 0.50],
    "wobble": [0.20, 0.45],
    "templates": ["ii_V_I", "backdoor", "midnight_turnaround"],
    "melody_density": 0.70,
    "pad_level": 0.10,
    "drum_density": 1.0,
    "lead_voice": "vibes",
    "note_len": 0.8,
  },
  "sunrise": {
    "label": "SUNRISE 101.3 — warm & weightless",
    "tempo": [80, 100],
    "modes": ["major", "lydian"],
    "keys": ["C", "D", "F", "G", "A"],
    "swing": [0.00, 0.08],
    "dust": [0.15, 0.45],
    "wobble": [0.20, 0.50],
    "melody_density": 0.42,
    "pad_level": 0.24,
    "drum_density": 1.0,
    "lead_voice": "moog",
    "note_len": 1.1,
    "templates": ["sunrise_climb", "backdoor", "ii_V_I"],
  },
};

export const SECTION_FORMS = [
  ["intro", "verse", "verse", "bridge", "verse", "outro"],
  ["intro", "verse", "bridge", "verse", "verse", "outro"],
  ["intro", "verse", "verse", "verse", "bridge", "outro"],
];

const _PLACES = ["Ikebukuro", "Shimokitazawa", "Koenji", "Nakameguro",
  "Shinjuku", "Asakusa", "Kichijoji", "Ueno", "Ginza",
  "Daikanyama", "Sangenjaya", "Yanaka"];
const _WEATHER = ["Rain", "Wet Neon", "Umbrellas", "Puddles", "Steam",
  "Drizzle", "After the Rain", "Night Rain"];
const _TIMES = ["3AM", "Midnight", "Dusk", "Last Train", "First Light"];
const _FOLK_PLACES = ["Sado Island", "Aizu", "Shirakawa-go", "the Mogami River",
  "the Rice Fields", "Mount Asama", "Hida", "the Old Village"];
const _FOLK_IMAGES = ["Harvest Moon", "Fireflies", "First Snow", "River Mist",
  "Bamboo Wind", "Lanterns", "Cicadas", "Pine Smoke"];
const _FOLK_TIMES = ["Planting Season", "Festival Night", "Dusk", "First Light"];

export function generate_title(rng, folk = false) {
  const places = folk ? _FOLK_PLACES : _PLACES;
  const images = folk ? _FOLK_IMAGES : _WEATHER;
  const times = folk ? _FOLK_TIMES : _TIMES;
  const shape = rng.randint(0, 2);
  if (shape === 0) {
    return `${rng.choice(images)} over ${rng.choice(places)}`;
  }
  if (shape === 1) {
    return `${rng.choice(times)} in ${rng.choice(places)}`;
  }
  return `${rng.choice(places)} ${rng.choice(images)}`;
}

// Python round(x, 4): round-half-to-even on the (binary) value.
// The JS scaling introduces the same binary value Python sees in
// practice for these ranges; exact decimal ties at the 5th place do
// not occur for values drawn from a 53-bit random stream.
export function pyRound4(x) {
  const s = x * 10000;
  const f = Math.floor(s);
  const d = s - f;
  let n;
  if (d > 0.5) n = f + 1;
  else if (d < 0.5) n = f;
  else n = (f % 2 === 0) ? f : f + 1;
  return n / 10000;
}

export function generate_recipe(seed, channel, tune = null) {
  if (!(channel in CHANNELS)) {
    throw new Error(`unknown channel ${JSON.stringify(channel)}`);
  }
  if (tune !== null && tune !== undefined) {
    if (channel !== "minyo") {
      throw new Error("traditional tunes only play on the minyo channel");
    }
    if (!(tune in TUNES)) {
      throw new Error(`unknown tune ${JSON.stringify(tune)}`);
    }
  } else {
    tune = null;
  }
  const cfg = CHANNELS[channel];
  const rng = new SplitMix64(seed);

  if (channel === "minyo" && tune === null && rng.chance(0.5)) {
    tune = rng.choice(Object.keys(TUNES).sort());
  }
  const tuned = tune !== null;

  let title;
  if (tuned) {
    title = `${TUNES[tune].name} (traditional)`;
  } else {
    title = generate_title(rng, channel === "minyo");
  }
  const tempo_bpm = rng.randint(cfg.tempo[0], cfg.tempo[1]);
  const key_root = rng.choice(cfg.keys);
  const mode = tuned ? TUNES[tune].scale : rng.choice(cfg.modes);
  const swing = pyRound4(rng.uniform(cfg.swing[0], cfg.swing[1]));
  const dust = pyRound4(rng.uniform(cfg.dust[0], cfg.dust[1]));
  const wobble = pyRound4(rng.uniform(cfg.wobble[0], cfg.wobble[1]));
  const progression = generate_progression(rng, key_root, mode, cfg.templates);
  const sections = rng.choice(SECTION_FORMS).slice();
  const bars = 8 * sections.length;

  return {
    version: RECIPE_VERSION,
    seed: seed,
    channel: channel,
    title: title,
    tempo_bpm: tempo_bpm,
    key_root: key_root,
    mode: mode,
    bars: bars,
    swing: swing,
    dust: dust,
    wobble: wobble,
    progression: progression,
    sections: sections,
    tune: tune,
  };
}

// Serialize like Python's json.dumps(obj, indent=2, sort_keys=True):
// sorted keys at every level, 2-space indent, ensure_ascii string
// escaping, and float fields (swing/dust/wobble) keep a trailing
// ".0" when integral, as Python's float repr does.
const FLOAT_KEYS = new Set(["swing", "dust", "wobble"]);

function escapeString(s) {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20 || code > 0x7e) {
      if (code <= 0xffff) {
        out += "\\u" + code.toString(16).padStart(4, "0");
      } else {
        const v = code - 0x10000;
        out += "\\u" + (0xd800 + (v >> 10)).toString(16).padStart(4, "0");
        out += "\\u" + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
      }
    } else out += ch;
  }
  return out + '"';
}

function formatNumber(v, key) {
  if (FLOAT_KEYS.has(key) && Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}

function serialize(value, key, level) {
  const pad = "  ".repeat(level);
  const padIn = "  ".repeat(level + 1);
  if (value === null) return "null";
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "number") return formatNumber(value, key);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => padIn + serialize(v, null, level + 1));
    return "[\n" + items.join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0) return "{}";
  const items = keys.map(
    (k) => padIn + escapeString(k) + ": " + serialize(value[k], k, level + 1)
  );
  return "{\n" + items.join(",\n") + "\n" + pad + "}";
}

export function stringifyRecipe(recipe) {
  return serialize(recipe, null, 0);
}
