// tapes.mjs — S7a tape-shelf regressions, in a real browser.
// Bug #1: a corrupted kcat.tapes.v1 must never brick the console.
// Bug #2: tapes play through POWER (stored, stoppable source; no
// overlap; tapePlaying always resets). Bug #3: deleting a tape
// frees its cached render buffer.
//
// Like smoke.mjs this needs playwright-core + Chromium and stays a
// local/on-demand check:   node web/test/tapes.mjs
/* global window, localStorage, KCAT -- page-side names in evaluate callbacks */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("FAIL - playwright-core not installed (dev-only: npm i -D playwright-core)");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png" };
const srv = http.createServer(async (req, res) => {
  try {
    const p = join(root, req.url === "/" ? "index.html" : req.url.split("?")[0]);
    res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

let failures = 0;
const ok = (cond, name) => { console.log(`${cond ? "ok" : "FAIL"} - ${name}`); if (!cond) failures++; };

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  // ---- bug #1: every corruption shape boots, bad entries dropped
  const CASES = {
    "json null": ["null", 0],
    "json object": ['{"seed":1}', 0],
    "json number": ["42", 0],
    "unknown channel": [JSON.stringify([{ seed: 1, channel: "nope", title: "X", dur: 9 }]), 0],
    "null entry": ["[null]", 0],
    "non-string title": [JSON.stringify([{ seed: 1, channel: "dusty", title: 42, dur: 9 }]), 0],
    "partial entry (audit B5)": [JSON.stringify([{ seed: 42 }]), 0],
    "mixed good + bad": [JSON.stringify([
      { seed: 42, channel: "dusty", title: "Good One", dur: 100 },
      { seed: "x", channel: "dusty", title: "Bad Seed", dur: 1 },
      { seed: 7, channel: "gone", title: "Bad Channel", dur: 1 },
      null,
    ]), 1],
    "healthy shelf": [JSON.stringify([{ seed: 42, channel: "dusty", title: "Good", dur: 158 }]), 1],
  };
  for (const [name, [val, want]] of Object.entries(CASES)) {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript((v) => { try { localStorage.setItem("kcat.tapes.v1", v); } catch { /* ignore */ } }, val);
    await page.goto(`http://localhost:${port}/`);
    await page.waitForTimeout(600);
    const got = await page.evaluate(() => window.KCAT ? KCAT.tapes.length : -1).catch(() => -1);
    ok(got === want && errs.length === 0,
      `bug#1 ${name}: boots, ${want} tape(s) kept${errs.length ? " — error: " + errs[0] : ""}`);
    await page.close();
  }

  // ---- bugs #2/#3: one healthy tape, exercised end to end
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("kcat.tapes.v1", JSON.stringify([
        { seed: 42, channel: "dusty", title: "Shimokitazawa Umbrellas", dur: 158 },
      ]));
    } catch { /* ignore */ }
  });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(600);

  // Playing a tape powers the console and renders the FULL recipe
  // (48 bars ≈ 158 s at seed 42's tempo — the offline render itself
  // takes a while; the flag goes up first, the buffer lands later).
  await page.evaluate(() => KCAT.playTape(KCAT.tapes[0]));
  try {
    await page.waitForFunction(() => KCAT.tapePlaying === true, null, { timeout: 30000 });
    ok(true, "bug#2 tape starts playing (through POWER)");
  } catch { ok(false, "bug#2 tape starts playing (through POWER)"); }
  ok(await page.evaluate(() => KCAT.power === true), "bug#2 tape play turned POWER on");
  try {
    await page.waitForFunction(() => KCAT.tapeBufCount === 1, null, { timeout: 300000 });
    ok(true, "tape render completes and is cached");
  } catch { ok(false, "tape render completes and is cached"); }
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => KCAT.tapePlaying === true), "bug#2 tape still playing after render");

  // POWER off must stop the tape and reset the flag.
  await page.evaluate(() => KCAT.setPower(false));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => KCAT.tapePlaying === false), "bug#2 POWER off stops the tape");

  // Deleting the tape must free its cached buffer (bug #3).
  await page.click("#rackBtn");
  await page.click(".tape button.del");
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ n: KCAT.tapes.length, bufs: KCAT.tapeBufCount }));
  ok(after.n === 0 && after.bufs === 0, `bug#3 delete frees the cached buffer (tapes=${after.n}, bufs=${after.bufs})`);

  ok(errs.length === 0, `zero page errors${errs.length ? ": " + errs[0] : ""}`);
  await page.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(failures ? `\nTAPES: ${failures} failure(s)` : "\nTAPES: all green");
process.exit(failures ? 1 : 0);
