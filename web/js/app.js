// app.js — K-CAT 99.9: the console is the radio.
// POWER warms the tubes and starts a session (signature track first,
// then the seeded dial-wander — the JS twin of kcat/radio.py).
// TUNING pins a station or ALL; REC renders the current recipe to a
// tape (WAV master); tapes are recipes on a shelf, re-rendered to
// play. BASS/TREBLE drive real filters; the VU needles read the
// live output. Nine supervises. She is asleep. She is always asleep.
import { CHANNELS, generate_recipe } from "./recipes.js";
import { Player, prepareTrack, renderOffline } from "./player.js";
import { Session, playStatic, playIdent } from "./radio.js";
import { bufferToWavBlob } from "./wav.js";

// The dial derives from the station table: add a channel to
// CHANNELS (recipes.js, mirrored from kcat/recipes.py) with a freq
// in its label and it appears on the TUNING knob automatically.
const STATIONS = Object.entries(CHANNELS)
  .map(([slug, cfg]) => ({ slug, freq: (cfg.label.match(/\d+\.\d+/) || ["--"])[0] }))
  .sort((a, b) => parseFloat(a.freq) - parseFloat(b.freq));
const FREQ = Object.fromEntries(STATIONS.map((s) => [s.slug, s.freq]));
const TUNES = ["all", ...STATIONS.map((s) => s.slug)];
{
  const det = document.querySelector(".detents");
  if (det) det.innerHTML = TUNES.map((t) => `<span>${t === "all" ? "ALL" : FREQ[t]}</span>`).join("");
}
const $ = (id) => document.getElementById(id);

// S7b: yield two frames so a state change (REC's "recording" pulse,
// a tape's display line) actually paints before a long synchronous
// render blocks the main thread. Pre-fix the REC press could freeze
// the page inside renderOffline's event preparation without the
// button state ever appearing.
const nextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

/* ------------------------------------------------ fit the room */
// S7c (audit Stage 1): scale ONE wrapper — #stage holds the scene,
// the control box and the rack — and centre it with explicit
// translate math. Pre-fix only .scene was scaled, with transform-
// origin "top center" on a 1280-px layout box: below 1280 px wide
// the room slid off-screen right (audit B3), the unscaled controls
// detached from the console by ~1,200 px on phones (B2), and above
// 1280 px the controls stopped aligning with the console (B4).
// The full responsive layout is the audit's Stage 2 — Aubrey's
// design call, deliberately not in this patch.
const stage = document.getElementById("stage");
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 800);
  const x = (innerWidth - 1280 * s) / 2;
  const y = (innerHeight - 800 * s) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  document.body.style.margin = "0";
}
addEventListener("resize", fit);
addEventListener("orientationchange", fit);
if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);
fit();

/* ------------------------------------------------ display */
const dispEl = $("display"), freqEl = $("freq"), ttlEl = $("ttl");
function setDisplay(freq, title) {
  freqEl.textContent = freq;
  ttlEl.textContent = title + " · · · " + title + " · · · ";
}
function setTrackDisplay(r) {
  setDisplay(FREQ[r.channel], `NOW PLAYING: ${r.title} · SEED ${r.seed} · ${CHANNELS[r.channel].label}`);
}
function setStaticDisplay() { setDisplay("· · ·", "STATIC · · · TUNING · · ·"); }
dispEl.classList.add("off");
setDisplay("99.9", "K-CAT 99.9 FM · TOKYO · POWER ON TO TUNE IN · NINE IS ASLEEP ON THE CONSOLE");

/* ------------------------------------------------ audio chain */
let ctx = null, player = null;
let radioBus, warm, inp, bassF, trebleF, volG, anL, anR;
function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  radioBus = ctx.createGain();
  warm = ctx.createGain(); warm.gain.value = 0;
  inp = ctx.createGain();
  bassF = ctx.createBiquadFilter(); bassF.type = "lowshelf"; bassF.frequency.value = 200;
  trebleF = ctx.createBiquadFilter(); trebleF.type = "highshelf"; trebleF.frequency.value = 3200;
  volG = ctx.createGain(); volG.gain.value = Math.pow(0.8, 1.6) * 1.15;
  radioBus.connect(warm); warm.connect(inp);
  inp.connect(bassF); bassF.connect(trebleF); trebleF.connect(volG); volG.connect(ctx.destination);
  const spl = ctx.createChannelSplitter(2);
  anL = ctx.createAnalyser(); anL.fftSize = 1024;
  anR = ctx.createAnalyser(); anR.fftSize = 1024;
  volG.connect(spl); spl.connect(anL, 0); spl.connect(anR, 1);
  player = new Player(ctx);
  player.onended = () => { if (power && !tapePlaying) bridgeToNext(); };
}

/* ------------------------------------------------ session */
let power = false, session = null, sessionSeed = 0;
let currentRecipe = null, tuneIdx = 0, serial = 0, tapePlaying = false;

// S7b prefetch: preparing a track (compose + voice synthesis) is
// synchronous main-thread work; doing it at the track boundary
// froze the page on every change. Instead, ~3 s into each track we
// prepare the session's *next* recipe (peeked, not consumed) and
// playRecipe hands the bundle to the player. The cost moves to a
// mid-track moment; the boundary itself becomes cheap. A full
// Worker migration remains the future fix (see S7 report).
let prefetch = null;
const recipeKey = (r) => r.channel + ":" + r.seed;
function schedulePrefetch() {
  prefetch = null;
  if (!power || !session || !player) return;
  const s = serial;
  setTimeout(() => {
    if (!power || !session || s !== serial) return;
    try {
      const next = session.peekNext();
      prefetch = { key: recipeKey(next), bundle: prepareTrack(ctx, next, { bars: next.bars }) };
    } catch { prefetch = null; }
  }, 3000);
}

function playRecipe(r) {
  stopTape();
  currentRecipe = r;
  setTrackDisplay(r);
  // S7a bug #4: pass the recipe's own bar count, like the CLI radio
  // does (render_session renders recipe.bars). Without it the web
  // played compose()'s 16-bar default — a REC tape of a seed was a
  // different, shorter piece than the CLI's tape of the same seed.
  const bundle = (prefetch && prefetch.key === recipeKey(r)) ? prefetch.bundle : null;
  prefetch = null;
  player.play(r, { output: radioBus, bars: r.bars, bundle });
  schedulePrefetch();
}
async function bridgeToNext() {
  const s = ++serial;
  const next = session.next();
  setStaticDisplay();
  await playStatic(ctx, radioBus, 0.8, 0.32);
  if (s !== serial || !power) return;
  setDisplay(FREQ[next.channel], `K-CAT 99.9 · ${CHANNELS[next.channel].label} · · · IDENT · · ·`);
  await playIdent(ctx, radioBus, next, 1.3);
  if (s !== serial || !power) return;
  playRecipe(next);
}
async function retune(idx) {
  tuneIdx = idx;
  if (!power) return;
  const s = ++serial;
  stopTape();
  player.stop();
  session = new Session(sessionSeed, TUNES[idx]);
  const next = session.next();
  setStaticDisplay();
  await playStatic(ctx, radioBus, 0.55, 0.38);
  if (s !== serial || !power) return;
  await playIdent(ctx, radioBus, next, 1.1);
  if (s !== serial || !power) return;
  playRecipe(next);
}

const rocker = $("power");
async function setPower(on) {
  initAudio();
  await ctx.resume();
  power = on;
  rocker.classList.toggle("on", on);
  rocker.setAttribute("aria-pressed", String(on));
  serial++;
  if (on) {
    sessionSeed = (Date.now() % 900000) + 1000;
    session = new Session(sessionSeed, TUNES[tuneIdx]);
    $("rackSession").textContent = "SESSION " + sessionSeed;
    dispEl.classList.remove("off");
    dispEl.classList.add("warming");
    warm.gain.setTargetAtTime(1, ctx.currentTime, 0.42);
    startVU();
    const s = serial;
    setTimeout(() => dispEl.classList.remove("warming"), 1400);
    setStaticDisplay();
    await playStatic(ctx, radioBus, 0.7, 0.3);
    if (s !== serial || !power) return;
    const first = session.next();
    await playIdent(ctx, radioBus, first, 1.2);
    if (s !== serial || !power) return;
    playRecipe(first);
  } else {
    stopTape();  // S7a bug #2: POWER off silences AND stops tapes.
    prefetch = null;
    warm.gain.setTargetAtTime(0, ctx.currentTime, 0.07);
    setTimeout(() => { if (!power && player) player.stop(); }, 220);
    dispEl.classList.add("off");
    setDisplay("99.9", "K-CAT 99.9 FM · TOKYO · POWER ON TO TUNE IN · NINE IS ASLEEP ON THE CONSOLE");
    stopVU();
  }
}
rocker.addEventListener("click", () => setPower(!power));

/* ------------------------------------------------ knobs */
// S7c accessibility + audit M4/M5/M9: each knob is a real slider
// widget — role="slider", focusable, aria-valuemin/max/now/text,
// arrow / PageUp / PageDown / Home / End keys. Pointer handling:
// setPointerCapture is wrapped (Gecko throws for a synthetic or
// inactive pointer, which used to abort the whole drag), move/up
// check the captured pointerId, and pointercancel cleans up like
// pointerup but WITHOUT committing — a cancelled TUNING drag must
// not retune to wherever the finger happened to be.
function makeKnob(el, { min, max, value, onInput, onCommit, wheelStep, label, valueText }) {
  const cap = el.querySelector(".knob-cap");
  let v = value;
  const clamp = (nv) => Math.max(min, Math.min(max, nv));
  const shown = () => String(Math.round(v * 100) / 100);
  el.setAttribute("role", "slider");
  el.setAttribute("tabindex", "0");
  if (label) el.setAttribute("aria-label", label);
  el.setAttribute("aria-valuemin", String(min));
  el.setAttribute("aria-valuemax", String(max));
  const render = () => {
    cap.style.transform = `rotate(${-135 + 270 * (v - min) / (max - min)}deg)`;
    el.setAttribute("aria-valuenow", shown());
    el.setAttribute("aria-valuetext", valueText ? valueText(v) : shown());
  };
  render();
  const api = { get: () => v, set: (nv) => { v = clamp(nv); render(); } };
  const step = wheelStep ?? (max - min) / 50;
  el.addEventListener("pointerdown", (e) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* audit M9 */ }
    const pid = e.pointerId;
    const y0 = e.clientY, v0 = v;
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      v = clamp(v0 + (y0 - ev.clientY) / 130 * (max - min));
      render(); onInput && onInput(v);
    };
    const cleanup = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      cleanup();
      onCommit && onCommit(v);
    };
    const cancel = (ev) => {
      if (ev.pointerId !== pid) return;
      cleanup();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    v = clamp(v + (e.deltaY < 0 ? 1 : -1) * (wheelStep ?? (max - min) / 18));
    render(); onInput && onInput(v); onCommit && onCommit(v);
  }, { passive: false });
  el.addEventListener("keydown", (e) => {
    let nv = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") nv = v + step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") nv = v - step;
    else if (e.key === "PageUp") nv = v + step * 10;
    else if (e.key === "PageDown") nv = v - step * 10;
    else if (e.key === "Home") nv = min;
    else if (e.key === "End") nv = max;
    if (nv === null) return;
    e.preventDefault();
    v = clamp(nv);
    render(); onInput && onInput(v); onCommit && onCommit(v);
  });
  return api;
}
makeKnob($("kVol"), {
  min: 0, max: 1, value: 0.8, label: "Volume",
  valueText: (v) => `${Math.round(v * 100)} percent`,
  onInput: (v) => { if (volG) volG.gain.setTargetAtTime(Math.pow(v, 1.6) * 1.15, ctx.currentTime, 0.03); },
});
makeKnob($("kBass"), {
  min: -12, max: 12, value: 0, label: "Bass",
  valueText: (v) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`,
  onInput: (v) => { if (bassF) bassF.gain.setTargetAtTime(Math.abs(v) < 1 ? 0 : v, ctx.currentTime, 0.03); },
});
makeKnob($("kTreble"), {
  min: -12, max: 12, value: 0, label: "Treble",
  valueText: (v) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`,
  onInput: (v) => { if (trebleF) trebleF.gain.setTargetAtTime(Math.abs(v) < 1 ? 0 : v, ctx.currentTime, 0.03); },
});
makeKnob($("kTune"), {
  min: 0, max: TUNES.length - 1, value: 0, wheelStep: 1, label: "Tuning",
  valueText: (v) => {
    const d = Math.round(v);
    return d === 0 ? "All stations" : CHANNELS[TUNES[d]].label;
  },
  onInput: (v) => {
    const d = Math.round(v);
    if (d === 0) setDisplay("99.9", "TUNING · · · ALL STATIONS · · · THE WHOLE DIAL");
    else setDisplay(FREQ[TUNES[d]], `TUNING · · · ${CHANNELS[TUNES[d]].label}`);
  },
  onCommit: (v) => { const d = Math.round(v); if (d !== tuneIdx) retune(d); else tuneIdx = d; },
});

/* ------------------------------------------------ VU meters */
const vuC = $("vu"), vuX = vuC.getContext("2d");
const face = document.createElement("canvas"); face.width = 168; face.height = 88;
{
  const f = face.getContext("2d");
  f.fillStyle = "#e9dab0"; f.fillRect(0, 0, 168, 88);
  f.strokeStyle = "rgba(90,60,20,.35)"; f.strokeRect(3.5, 3.5, 161, 81);
  f.fillStyle = "#4a3418"; f.font = "bold 10px Georgia"; f.textAlign = "center";
  f.fillText("K-CAT", 84, 20);
  f.font = "8px Georgia"; f.fillText("OUTPUT · VU", 84, 31);
  const db2a = (db) => (-40 + 80 * Math.max(0, Math.min(1, (db + 22) / 25))) * Math.PI / 180;
  for (const db of [-20, -10, -7, -5, -3, -1, 0, 3]) {
    const a = db2a(db), cx = 84, cy = 100, r1 = 66, r2 = db >= 0 ? 56 : 60;
    f.strokeStyle = db >= 0 ? "#a33327" : "#4a3418"; f.lineWidth = db >= 0 ? 2 : 1.2;
    f.beginPath();
    f.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    f.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    f.stroke();
    f.fillStyle = db >= 0 ? "#a33327" : "#4a3418"; f.font = "7.5px Georgia";
    f.fillText(db > 0 ? "+" + db : "" + db, cx + Math.sin(a) * 48, cy - Math.cos(a) * 48 + 2);
  }
}
let vuRAF = null, needleL = -40, needleR = -40;
const tbuf = new Float32Array(1024);
function rmsOf(an) {
  an.getFloatTimeDomainData(tbuf);
  let s = 0; for (let i = 0; i < tbuf.length; i += 2) s += tbuf[i] * tbuf[i];
  return Math.sqrt(s / (tbuf.length / 2));
}
function drawVU() {
  const dbOf = (rms) => Math.max(-40, 20 * Math.log10(rms + 1e-6));
  const ang = (db) => -40 + 80 * Math.max(0, Math.min(1, (db + 22) / 25));
  const tL = ang(dbOf(rmsOf(anL))), tR = ang(dbOf(rmsOf(anR)));
  needleL += (tL - needleL) * (tL > needleL ? 0.7 : 0.06);
  needleR += (tR - needleR) * (tR > needleR ? 0.7 : 0.06);
  vuX.drawImage(face, 0, 0);
  for (const [deg, col, w] of [[needleL, "#26221c", 2.1], [needleR, "#a33327", 1.7]]) {
    const a = deg * Math.PI / 180;
    vuX.strokeStyle = col; vuX.lineWidth = w; vuX.beginPath();
    vuX.moveTo(84, 100); vuX.lineTo(84 + Math.sin(a) * 86, 100 - Math.cos(a) * 86); vuX.stroke();
  }
  vuX.fillStyle = "#2c2113"; vuX.beginPath(); vuX.arc(84, 100, 5, 0, 7); vuX.fill();
  vuRAF = requestAnimationFrame(drawVU);
}
function startVU() { if (!vuRAF) drawVU(); }
function stopVU() {
  if (vuRAF) cancelAnimationFrame(vuRAF);
  vuRAF = null;
  vuX.drawImage(face, 0, 0);
  vuX.fillStyle = "rgba(10,6,2,.55)"; vuX.fillRect(0, 0, 168, 88);
}
vuX.drawImage(face, 0, 0);
vuX.fillStyle = "rgba(10,6,2,.55)"; vuX.fillRect(0, 0, 168, 88);

/* ------------------------------------------------ tapes */
let tapes = [];
const tapeBufs = new Map();
// S7a bug #1: the shelf is browser-controlled storage — privacy
// browsers (DuckDuckGo's Fire Button / auto-clear, private modes)
// truncate or corrupt it, and pre-fix a malformed entry bricked the
// whole console at startup: only JSON.parse was guarded, then
// tapes.forEach hit addSpine's t.title.slice and renderRack's
// CHANNELS[t.channel].label on unvalidated data. Validate the shape
// on load instead: keep only entries the rack can actually render,
// drop the rest, never throw. (Audit B5 reproduced the same crash
// from a partial [{"seed":42}] entry.)
function sanitizeTapes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    if (!Number.isInteger(t.seed)) continue;
    if (typeof t.channel !== "string" || !Object.hasOwn(CHANNELS, t.channel)) continue;
    if (typeof t.title !== "string" || !t.title) continue;
    const dur = (typeof t.dur === "number" && Number.isFinite(t.dur) && t.dur > 0)
      ? t.dur : null;
    out.push({ seed: t.seed, channel: t.channel, title: t.title, dur });
  }
  return out;
}
try { tapes = sanitizeTapes(JSON.parse(localStorage.getItem("kcat.tapes.v1") || "[]")); } catch { tapes = []; }
function persistTapes() {
  try {
    localStorage.setItem("kcat.tapes.v1", JSON.stringify(tapes.map((t) => ({ seed: t.seed, channel: t.channel, title: t.title, dur: t.dur }))));
  } catch { /* shelf is session-only */ }
}
const SPINE_COLS = ["#8a3324", "#20504a", "#71591c", "#3d4d8a", "#5d2f52", "#7a4a1f"];
function addSpine(t) {
  if (!t || typeof t.title !== "string") return;  // belt & braces (bug #1)
  const stack = document.querySelector(".tapestack");
  if (!stack || stack.children.length > 9) return;
  const d = document.createElement("div");
  d.className = "tp";
  d.style.background = SPINE_COLS[Math.abs(t.seed) % SPINE_COLS.length];
  const s = document.createElement("span");
  s.textContent = t.title.slice(0, 16).toUpperCase();
  d.appendChild(s);
  stack.appendChild(d);
}
tapes.forEach(addSpine);

const rack = $("rack"), tapeList = $("tapeList");
function renderRack() {
  // S7b: build the rack with DOM calls + textContent throughout.
  // Pre-fix the meta line went in via innerHTML — its values come
  // from localStorage (sanitized on load, but the rack should never
  // be one sanitizer slip away from markup injection).
  tapeList.replaceChildren();
  if (!tapes.length) {
    const empty = document.createElement("div");
    empty.className = "tape-empty";
    empty.textContent = "No tapes yet. Power on, find a track you love, press ● REC.";
    tapeList.appendChild(empty);
    return;
  }
  for (const t of tapes) {
    const row = document.createElement("div");
    row.className = "tape";
    const tt = document.createElement("div");
    tt.className = "tt";
    tt.textContent = t.title;
    const tm = document.createElement("div");
    tm.className = "tm";
    tm.textContent = `${CHANNELS[t.channel].label} · SEED ${t.seed}${t.dur ? " · " + Math.round(t.dur) + "s" : ""}`;
    row.append(tt, tm);
    const play = document.createElement("button"); play.textContent = "▶ play";
    play.addEventListener("click", () => playTape(t));
    const dl = document.createElement("button"); dl.textContent = "↓ WAV";
    dl.addEventListener("click", () => downloadTape(t));
    const del = document.createElement("button"); del.textContent = "✕"; del.className = "del";
    del.addEventListener("click", () => {
      if (tapeSrc && tapeEntry === t) stopTape();
      tapes = tapes.filter((x) => x !== t);
      tapeBufs.delete(t);  // S7a bug #3: free the cached render (~15-20 MB)
      persistTapes(); renderRack();
    });
    row.append(play, dl, del);
    tapeList.appendChild(row);
  }
}
$("rackBtn").addEventListener("click", () => { renderRack(); rack.classList.toggle("hidden"); });
$("rackClose").addEventListener("click", () => rack.classList.add("hidden"));

async function tapeBuffer(t) {
  if (tapeBufs.has(t)) return tapeBufs.get(t);
  const recipe = generate_recipe(t.seed, t.channel);
  // Bug #4 again: render the recipe's full bar count, as the CLI does.
  const buf = await renderOffline(recipe, { bars: recipe.bars });
  tapeBufs.set(t, buf);
  return buf;
}

// S7a bug #2, the whole fix: tape playback is part of the console,
// not a side channel. Pre-fix the tape source connected to `inp` —
// *after* the `warm` gain — so POWER didn't silence it; the source
// wasn't stored, so nothing could stop it; a second play overlapped
// the first; and `tapePlaying` was set before the async render, so
// a failed render left it true forever and stalled the radio (the
// player's onended bridge is gated on !tapePlaying). Now: the source
// is stored, routed through radioBus (upstream of `warm`, so POWER
// governs it exactly like the radio), replaced — never overlapped —
// by a second play, stopped by POWER off / retune / radio start, and
// tapePlaying is reset on every exit path.
let tapeSrc = null, tapeEntry = null;
function stopTape() {
  if (tapeSrc) {
    tapeSrc.onended = null;
    try { tapeSrc.stop(); } catch { /* already stopped */ }
    try { tapeSrc.disconnect(); } catch { /* noop */ }
    tapeSrc = null;
    tapeEntry = null;
  }
  tapePlaying = false;
}
async function playTape(t) {
  initAudio();
  await ctx.resume();
  if (!power) await setPower(true);  // tapes sound through POWER now
  stopTape();
  if (player) player.stop();
  const s = ++serial;
  tapePlaying = true;
  tapeEntry = t;
  setDisplay(FREQ[t.channel], `TAPE · ${t.title} · SEED ${t.seed} · ${CHANNELS[t.channel].label}`);
  await nextPaint();  // let the TAPE display paint before the render (S7b)
  let buf;
  try {
    buf = await tapeBuffer(t);
  } catch {
    tapePlaying = false;  // a failed render must never stall the radio
    tapeEntry = null;
    return;
  }
  if (s !== serial) {  // powered off / retuned / superseded mid-render
    tapePlaying = false;
    tapeEntry = null;
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(radioBus);
  tapeSrc = src;
  src.onended = () => {
    if (tapeSrc === src) { tapeSrc = null; tapeEntry = null; }
    tapePlaying = false;
    if (power && session) playRecipe(session.next());
  };
  src.start();
}
async function downloadTape(t) {
  const buf = await tapeBuffer(t);
  const url = URL.createObjectURL(bufferToWavBlob(buf));
  const a = document.createElement("a");
  a.href = url;
  a.download = t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-seed" + t.seed + ".wav";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let recBusy = false;
$("recBtn").addEventListener("click", async () => {
  if (!currentRecipe || recBusy) return;
  recBusy = true;
  const btn = $("recBtn");
  btn.classList.add("recording"); btn.disabled = true;
  await nextPaint();  // the "recording" state must paint before the render (S7b)
  try {
    const buf = await renderOffline(currentRecipe, { bars: currentRecipe.bars });
    const t = { seed: currentRecipe.seed, channel: currentRecipe.channel, title: currentRecipe.title, dur: buf.duration };
    tapeBufs.set(t, buf);
    tapes.unshift(t);
    persistTapes(); addSpine(t); renderRack();
    setDisplay(FREQ[t.channel], `● TAPE SAVED · ${t.title} · SEED ${t.seed} · SEE THE RACK`);
  } finally {
    btn.classList.remove("recording"); btn.disabled = false;
    recBusy = false;
  }
});
renderRack();

/* A handle for the curious (and for tests): the whole radio, inspectable. */
window.KCAT = {
  get power() { return power; },
  get recipe() { return currentRecipe; },
  get tapes() { return tapes; },
  get tune() { return TUNES[tuneIdx]; },
  get tapePlaying() { return tapePlaying; },
  get tapeBufCount() { return tapeBufs.size; },
  setPower, retune, playTape, stopTape,
};
