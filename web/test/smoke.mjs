// smoke.mjs — the console, end to end, in a real browser.
// Serves web/ locally, presses POWER, and checks the radio actually
// comes on air: signature track first, TUNING retunes through static,
// REC cuts a tape, and no page errors anywhere along the way.
//
// Requires (dev-only): playwright-core and a Chromium build.
//   node web/test/smoke.mjs        # exit 0 = on air
/* global window, document, localStorage, WheelEvent, KCAT -- page-side names inside page.evaluate callbacks */
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(500);

  ok(await page.evaluate(() => !!window.KCAT), "app boots (window.KCAT)");
  ok(await page.evaluate(() => !!document.getElementById("rain")), "rain canvas present");

  await page.click("#power");
  try {
    await page.waitForFunction(() => window.KCAT && KCAT.recipe && KCAT.recipe.seed === 42, null, { timeout: 30000 });
    const r = await page.evaluate(() => ({ ch: KCAT.recipe.channel, title: KCAT.recipe.title }));
    ok(r.ch === "dusty" && r.title === "Shimokitazawa Umbrellas", "signature track opens the session");
  } catch { ok(false, "signature track opens the session"); }

  ok(await page.evaluate(() => document.getElementById("freq").textContent) === "88.5", "display shows 88.5");

  const vu1 = await page.evaluate(() => document.getElementById("vu").toDataURL());
  await page.waitForTimeout(1200);
  const vu2 = await page.evaluate(() => document.getElementById("vu").toDataURL());
  ok(vu1 !== vu2, "VU needles move with the music");

  await page.evaluate(() => document.getElementById("kTune")
    .dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })));
  try {
    await page.waitForFunction(() => KCAT.recipe && KCAT.recipe.channel === "minyo", null, { timeout: 30000 });
    ok(true, "TUNING retunes to MIN'YO through the bridge");
  } catch { ok(false, "TUNING retunes to MIN'YO through the bridge"); }

  await page.click("#recBtn");
  try {
    await page.waitForFunction(() => KCAT.tapes.length === 1, null, { timeout: 90000 });
    ok(true, "REC cuts a tape");
    ok(await page.evaluate(() => (localStorage.getItem("kcat.tapes.v1") || "").length > 2), "tape persists to the rack");
  } catch { ok(false, "REC cuts a tape"); }

  ok(errors.length === 0, `zero page errors${errors.length ? ": " + errors[0] : ""}`);
} finally {
  await browser.close();
  srv.close();
}
console.log(failures ? `\nSMOKE: ${failures} failure(s)` : "\nSMOKE: on air");
process.exit(failures ? 1 : 0);
