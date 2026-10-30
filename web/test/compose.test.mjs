// Compose test: compose.js must be a pure, deterministic function
// of the recipe, and its output for the signature track must be sane.
// Run:  node web/test/compose.test.mjs
// Exit code 0 iff every assertion holds.

import { generate_recipe } from "../js/recipes.js";
import { compose } from "../js/compose.js";

let failures = 0;
function check(cond, label) {
  if (cond) {
    console.log(`ok   ${label}`);
  } else {
    console.log(`FAIL ${label}`);
    failures++;
  }
}

// Deep-compare with BigInt support (noteSeed is a BigInt).
function deepEqual(a, b) {
  if (typeof a === "bigint" || typeof b === "bigint") return a === b;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return Object.is(a, b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

// --- the signature track: seed 42, dusty ---------------------------
const recipe = generate_recipe(42, "dusty");
check(recipe.tempo_bpm === 73, `signature tempo is 73 BPM (got ${recipe.tempo_bpm})`);
check(recipe.title === "Shimokitazawa Umbrellas",
  `signature title (got "${recipe.title}")`);

const a = compose(recipe, { bars: 16 });
const b = compose(recipe, { bars: 16 });
check(deepEqual(a, b), "compose(seed 42 dusty) twice -> identical event lists");

// Timing sanity: 16 bars at 73 BPM = 16 * 4 * 60/73 = 52.60 s.
const expectedDur = 16 * 4 * 60 / 73;
check(Math.abs(a.durationS - expectedDur) < 1e-9,
  `duration ${a.durationS.toFixed(3)}s == ${expectedDur.toFixed(3)}s`);
check(a.introBars === 4, "16 bars -> 4 intro bars");

const all = [
  ...a.events.ep, ...a.events.pad, ...a.events.bass,
  ...a.events.drums, ...a.events.lead,
];
check(all.length > 200, `total events ${all.length} > 200`);
check(all.every((ev) => ev.t >= -0.0061 && ev.t < a.durationS),
  "every event time inside [-6ms humanize, duration)");
check(a.events.lead.every((ev) => ev.durS > 0 && ev.velocity > 0 && ev.velocity <= 0.78),
  "lead events have positive durations and velocities in range");

// Counts agree with the event arrays they summarize.
const c = a.counts;
check(c.ep === a.events.ep.length && c.pad === a.events.pad.length &&
      c.bass === a.events.bass.length && c.lead === a.events.lead.length &&
      c.drums === a.events.drums.length &&
      c.kick + c.snare + c.hat + c.openhat === c.drums,
  "counts match event arrays");

// Arrangement rules from render.py, observable in the events:
// intro bars (0..3) have no snare and no pad; kick in the intro only
// ever lands on bar starts. Break bars come from the recipe's
// sections since S7c (seed 42: intro section = bars 0..7) — the old
// hard-coded breaks at bars 11 and 15 are gone; bar 11 is a verse
// bar now and the snare plays there.
const barOf = (t) => Math.floor(t / a.barS + 1e-6);
const snares = a.events.drums.filter((d) => d.type === "snare");
check(snares.every((d) => barOf(d.t) >= 4), "no snare during the 4-bar intro");
check(a.events.pad.every((p) => barOf(p.t) >= 4), "no pad during the intro");
check(snares.every((d) => barOf(d.t) >= 8),
  "no snare in the intro-section break bars (0..7, S7c sections)");
check(snares.some((d) => barOf(d.t) === 11),
  "snare sounds at bar 11 now — it is a verse bar, not a hard-coded break");
check(c.kick >= 16 && c.snare >= 20 && c.hat >= 60,
  `drum counts sane (kick ${c.kick}, snare ${c.snare}, hat ${c.hat})`);
check(c.lead >= 20, `lead events ${c.lead} >= 20 across 12 melody bars`);

// First event of the track is the opening EP chord at t = 0.
check(a.events.ep[0].t === 0 && a.events.ep[0].kind === "long",
  "track opens with the bar-0 EP chord");

// --- a forced traditional tune on minyo ----------------------------
const tuned = generate_recipe(9, "minyo", "sakura");
const tc = compose(tuned, { bars: 16 });
check(tc.events.lead.length > 30,
  `sakura tune lead events ${tc.events.lead.length} > 30`);
check(tc.events.lead.every((ev) => ev.velocity === 0.62 && ev.voice === "pluck"),
  "tune events are verbatim (velocity 0.62, pluck voice)");

// --- a moog-lead channel exercises the glide hint ------------------
const sunrise = generate_recipe(3, "sunrise");
const sc = compose(sunrise, { bars: 16 });
check(sc.events.lead.every((ev) => ev.voice === "moog"),
  "sunrise lead events carry the moog voice");
check(sc.events.lead.some((ev) => ev.glideFrom !== null),
  "some sunrise lead notes glide from the previous note");

console.log(failures === 0 ? "\ncompose: ALL PASS" : `\ncompose: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
