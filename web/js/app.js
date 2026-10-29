// app.js — K-CAT 99.9: the console is the radio.
// POWER warms the tubes and starts a session (signature track first,
// then the seeded dial-wander — the JS twin of kcat/radio.py).
// TUNING pins a station or ALL; REC renders the current recipe to a
// tape (WAV master); tapes are recipes on a shelf, re-rendered to
// play. BASS/TREBLE drive real filters; the VU needles read the
// live output. Nine supervises. She is asleep. She is always asleep.
import { CHANNELS, generate_recipe } from "./recipes.js";
import { Player, renderOffline } from "./player.js";
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

/* ------------------------------------------------ fit the room */
const scene = document.querySelector(".scene");
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 800);
  scene.style.transformOrigin = "top center";
  scene.style.transform = `scale(${s})`;
  document.body.style.height = 800 * s + "px";
  document.body.style.margin = "0";
}
addEventListener("resize", fit); fit();

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

function playRecipe(r) {
  currentRecipe = r;
  setTrackDisplay(r);
  player.play(r, { output: radioBus });
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
    warm.gain.setTargetAtTime(0, ctx.currentTime, 0.07);
    setTimeout(() => { if (!power && player) player.stop(); }, 220);
    dispEl.classList.add("off");
    setDisplay("99.9", "K-CAT 99.9 FM · TOKYO · POWER ON TO TUNE IN · NINE IS ASLEEP ON THE CONSOLE");
    stopVU();
  }
}
rocker.addEventListener("click", () => setPower(!power));

/* ------------------------------------------------ knobs */
function makeKnob(el, { min, max, value, onInput, onCommit, wheelStep }) {
  const cap = el.querySelector(".knob-cap");
  let v = value;
  const render = () => { cap.style.transform = `rotate(${-135 + 270 * (v - min) / (max - min)}deg)`; };
  render();
  const api = { get: () => v, set: (nv) => { v = Math.max(min, Math.min(max, nv)); render(); } };
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY, v0 = v;
    const move = (ev) => {
      v = Math.max(min, Math.min(max, v0 + (y0 - ev.clientY) / 130 * (max - min)));
      render(); onInput && onInput(v);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      onCommit && onCommit(v);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    v = Math.max(min, Math.min(max, v + (e.deltaY < 0 ? 1 : -1) * (wheelStep ?? (max - min) / 18)));
    render(); onInput && onInput(v); onCommit && onCommit(v);
  }, { passive: false });
  return api;
}
makeKnob($("kVol"), {
  min: 0, max: 1, value: 0.8,
  onInput: (v) => { if (volG) volG.gain.setTargetAtTime(Math.pow(v, 1.6) * 1.15, ctx.currentTime, 0.03); },
});
makeKnob($("kBass"), {
  min: -12, max: 12, value: 0,
  onInput: (v) => { if (bassF) bassF.gain.setTargetAtTime(Math.abs(v) < 1 ? 0 : v, ctx.currentTime, 0.03); },
});
makeKnob($("kTreble"), {
  min: -12, max: 12, value: 0,
  onInput: (v) => { if (trebleF) trebleF.gain.setTargetAtTime(Math.abs(v) < 1 ? 0 : v, ctx.currentTime, 0.03); },
});
let tunePreview = 0;
makeKnob($("kTune"), {
  min: 0, max: TUNES.length - 1, value: 0, wheelStep: 1,
  onInput: (v) => {
    const d = Math.round(v);
    tunePreview = d;
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
try { tapes = JSON.parse(localStorage.getItem("kcat.tapes.v1") || "[]"); } catch (e) { tapes = []; }
function persistTapes() {
  try {
    localStorage.setItem("kcat.tapes.v1", JSON.stringify(tapes.map((t) => ({ seed: t.seed, channel: t.channel, title: t.title, dur: t.dur }))));
  } catch (e) { /* shelf is session-only */ }
}
const SPINE_COLS = ["#8a3324", "#20504a", "#71591c", "#3d4d8a", "#5d2f52", "#7a4a1f"];
function addSpine(t) {
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
  tapeList.innerHTML = "";
  if (!tapes.length) {
    tapeList.innerHTML = '<div class="tape-empty">No tapes yet. Power on, find a track you love, press ● REC.</div>';
    return;
  }
  for (const t of tapes) {
    const row = document.createElement("div");
    row.className = "tape";
    const meta = `${CHANNELS[t.channel].label} · SEED ${t.seed}${t.dur ? " · " + Math.round(t.dur) + "s" : ""}`;
    row.innerHTML = `<div class="tt"></div><div class="tm">${meta}</div>`;
    row.querySelector(".tt").textContent = t.title;
    const play = document.createElement("button"); play.textContent = "▶ play";
    play.addEventListener("click", () => playTape(t));
    const dl = document.createElement("button"); dl.textContent = "↓ WAV";
    dl.addEventListener("click", () => downloadTape(t));
    const del = document.createElement("button"); del.textContent = "✕"; del.className = "del";
    del.addEventListener("click", () => {
      tapes = tapes.filter((x) => x !== t);
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
  const buf = await renderOffline(generate_recipe(t.seed, t.channel));
  tapeBufs.set(t, buf);
  return buf;
}
async function playTape(t) {
  initAudio();
  await ctx.resume();
  if (player) player.stop();
  serial++;
  tapePlaying = true;
  setDisplay(FREQ[t.channel], `TAPE · ${t.title} · SEED ${t.seed} · ${CHANNELS[t.channel].label}`);
  const buf = await tapeBuffer(t);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(inp);
  src.onended = () => {
    tapePlaying = false;
    if (power && session) playRecipe(session.next());
    else setTrackDisplay(currentRecipe || t);
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
  try {
    const buf = await renderOffline(currentRecipe);
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
  setPower, retune,
};
