// S7c sections-driven arrangement (JS side): flags must match the
// Python goldens exactly, and the composed events must honour them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate_recipe } from "../js/recipes.js";
import { arrangementFor, compose } from "../js/compose.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(readFileSync(join(here, "arrangement_goldens.json"), "utf-8"));

test("arrangement flags match the Python goldens", () => {
  for (const e of goldens.entries) {
    const r = generate_recipe(e.seed, e.channel);
    assert.deepEqual(r.sections, e.sections);
    for (const [bars, want] of Object.entries(e.bars)) {
      const got = arrangementFor(r, Number(bars))
        .map((f) => [f.section, f.isBreak ? 1 : 0, f.melodyRests ? 1 : 0]);
      assert.deepEqual(got, want, `${e.channel}/${e.seed} @ ${bars} bars`);
    }
  }
});

test("composed events honour the breaks (seed 42, 48 bars)", () => {
  const r = generate_recipe(42, "dusty");
  const c = compose(r, { bars: r.bars });
  const flags = arrangementFor(r, r.bars);
  // Humanized step-0 events can land a few ms before t=0 — clamp.
  const barOf = (t) => Math.max(0, Math.min(47, Math.floor(t / c.barS)));
  // Attribute events to steps by rounding (swing shifts odd steps
  // by < half a step; humanize by ~6 ms) — floor(t/bar) misfiles
  // early-landing downbeats into the previous bar.
  const stepOf = (t) => Math.round(t / c.stepS);
  const barOfStep = (t) => Math.floor(stepOf(t) / 16);
  // No snare sounds anywhere in a break bar.
  for (const ev of c.events.drums.filter((d) => d.type === "snare")) {
    assert.equal(flags[barOfStep(ev.t)].isBreak, false, `snare in break bar ${barOfStep(ev.t)}`);
  }
  // Kicks in break bars only land on the downbeat (step 0).
  for (const ev of c.events.drums.filter((d) => d.type === "kick")) {
    const bar = barOfStep(ev.t);
    if (flags[bar].isBreak) {
      assert.equal(((stepOf(ev.t) % 16) + 16) % 16, 0, `kick off downbeat in break bar ${bar}`);
    }
  }
  // Snares do sound in verse bars — the breaks are the exception.
  assert.ok(c.events.drums.some((d) => d.type === "snare" && !flags[barOf(d.t)].isBreak));
});

test("the lead winds down through the outro but closes the track", () => {
  const r = generate_recipe(42, "dusty");
  const c = compose(r, { bars: r.bars });
  const barOf = (t) => Math.max(0, Math.min(47, Math.floor(t / c.barS)));
  const leadBars = new Set(c.events.lead.map((ev) => barOf(ev.t)));
  for (let bar = 40; bar <= 46; bar++) assert.ok(!leadBars.has(bar), `lead in outro bar ${bar}`);
  assert.ok(leadBars.has(47), "lead plays the closing bar");
  assert.ok([...leadBars].some((b) => b >= 24 && b < 32), "lead present in the second-half verse");
});

test("pad leaves for the outro", () => {
  const r = generate_recipe(42, "dusty");
  const c = compose(r, { bars: r.bars });
  const barOf = (t) => Math.max(0, Math.min(47, Math.floor(t / c.barS)));
  assert.ok(c.events.pad.length > 0);
  for (const ev of c.events.pad) assert.ok(barOf(ev.t) < 40, `pad in outro bar ${barOf(ev.t)}`);
});
