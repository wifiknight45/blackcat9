// Parity test: JS engine vs Python golden recipes.
// Run:  node web/test/parity.mjs
// Exit code 0 iff every golden recipe regenerates identically.
//
// Two checks per entry:
//  1. deep equality (canonical sorted-key stringify) of the JS recipe
//     object against the parsed Python recipe;
//  2. exact string equality of stringifyRecipe() against the raw
//     Python json.dumps(sort_keys=True, indent=2) output.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { generate_recipe, stringifyRecipe } from "../js/recipes.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(readFileSync(join(here, "goldens.json"), "utf-8"));

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

function firstDiff(a, b, path = "") {
  if (typeof a !== typeof b) return `${path}: type ${typeof a} != ${typeof b} (${a} vs ${b})`;
  if (a === null || b === null || typeof a !== "object") {
    return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

let deepPass = 0, stringPass = 0, fail = 0;
for (const entry of goldens.entries) {
  const label = `${entry.channel}/seed=${entry.seed}` + (entry.tune ? `/tune=${entry.tune}` : "");
  let js;
  try {
    js = generate_recipe(entry.seed, entry.channel, entry.tune);
  } catch (e) {
    console.log(`FAIL ${label}: threw ${e.message}`);
    fail++;
    continue;
  }
  const diff = firstDiff(js, entry.recipe);
  if (diff === null && canonical(js) === canonical(entry.recipe)) {
    deepPass++;
  } else {
    console.log(`FAIL ${label}: deep mismatch at ${diff}`);
    fail++;
    continue;
  }
  const jsString = stringifyRecipe(js);
  if (jsString === entry.json) {
    stringPass++;
  } else {
    console.log(`STRING-DIFF ${label}: serialization differs from Python json.dumps`);
    const a = jsString.split("\n"), b = entry.json.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`  line ${i + 1}: js=${JSON.stringify(a[i])} py=${JSON.stringify(b[i])}`);
        break;
      }
    }
    fail++;
  }
}

const total = goldens.entries.length;
console.log(`\nparity: ${deepPass}/${total} recipes deep-identical, ${stringPass}/${total} byte-identical JSON`);
if (fail > 0) {
  console.log(`parity: FAILED (${fail} failing entries)`);
  process.exit(1);
}
console.log("parity: ALL PASS");
