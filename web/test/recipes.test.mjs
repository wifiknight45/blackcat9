// Recipe validation + length parity — S7a bugs #7 and #4 (JS side).
import test from "node:test";
import assert from "node:assert/strict";
import { generate_recipe, recipeFromJson, stringifyRecipe } from "../js/recipes.js";
import { compose } from "../js/compose.js";

const good = () => JSON.parse(stringifyRecipe(generate_recipe(42, "dusty")));

test("valid recipes round-trip through recipeFromJson", () => {
  for (const [seed, ch] of [[42, "dusty"], [7, "jazz-cat"], [5, "minyo"]]) {
    const r = generate_recipe(seed, ch);
    assert.deepEqual(recipeFromJson(stringifyRecipe(r)), r);
  }
});

test("unknown mode is rejected by name (bug #7)", () => {
  const d = good(); d.mode = "nope";
  assert.throws(() => recipeFromJson(JSON.stringify(d)), /mode.*nope/);
});

test("unknown channel / key / tune rejected by name", () => {
  for (const [k, v] of [["channel", "nope"], ["key_root", "H"], ["tune", "nope"]]) {
    const d = good(); d[k] = v;
    assert.throws(() => recipeFromJson(JSON.stringify(d)), new RegExp(k));
  }
});

test("unknown keys are rejected by name, not a bare TypeError", () => {
  const d = good(); d.bogus_key = 1;
  assert.throws(() => recipeFromJson(JSON.stringify(d)), /bogus_key/);
});

test("missing fields and wrong types are rejected by name", () => {
  const d = good(); delete d.title;
  assert.throws(() => recipeFromJson(JSON.stringify(d)), /title/);
  for (const [k, v] of [["tempo_bpm", "fast"], ["seed", "42"], ["swing", "lots"],
                        ["bars", 0], ["bars", -3], ["seed", true]]) {
    const p = good(); p[k] = v;
    assert.throws(() => recipeFromJson(JSON.stringify(p)), new RegExp(k), `${k}=${v}`);
  }
});

test("bad sections / progression / envelope are rejected", () => {
  const a = good(); a.sections = ["intro", "chorus"];
  assert.throws(() => recipeFromJson(JSON.stringify(a)), /sections/);
  const b = good(); b.progression = { chords: [] };
  assert.throws(() => recipeFromJson(JSON.stringify(b)), /progression/);
  assert.throws(() => recipeFromJson("[1, 2]"), /object/);
  assert.throws(() => recipeFromJson("{not json"), /JSON/);
  const c = good(); c.version = 99;
  assert.throws(() => recipeFromJson(JSON.stringify(c)), /version/);
});

test("compose honours recipe.bars — the full song, not 16 bars (bug #4)", () => {
  // The CLI radio renders recipe.bars; the web player must compose
  // the same length when the app passes bars through (app.js does,
  // since S7a). This pins the compose-level contract.
  for (const [seed, ch] of [[42, "dusty"], [7, "jazz-cat"], [99, "sunrise"]]) {
    const r = generate_recipe(seed, ch);
    const full = compose(r, { bars: r.bars });
    assert.equal(full.bars, r.bars);
    assert.ok(Math.abs(full.durationS - r.bars * 4 * 60 / r.tempo_bpm) < 0.01);
    assert.ok(full.durationS > compose(r).durationS, "full song is longer than the 16-bar default");
  }
});
