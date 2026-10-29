// Music theory core — faithful port of kcat/theory.py.
// JS object keys for the degree maps are strings, so lookups coerce
// the numeric degree; the data and algorithms are otherwise identical.

export const NOTE_TO_PC = {
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
};

export const PC_TO_NAME = {
  0: "C", 1: "Db", 2: "D", 3: "Eb", 4: "E", 5: "F",
  6: "Gb", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B",
};

export function pc_of(name) {
  return NOTE_TO_PC[name];
}

export function name_of(pc) {
  return PC_TO_NAME[((pc % 12) + 12) % 12];
}

export function midi_of(name, octave) {
  return 12 * (octave + 1) + pc_of(name);
}

export const SCALES = {
  "major": [0, 2, 4, 5, 7, 9, 11],
  "natural_minor": [0, 2, 3, 5, 7, 8, 10],
  "dorian": [0, 2, 3, 5, 7, 9, 10],
  "mixolydian": [0, 2, 4, 5, 7, 9, 10],
  "lydian": [0, 2, 4, 6, 7, 9, 11],
  "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
  "major_pentatonic": [0, 2, 4, 7, 9],
  "minor_pentatonic": [0, 3, 5, 7, 10],
  "in": [0, 1, 5, 7, 8],
  "yo": [0, 2, 5, 7, 9],
  "ryukyu": [0, 4, 5, 7, 11],
};

export function scale_pcs(root, mode) {
  const r = pc_of(root);
  return SCALES[mode].map((step) => (r + step) % 12);
}

export function scale_notes(root, mode, octave = 4) {
  const base = midi_of(root, octave);
  return SCALES[mode].map((step) => base + step);
}

export const CHORD_QUALITIES = {
  "maj7": [0, 4, 7, 11],
  "maj9": [0, 4, 7, 11, 14],
  "6/9": [0, 4, 7, 9, 14],
  "min7": [0, 3, 7, 10],
  "min9": [0, 3, 7, 10, 14],
  "min11": [0, 3, 7, 10, 14, 17],
  "dom7": [0, 4, 7, 10],
  "dom9": [0, 4, 7, 10, 14],
  "7sus": [0, 5, 7, 10],
};

export const DEGREE_QUALITIES = {
  "major": { 1: "maj9", 2: "min9", 3: "min7", 4: "maj9", 5: "dom9", 6: "min9", 7: "min7" },
  "lydian": { 1: "maj9", 2: "dom9", 3: "min7", 4: "min7", 5: "maj9", 6: "min9", 7: "min7" },
  "mixolydian": { 1: "dom9", 2: "min7", 3: "min7", 4: "maj9", 5: "min7", 6: "min7", 7: "maj9" },
  "natural_minor": { 1: "min9", 2: "min7", 3: "maj9", 4: "min9", 5: "min7", 6: "maj9", 7: "dom9" },
  "harmonic_minor": { 1: "min9", 2: "min7", 3: "maj9", 4: "min9", 5: "dom9", 6: "maj9", 7: "dom9" },
  "dorian": { 1: "min11", 2: "min7", 3: "maj9", 4: "dom9", 5: "min9", 6: "min7", 7: "maj9" },
  "in": { 1: "min7", 2: "7sus", 3: "min9", 4: "7sus", 5: "maj9" },
  "yo": { 1: "maj9", 2: "min7", 3: "7sus", 4: "maj7", 5: "min7" },
  "ryukyu": { 1: "maj9", 2: "maj7", 3: "7sus", 4: "maj7", 5: "dom7" },
};

export const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };

export function chord_pcs(root_pc, quality) {
  return CHORD_QUALITIES[quality].map((step) => (root_pc + step) % 12);
}

function mod12(n) {
  return ((n % 12) + 12) % 12;
}

export function voice_chord(root_pc, quality, drop2 = true) {
  const intervals = CHORD_QUALITIES[quality];
  let root_midi = 53 + mod12(root_pc - 53);
  if (root_midi > 64) root_midi -= 12;
  const notes = [root_midi];
  let prev = root_midi;
  for (const step of intervals.slice(1)) {
    const pc = mod12(root_pc + step);
    let n = prev + 1;
    while (n % 12 !== pc) n += 1;
    notes.push(n);
    prev = n;
  }
  if (drop2 && notes.length >= 4) {
    notes[notes.length - 2] -= 12;
    notes.sort((a, b) => a - b);
  }
  return notes;
}

export function chord_for_degree(root, mode, degree, quality = null) {
  const pcs = scale_pcs(root, mode);
  if (degree < 1 || degree > pcs.length) {
    throw new Error(`degree ${degree} out of range for ${mode}`);
  }
  const root_pc = pcs[degree - 1];
  const q = quality || DEGREE_QUALITIES[mode][degree];
  return {
    degree: degree,
    roman: ROMAN[degree],
    root: name_of(root_pc),
    root_pc: root_pc,
    quality: q,
    symbol: `${name_of(root_pc)}${q}`,
    pcs: chord_pcs(root_pc, q),
    notes: voice_chord(root_pc, q),
  };
}

export const PROGRESSION_TEMPLATES = {
  "ii_V_I": [2, 5, 1, 1],
  "lofi_minor_loop": [1, 6, 3, 7],
  "sad_city_vamp": [1, 1, 4, 4],
  "sunrise_climb": [1, 5, 6, 4],
  "backdoor": [1, 4, 7, 3],
  "midnight_turnaround": [1, 6, 2, 5],
  "folk_drift": [1, 1, 4, 5],
  "river_loop": [1, 3, 4, 1],
  "festival": [1, 5, 4, 5],
};

const WALK_WEIGHTS = [3, 1, 1, 2, 2, 2, 1];

export function walk_progression(rng, mode, length = 4) {
  const n_degrees = SCALES[mode].length;
  const items = [];
  for (let d = 1; d <= n_degrees; d++) items.push(d);
  const weights = WALK_WEIGHTS.slice(0, n_degrees);
  const degrees = [1];
  while (degrees.length < length) {
    const nxt = rng.weighted_choice(items, weights);
    // Python: `if nxt == degrees[-1] and rng.chance(0.7): continue`
    // — chance is only drawn when nxt repeats the previous degree.
    if (nxt === degrees[degrees.length - 1] && rng.chance(0.7)) {
      continue;
    }
    degrees.push(nxt);
  }
  return degrees;
}

export function generate_progression(rng, root, mode, templates) {
  let degrees, source;
  if (rng.chance(0.7)) {
    const name = rng.choice(templates);
    degrees = PROGRESSION_TEMPLATES[name].slice();
    source = `template:${name}`;
  } else {
    degrees = walk_progression(rng, mode, 4);
    source = "walk";
  }
  const chords = degrees.map((d) => chord_for_degree(root, mode, d));
  return { source: source, degrees: degrees, chords: chords };
}
