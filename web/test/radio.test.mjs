// Session tests — the JS radio planner, pinned to the Python goldens
// in tests/test_radio_plan.py. Same session seed, same wander.
import test from "node:test";
import assert from "node:assert/strict";
import { Session } from "../js/radio.js";

const seq = (s, n) => Array.from({ length: n }, () => { const r = s.next(); return [r.channel, r.seed]; });

const GOLDEN_ALL = {
  9: [["dusty", 42], ["dusty", 354295], ["minyo", 232724], ["sunrise", 958796],
      ["minyo", 823174], ["jazz-cat", 220913], ["wa-jazz", 152103], ["minyo", 236586]],
  42: [["dusty", 42], ["sunrise", 492044], ["dusty", 779036], ["wa-jazz", 479243],
       ["jazz-cat", 145433], ["sunrise", 310463], ["jazz-cat", 925728], ["minyo", 184241]],
  1974: [["dusty", 42], ["jazz-cat", 568443], ["jazz-cat", 969238], ["dusty", 865325],
         ["dusty", 4609], ["wa-jazz", 475448], ["dusty", 239484], ["wa-jazz", 829917]],
};

test("all-mode sessions match the Python golden plans", () => {
  for (const [seed, want] of Object.entries(GOLDEN_ALL)) {
    assert.deepEqual(seq(new Session(Number(seed), "all"), 8), want, `session ${seed}`);
  }
});

test("channel mode: pinned sessions skip the signature, exactly like Python", () => {
  // S7a bug #6: Python's plan_session used to open a pinned session
  // with the DUST signature while the web Session skipped it. Python
  // was fixed to match — both goldens are now the same full sequence.
  assert.deepEqual(seq(new Session(9, "minyo"), 8),
    [["minyo", 469201], ["minyo", 354295], ["minyo", 807525], ["minyo", 232724],
     ["minyo", 141872], ["minyo", 958796], ["minyo", 347755], ["minyo", 823174]]);
  assert.deepEqual(seq(new Session(5, "jazz-cat"), 5),
    [["jazz-cat", 71655], ["jazz-cat", 518906], ["jazz-cat", 741116],
     ["jazz-cat", 712264], ["jazz-cat", 817817]]);
});

test("peekNext returns next()'s recipe without consuming it (S7b prefetch)", () => {
  for (const mode of ["all", "minyo", "jazz-cat"]) {
    const s = new Session(1234, mode);
    for (let i = 0; i < 6; i++) {
      const peeked = s.peekNext();
      assert.deepEqual(s.peekNext(), peeked, "peek is idempotent");
      const drawn = s.next();
      assert.equal(drawn.channel, peeked.channel);
      assert.equal(drawn.seed, peeked.seed);
    }
  }
});

test("deterministic: same session seed, same sequence", () => {
  assert.deepEqual(seq(new Session(777, "all"), 25), seq(new Session(777, "all"), 25));
});

test("channel mode stays on its station", () => {
  for (const [ch] of seq(new Session(3, "sunrise"), 20)) assert.equal(ch, "sunrise");
});

test("no back-to-back repeats on the open dial", () => {
  const s = seq(new Session(2024, "all"), 60);
  for (let i = 1; i < s.length; i++) assert.notDeepEqual(s[i], s[i - 1]);
});
