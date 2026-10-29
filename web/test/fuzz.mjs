// Seed-sweep fuzzer for the web engine (S6d) — the JS mirror of
// tests/fuzz.py. Same sweep derivation (SplitMix64 keyed by the fuzz
// seed, tag 0xF022, channels in sorted order), so both engines fuzz
// the SAME population of (channel, seed) pairs.
//
//   node web/test/fuzz.mjs                     # default sweep
//   node web/test/fuzz.mjs --seeds 50 --fuzz-seed 7
//
// A failure prints the offending pair; reproduce it in the bench
// (listen.html) or a one-liner:
//   node -e 'import("./js/recipes.js").then(m => console.log(m.generate_recipe(SEED, "CHANNEL").title))'
//
// Checks per recipe: generation + compose never throw; compose is
// deterministic (two runs stringify identically); every event time
// is finite and inside [-6ms humanize, duration); velocities and
// durations are in range; counts agree with the event arrays.

import { SplitMix64 } from "../js/rng.js";
import { CHANNELS, generate_recipe } from "../js/recipes.js";
import { compose } from "../js/compose.js";

const args = process.argv.slice(2);
function opt(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? parseInt(args[i + 1], 10) : dflt;
}
const perChannel = opt("--seeds", 200);
const fuzzSeed = opt("--fuzz-seed", 1);

function fail(channel, seed, check, detail) {
  console.log(`FUZZ FAIL channel=${channel} seed=${seed} check=${check}: ${detail}`);
  process.exit(1);
}

// JSON with BigInt support (recipes carry a BigInt noteSeed).
const stable = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? `bigint:${x}` : x));

const rng = new SplitMix64(fuzzSeed ^ 0xF022);
let recipes = 0;
let events = 0;
for (const channel of Object.keys(CHANNELS).sort()) {
  for (let i = 0; i < perChannel; i++) {
    const seed = Number(rng.next_u64() % 1000000n);
    let recipe, a, b;
    try {
      recipe = generate_recipe(seed, channel);
      a = compose(recipe, { bars: 16 });
      b = compose(recipe, { bars: 16 });
    } catch (err) {
      fail(channel, seed, "generate/compose", `${err.name}: ${err.message}`);
    }
    if (stable(a) !== stable(b)) fail(channel, seed, "determinism", "two composes differ");
    if (!Number.isFinite(a.durationS) || a.durationS <= 0) {
      fail(channel, seed, "duration", String(a.durationS));
    }
    const c = a.counts;
    const lens = { ep: a.events.ep.length, pad: a.events.pad.length,
                   bass: a.events.bass.length, lead: a.events.lead.length,
                   drums: a.events.drums.length };
    for (const k of Object.keys(lens)) {
      if (c[k] !== lens[k]) fail(channel, seed, "counts", `${k}: count ${c[k]} != ${lens[k]} events`);
    }
    if (c.kick + c.snare + c.hat + c.openhat !== c.drums) {
      fail(channel, seed, "counts", "drum subcounts do not sum to drums");
    }
    for (const list of Object.values(a.events)) {
      for (const ev of list) {
        events++;
        if (!Number.isFinite(ev.t) || ev.t < -0.0061 || ev.t >= a.durationS) {
          fail(channel, seed, "event-time", `t=${ev.t} outside [-6ms, ${a.durationS})`);
        }
        if (ev.durS !== undefined && !(ev.durS > 0 && Number.isFinite(ev.durS))) {
          fail(channel, seed, "event-duration", `durS=${ev.durS}`);
        }
        if (ev.velocity !== undefined && !(ev.velocity > 0 && ev.velocity <= 1)) {
          fail(channel, seed, "event-velocity", `velocity=${ev.velocity}`);
        }
      }
    }
    recipes++;
  }
}
console.log(`FUZZ: ${recipes} recipes, ${events} events checked, all invariants hold (fuzz-seed ${fuzzSeed})`);
