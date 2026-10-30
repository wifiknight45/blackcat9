// The composer — recipe -> deterministic event lists.
//
// A faithful port of the composition half of kcat/render.py (the
// audio half lives in voices.js / drums.js / crackle.js / player.js).
// Scheduling is in 16th-note steps; every musical *decision* — kick
// pattern, stabs, peeks, bass ornaments, drum gates, humanization,
// the melody walk — is drawn from SplitMix64 streams derived from
// the recipe seed, exactly as in Python.
//
// RNG DRAW ORDER (the contract): this module mirrors render.py
// statement-for-statement, including short-circuits, so the streams
// stay in lockstep with Python and the resulting event lists are
// identical, not merely similar:
//
//   drums stream (seed ^ 0xD001):
//     1 draw  — kick pattern choice, before the bar loop;
//     per bar, per step 0..15, in order:
//       1 draw  — humanize (always, even if nothing sounds);
//       kick gate draw only when the Python `and` chain reaches it
//         (step in pattern, not suppressed by intro/break, step != 0,
//          drum_density < 1.0);
//       ghost-snare draw only on step 15 outside intro/break, and
//         only when the main snare branch did not fire (elif);
//       hat gate draw only on even steps with drum_density < 1.0 and
//         step % 4 != 0; ghost-hat draw (0.30) whenever the main hat
//         branch did not fire and it is not a break bar (elif);
//       open-hat draw only on step 14 outside intro/break.
//   chords stream (seed ^ 0xC001): per bar — 1 stab-pattern draw,
//     1 peek chance draw, +1 peek beat draw when the chance fires.
//   bass stream (seed ^ 0xB001): per bar — approach-note choice,
//     0.20 chance, +bounce choice when the chance fails.
//   melody stream (seed ^ 0xE001): per played bar — note-count draw,
//     8 shuffle draws, then per note: walk choice (skipped on a
//     chord-tone snap), duration draw, velocity draw. Resting bars
//     (bar % 4 == 2, except the last) draw nothing.
//   tune events draw NOTHING (the melody is encoded verbatim).
//
// DELIBERATE DIVERGENCES from render.py:
//   - Noise is not composed here. Python draws drum/crackle noise
//     from a numpy PCG64 stream interleaved with rendering; JS noise
//     comes from dsp.js NoiseGen at *render* time (see drums.js),
//     consumed in the same event order but with different values.
//     Texture only — no event time, pitch or count depends on it.
//   - Python's render_recipe defaults to 16 bars regardless of
//     recipe.bars (48 for generated recipes); compose() keeps that
//     default and takes bars as an option, same as Python.
//   - Lead events carry two render hints Python computes inline at
//     placement: `glideFrom` (the Moog legato rule) and `noteSeed`
//     (seed ^ 0xE001 ^ int(abs_step), a BigInt) for the seeded
//     voices (pluck, moog). They are pure functions of the event
//     stream, computed here so player.js stays a dumb scheduler.

import { SplitMix64 } from "./rng.js";
import { CHANNELS } from "./recipes.js";
import { SCALES, pc_of } from "./theory.js";
import { TUNES } from "./traditional.js";

// Stream tags — identical to render.py.
const TAG_DRUMS = 0xD001n;
const TAG_CHORDS = 0xC001n;
const TAG_BASS = 0xB001n;
export const TAG_NOISE = 0xF001n;
// S7b: crackle's own stream tag (render.py's _TAG_CRACKLE) — it used
// to share TAG_NOISE with the drum kit, so both textures drew from
// the same stream. Drum noise still uses TAG_NOISE.
export const TAG_CRACKLE = 0xF002n;
const TAG_MELODY = 0xE001n;
const MASK64 = (1n << 64n) - 1n;

const KICK_PATTERNS = [
  [0, 7, 10],
  [0, 6, 10],
  [0, 7, 8],
  [0, 10],
];
const STAB_PATTERNS = [  // in beats within the bar
  [],
  [2.5],
  [1.5, 3.0],
  [3.5],
  [0.75, 2.5],
];

function bassRootMidi(rootPc) {
  // Python: min over range(30, 49) by |m - 38|, first wins on ties.
  let best = null;
  let bestDist = Infinity;
  for (let m = 30; m < 49; m++) {
    if (m % 12 !== rootPc) continue;
    const d = Math.abs(m - 38);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

function melodyEvents(recipe, bars, introBars, _stepS) {
  const cfg = CHANNELS[recipe.channel];
  const density = cfg.melody_density;
  const rng = new SplitMix64(BigInt(recipe.seed) ^ TAG_MELODY);
  const rootPc = pc_of(recipe.key_root);
  const scalePcs = new Set(SCALES[recipe.mode].map((s) => (rootPc + s) % 12));
  const pool = [];
  for (let m = 67; m < 87; m++) if (scalePcs.has(m % 12)) pool.push(m);
  const chords = recipe.progression.chords;
  const candidates = [0, 3, 4, 6, 7, 8, 11, 12, 14];
  const events = [];
  let idx = 0;
  let bestDist = Infinity;
  pool.forEach((m, i) => {
    const d = Math.abs(m - 76);
    if (d < bestDist) { bestDist = d; idx = i; }
  });
  for (let bar = introBars; bar < bars; bar++) {
    if (bar % 4 === 2 && bar !== bars - 1) continue;  // resting bar
    const chord = chords[bar % chords.length];
    const tones = new Set();
    pool.forEach((m, i) => { if (chord.pcs.includes(m % 12)) tones.add(i); });
    const nNotes = rng.randint(2, 2 + Math.trunc(5 * density));
    const order = candidates.slice();
    rng.shuffle(order);
    const onsets = [];
    for (const st of order.slice().sort((a, b) => a - b)) {
      if (onsets.every((o) => Math.abs(st - o) >= 2)) onsets.push(st);
      if (onsets.length >= nNotes) break;
    }
    onsets.sort((a, b) => a - b);
    for (let j = 0; j < onsets.length; j++) {
      const step = onsets[j];
      if (step % 4 === 0 && tones.size > 0) {
        // Snap to the nearest chord tone (Python min, first on ties;
        // iterating the set in insertion order = pool order).
        let bestI = null;
        let bd = Infinity;
        for (const i of tones) {
          const d = Math.abs(i - idx);
          if (d < bd) { bd = d; bestI = i; }
        }
        idx = bestI;
      } else {
        idx = Math.max(0, Math.min(pool.length - 1,
          idx + rng.choice([-2, -1, -1, 0, 1, 1, 2])));
      }
      const gap = (j + 1 < onsets.length) ? (onsets[j + 1] - step) : (16 - step);
      const noteLen = cfg.note_len !== undefined ? cfg.note_len : 1.0;
      const durSteps = Math.max(1.5, Math.min(gap,
        rng.uniform(2.5, 6.0) * noteLen));
      events.push({
        absStep: bar * 16 + step,
        midi: pool[idx],
        durSteps: durSteps,
        velocity: rng.uniform(0.5, 0.78),
      });
    }
  }
  return events;
}

function tuneEvents(recipe, bars, introBars) {
  // Verbatim port of render.py's _tune_events: no RNG draws.
  const notes = TUNES[recipe.tune].notes;
  const rootPc = pc_of(recipe.key_root);
  const base = 69 + (((rootPc - 69) % 12) + 12) % 12;
  const tuneBeats = notes.reduce((s, [, d]) => s + d, 0);
  const passBeats = tuneBeats + 2.0;  // the breath between passes
  const totalBeats = (bars - introBars) * 4;
  const events = [];
  let startBeat = 0.0;
  while (startBeat < totalBeats) {
    let beat = startBeat;
    for (const [offset, dur] of notes) {
      if (beat >= totalBeats) break;
      events.push({
        absStep: (introBars * 4 + beat) * 4,
        midi: base + offset,
        durSteps: dur * 4 * 0.9,
        velocity: 0.62,
      });
      beat += dur;
    }
    startBeat += passBeats;
  }
  return events;
}

// compose(recipe, { bars = 16, melody = true, pad = true })
//   -> { durationS, beatS, barS, stepS, bars, introBars, counts,
//        events: { ep, pad, bass, drums, lead } }
//
// Event shapes (times in seconds, gains/pans are render.py's
// place() arguments, kept separate from velocity exactly as Python
// keeps them):
//   ep:    { t, durS, midis, velocity, gain, pan, kind }
//          kind: "long" | "stab" | "peek" (peek renders as ep_note)
//   pad:   { t, durS, midis, velocity, gain }        (stereo voice)
//   bass:  { t, durS, midi, velocity, gain, pan }
//   drums: { t, type, velocity, gain, pan }
//          type: "kick" | "snare" | "hat" | "openhat"
//          — in render order; the drum noise stream is consumed in
//            this order at render time, as Python consumes it.
//   lead:  { t, durS, midi, velocity, gain, pan, voice,
//            glideFrom, noteSeed }
export function compose(recipe, options = {}) {
  const bars = options.bars !== undefined ? options.bars : 16;
  const melody = options.melody !== undefined ? options.melody : true;
  const padOn = options.pad !== undefined ? options.pad : true;
  const cfg = CHANNELS[recipe.channel];

  const bpm = recipe.tempo_bpm;
  const beatS = 60.0 / bpm;
  const barS = 4 * beatS;
  const stepS = barS / 16.0;
  const durationS = bars * barS;
  const introBars = bars >= 8 ? 4 : 0;

  const seed = BigInt(recipe.seed);
  const rngDrums = new SplitMix64(seed ^ TAG_DRUMS);
  const rngChords = new SplitMix64(seed ^ TAG_CHORDS);
  const rngBass = new SplitMix64(seed ^ TAG_BASS);

  const tOf = (step) => {
    const whole = Math.trunc(step);
    let t = step * stepS;
    if (whole % 2 === 1) t += recipe.swing * stepS;
    return t;
  };
  const humanize = (t, rng) => t + (rng.random() * 2 - 1) * 0.006;

  const kickPattern = KICK_PATTERNS[rngDrums.randint(0, KICK_PATTERNS.length - 1)];
  const chords = recipe.progression.chords;

  const ep = [];
  const padEv = [];
  const bass = [];
  const drums = [];

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    const barT = bar * barS;
    const intro = bar < introBars;
    const isBreak = bars >= 16 && (bar === 11 || bar === 15);

    // --- electric piano: long hit + seeded stabs + a top-note peek
    ep.push({
      t: barT, durS: barS * 0.95, midis: chord.notes.slice(),
      velocity: 0.9, gain: 0.50, pan: -0.15, kind: "long",
    });
    const stabs = STAB_PATTERNS[rngChords.randint(0, STAB_PATTERNS.length - 1)];
    for (const beat of stabs) {
      ep.push({
        t: tOf(bar * 16 + beat * 4), durS: beatS * 0.8,
        midis: chord.notes.slice(), velocity: 0.7, gain: 0.38,
        pan: -0.15, kind: "stab",
      });
    }
    if (rngChords.chance(0.35)) {
      const beat = rngChords.choice([2.75, 3.5]);
      ep.push({
        t: tOf(bar * 16 + beat * 4), durS: beatS * 0.5,
        midis: [Math.max(...chord.notes) + 12], velocity: 0.5,
        gain: 0.35, pan: -0.1, kind: "peek",
      });
    }

    // --- pad: warm stereo bed under the second half
    if (padOn && !intro) {
      padEv.push({
        t: barT, durS: barS * 1.02, midis: chord.notes.slice(),
        velocity: 1.0, gain: cfg.pad_level,
      });
    }

    // --- bass: root anchor, fifth/octave bounce, chromatic approach.
    // Draw order mirrors Python's list construction exactly:
    // approach choice, then the 0.20 chance, then the bounce choice.
    const root = bassRootMidi(chord.root_pc);
    const nxt = chords[(bar + 1) % chords.length];
    const nxtRoot = bassRootMidi(nxt.root_pc);
    const bassEvents = [
      { beat: 0.0, midi: root, durBeats: 1.1, velocity: 0.95 },
      { beat: 2.0, midi: root, durBeats: 0.8, velocity: 0.85 },
      { beat: 3.0, midi: nxtRoot + rngBass.choice([-1, 1, 2]), durBeats: 0.5, velocity: 0.8 },
    ];
    if (!rngBass.chance(0.2)) {
      bassEvents.push({
        beat: 1.5, midi: root + rngBass.choice([7, 12]),
        durBeats: 0.45, velocity: 0.8,
      });
    }
    for (const be of bassEvents) {
      bass.push({
        t: barT + be.beat * beatS, durS: be.durBeats * beatS,
        midi: be.midi, velocity: be.velocity, gain: 0.52, pan: 0.0,
      });
    }

    // --- drums (humanize draw first, every step, like Python)
    const drumDensity = cfg.drum_density !== undefined ? cfg.drum_density : 1.0;
    for (let step = 0; step < 16; step++) {
      const t = humanize(tOf(bar * 16 + step), rngDrums);
      if (kickPattern.includes(step) &&
          !(intro && step !== 0) && !(isBreak && step !== 0) &&
          (step === 0 || drumDensity >= 1.0 ||
           rngDrums.chance(drumDensity + 0.25))) {
        drums.push({ t, type: "kick", velocity: 0.95, gain: 0.95, pan: 0.0 });
      }
      if ((step === 4 || step === 12) && !intro && !isBreak) {
        drums.push({ t, type: "snare", velocity: 0.85, gain: 0.55, pan: 0.05 });
      } else if (step === 15 && !intro && !isBreak && rngDrums.chance(0.22)) {
        drums.push({ t, type: "snare", velocity: 0.3, gain: 0.4, pan: 0.05 });
      }
      if (step % 2 === 0 &&
          (drumDensity >= 1.0 || step % 4 === 0 ||
           rngDrums.chance(drumDensity + 0.3))) {
        drums.push({
          t, type: "hat", velocity: step % 4 === 0 ? 0.8 : 0.55,
          gain: 0.30, pan: 0.12,
        });
      } else if (!isBreak && rngDrums.chance(0.30)) {
        drums.push({ t, type: "hat", velocity: 0.45, gain: 0.24, pan: 0.12 });
      }
      if (step === 14 && !intro && !isBreak && rngDrums.chance(0.45)) {
        drums.push({ t, type: "openhat", velocity: 0.7, gain: 0.32, pan: 0.12 });
      }
    }
  }

  // --- the lead line, over the top; each station has its own voice.
  const lead = [];
  if (melody) {
    const voice = cfg.lead_voice !== undefined ? cfg.lead_voice : "vibes";
    const raw = recipe.tune
      ? tuneEvents(recipe, bars, introBars)
      : melodyEvents(recipe, bars, introBars, stepS);
    let prevMidi = null;
    let prevEnd = -99.0;
    for (const ev of raw) {
      const glideFrom = (prevMidi !== null && ev.absStep - prevEnd <= 2.5)
        ? prevMidi : null;
      lead.push({
        t: tOf(ev.absStep),
        durS: ev.durSteps * stepS,
        midi: ev.midi,
        velocity: ev.velocity,
        gain: 0.42, pan: 0.18, voice: voice,
        glideFrom: glideFrom,
        noteSeed: (seed ^ TAG_MELODY ^ BigInt(Math.trunc(ev.absStep))) & MASK64,
      });
      prevMidi = ev.midi;
      prevEnd = ev.absStep + ev.durSteps;
    }
  }

  const counts = {
    ep: ep.length,
    pad: padEv.length,
    bass: bass.length,
    kick: drums.filter((d) => d.type === "kick").length,
    snare: drums.filter((d) => d.type === "snare").length,
    hat: drums.filter((d) => d.type === "hat").length,
    openhat: drums.filter((d) => d.type === "openhat").length,
    drums: drums.length,
    lead: lead.length,
  };

  return {
    durationS, beatS, barS, stepS, bars, introBars, counts,
    events: { ep, pad: padEv, bass, drums, lead },
  };
}
