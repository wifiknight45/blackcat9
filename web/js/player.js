// The player: turns a composed track (compose.js) into sound.
//
// Two paths share one event-preparation step, so they cannot drift
// apart musically:
//
//  - Player (live): a lookahead scheduler on a real AudioContext —
//    a 25 ms timer schedules everything due within the next 120 ms,
//    the standard Web Audio pattern. Events are walked in time
//    order from a single merged timeline; drum hits are rendered
//    into buffers *in compose order* at load time, because the kit's
//    noise stream must be consumed in the same order Python's is.
//
//  - renderOffline(): the faithful master. Renders the whole track
//    in an OfflineAudioContext through the master chain, then
//    applies render.py's finishing steps in sample math.
//
// Master chain, both paths: per-event gain/pan -> warmth lowpass
// (cutoff 7000 Hz at dust 0 falling to 4200 Hz at dust 1, as
// render.py) -> tanh soft clip at drive 1.12 (a WaveShaper curve,
// y = tanh(1.12x)/tanh(1.12), exactly dsp.soft_clip) -> out.
//
// Python's remaining mastering steps and where they live here:
//  - varispeed wobble (damage.apply_wobble): reproduced sample-for-
//    sample on the offline render (post-process below). The live
//    path skips it — a monitoring difference, not a musical one.
//  - peak normalize to 0.89: offline only (live audio can't know
//    its peak in advance; the live master runs a fixed trim).
//  - fades (0.04 s in, 1.4 s out): both paths — sample math offline,
//    gain automation live.
//  - Python's warmth filter is a zero-phase FFT slope; the chain
//    uses a BiquadFilter (Q = 1/sqrt(2)) — same intent, different
//    curve. The offline path's voices were already rendered with
//    zero-phase helpers where Python used them per-voice.

import { compose, TAG_NOISE } from "./compose.js";
import {
  bassNoteSamples, epChordSamples, epNoteSamples, leadNoteSamples,
  moogLeadSamples, padChordSamples, pluckSamples,
} from "./voices.js";
import { DrumKit } from "./drums.js";
import { generateCrackleBuffer } from "./crackle.js";
import { peakOf, samplesToBuffer } from "./dsp.js";

const MASK64 = (1n << 64n) - 1n;

function warmthCutoff(dust) {
  return 7000.0 + (4200.0 - 7000.0) * dust;
}

function softClipCurve(drive = 1.12) {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2.0 - 1.0;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

function makeMaster(ctx, dust) {
  const input = ctx.createGain();
  const warmth = ctx.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.frequency.value = warmthCutoff(dust);
  warmth.Q.value = Math.SQRT1_2;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve(1.12);
  clip.oversample = "2x";
  const out = ctx.createGain();
  input.connect(warmth);
  warmth.connect(clip);
  clip.connect(out);
  return { input, out };
}

// Render every event's audio into an AudioBuffer, in place
// (ev.buffer). Voice buffers are cached by full parameter key —
// except drum hits, which are rendered once each, in array order,
// through the track's shared DrumKit (see header). The crackle bed
// is attached as prepared.crackleBuffer.
export function prepareEvents(ctx, recipe, composed) {
  const sr = ctx.sampleRate;
  const cache = new Map();
  const cached = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const f3 = (x) => Math.round(x * 1000);

  for (const ev of composed.events.ep) {
    const key = `ep|${ev.kind}|${ev.midis.join(",")}|${f3(ev.durS)}|${f3(ev.velocity)}|${sr}`;
    ev.buffer = cached(key, () => samplesToBuffer(ctx,
      ev.kind === "peek"
        ? epNoteSamples(sr, ev.midis[0], ev.durS, ev.velocity)
        : epChordSamples(sr, ev.midis, ev.durS, ev.velocity)));
  }
  for (const ev of composed.events.pad) {
    const key = `pad|${ev.midis.join(",")}|${f3(ev.durS)}|${f3(ev.velocity)}|${sr}`;
    ev.buffer = cached(key, () => samplesToBuffer(ctx,
      padChordSamples(sr, ev.midis, ev.durS, ev.velocity)));
  }
  for (const ev of composed.events.bass) {
    const key = `bass|${ev.midi}|${f3(ev.durS)}|${f3(ev.velocity)}|${sr}`;
    ev.buffer = cached(key, () => samplesToBuffer(ctx,
      bassNoteSamples(sr, ev.midi, ev.durS, ev.velocity)));
  }
  // Drums: no cache — the shared noise stream makes each hit unique,
  // and consumption order is part of the contract.
  const kit = new DrumKit((BigInt(recipe.seed) ^ TAG_NOISE) & MASK64, sr);
  for (const ev of composed.events.drums) {
    ev.buffer = samplesToBuffer(ctx, kit.renderHit(ev.type, ev.velocity));
  }
  for (const ev of composed.events.lead) {
    const key = `lead|${ev.voice}|${ev.midi}|${f3(ev.durS)}|${f3(ev.velocity)}|` +
      `${ev.noteSeed}|${ev.glideFrom}|${sr}`;
    ev.buffer = cached(key, () => samplesToBuffer(ctx,
      ev.voice === "pluck"
        ? pluckSamples(sr, ev.midi, ev.durS, ev.velocity, ev.noteSeed)
        : ev.voice === "moog"
          ? moogLeadSamples(sr, ev.midi, ev.durS, ev.velocity,
                            ev.noteSeed, ev.glideFrom)
          : leadNoteSamples(sr, ev.midi, ev.durS, ev.velocity)));
  }

  const crackle = generateCrackleBuffer(ctx, composed.durationS,
    recipe.dust, (BigInt(recipe.seed) ^ TAG_NOISE) & MASK64);
  return { crackleBuffer: crackle };
}

// One merged timeline, sorted by time (stable: compose order breaks
// ties, preserving the drum stream's render order in scheduling too).
function buildTimeline(composed) {
  const all = [];
  for (const ev of composed.events.ep) all.push({ ev, kind: "ep" });
  for (const ev of composed.events.pad) all.push({ ev, kind: "pad" });
  for (const ev of composed.events.bass) all.push({ ev, kind: "bass" });
  for (const ev of composed.events.drums) all.push({ ev, kind: "drums" });
  for (const ev of composed.events.lead) all.push({ ev, kind: "lead" });
  return all
    .map((item, i) => ({ ...item, i }))
    .sort((a, b) => (a.ev.t - b.ev.t) || (a.i - b.i))
    .map(({ ev, kind }) => ({ ev, kind }));
}

// ------------------------------------------------------------ live

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.playing = false;
    this._sources = [];
    this._timer = null;
    this._nodes = [];
    this.onended = null;
  }

  // play(recipe, { bars, onended }) — starts (or restarts) playback.
  play(recipe, options = {}) {
    this.stop();
    const ctx = this.ctx;
    const composed = compose(recipe, options);
    const prepared = prepareEvents(ctx, recipe, composed);
    const master = makeMaster(ctx, recipe.dust);
    const fade = ctx.createGain();
    master.out.connect(fade);
    fade.connect(options.output || ctx.destination);
    this._nodes = [master.input, fade];

    const t0 = ctx.currentTime + 0.06;
    const dur = composed.durationS;
    // Master fades, as render.py: 0.04 s in, 1.4 s out.
    fade.gain.setValueAtTime(0.0, t0);
    fade.gain.linearRampToValueAtTime(1.0, t0 + 0.04);
    fade.gain.setValueAtTime(1.0, t0 + Math.max(0.04, dur - 1.4));
    fade.gain.linearRampToValueAtTime(0.0, t0 + dur);

    // The crackle bed runs the whole track, under everything.
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = prepared.crackleBuffer;
    crackleSrc.connect(master.input);
    crackleSrc.start(t0);
    this._sources.push(crackleSrc);

    const timeline = buildTimeline(composed);
    let ptr = 0;
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      const horizon = ctx.currentTime - t0 + 0.12;
      while (ptr < timeline.length && timeline[ptr].ev.t < horizon) {
        const { ev } = timeline[ptr];
        const src = ctx.createBufferSource();
        src.buffer = ev.buffer;
        let node = src;
        if (ev.buffer.numberOfChannels === 2) {
          const g = ctx.createGain();
          g.gain.value = ev.gain;
          src.connect(g);
          node = g;
        } else {
          const panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, ev.pan || 0));
          const g = ctx.createGain();
          g.gain.value = ev.gain;
          src.connect(panner);
          panner.connect(g);
          node = g;
        }
        node.connect(master.input);
        const when = t0 + ev.t;
        if (ev.t >= 0) src.start(when);
        else src.start(when, -ev.t);
        this._sources.push(src);
        ptr++;
      }
      if (ptr >= timeline.length && ctx.currentTime - t0 > dur + 0.3) {
        this.stop();
        if (this.onended) this.onended();
      }
    };
    this._timer = setInterval(tick, 25);
    tick();
    this.composed = composed;
    return composed;
  }

  stop() {
    this.playing = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const src of this._sources) {
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* noop */ }
    }
    this._sources = [];
    for (const node of this._nodes) {
      try { node.disconnect(); } catch { /* noop */ }
    }
    this._nodes = [];
  }
}

// ------------------------------------------------------------ offline

// renderOffline(recipe, { bars = 16, sampleRate = 44100 })
//   -> Promise<AudioBuffer>: the whole track, mastered as render.py
//   masters it (warmth, wobble, soft clip, peak normalize 0.89,
//   fades). Used by tests now and by REC export later.
export async function renderOffline(recipe, options = {}) {
  const sampleRate = options.sampleRate || 44100;
  const composed = compose(recipe, options);
  const frames = Math.max(1, Math.ceil(composed.durationS * sampleRate));
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  const prepared = prepareEvents(ctx, recipe, composed);
  const master = makeMaster(ctx, recipe.dust);
  master.out.connect(ctx.destination);

  const crackleSrc = ctx.createBufferSource();
  crackleSrc.buffer = prepared.crackleBuffer;
  crackleSrc.connect(master.input);
  crackleSrc.start(0);

  for (const { ev } of buildTimeline(composed)) {
    const src = ctx.createBufferSource();
    src.buffer = ev.buffer;
    let node = src;
    if (ev.buffer.numberOfChannels === 2) {
      const g = ctx.createGain();
      g.gain.value = ev.gain;
      src.connect(g);
      node = g;
    } else {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, ev.pan || 0));
      const g = ctx.createGain();
      g.gain.value = ev.gain;
      src.connect(panner);
      panner.connect(g);
      node = g;
    }
    node.connect(master.input);
    if (ev.t >= 0) src.start(ev.t);
    else src.start(0, -ev.t);
  }

  const rendered = await ctx.startRendering();
  return masterBuffer(rendered, recipe, sampleRate);
}

// render.py's post-graph mastering, in sample math: varispeed
// wobble (damage.apply_wobble, mirrored formula-for-formula), peak
// normalize to 0.89, and the 0.04 s / 1.4 s fades. (The warmth
// lowpass and soft clip already happened in the graph; Python runs
// wobble between them — an ordering difference of two gentle
// processes, noted here rather than hidden.)
function masterBuffer(rendered, recipe, sr) {
  const n = rendered.length;
  const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];

  let data = channels.map((ch) => Float32Array.from(ch));
  const wobble = recipe.wobble;
  if (wobble > 0.0 && n > 1) {
    // rate = 1 + w*0.0035*sin(2pi*0.45 t) + w*0.0020*sin(2pi*0.09 t + 1.3)
    // idx = cumsum(rate), rescaled so idx[-1] == n - 1; linear interp.
    const idx = new Float64Array(n);
    let acc = 0.0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      acc += 1.0 + wobble * 0.0035 * Math.sin(2.0 * Math.PI * 0.45 * t) +
        wobble * 0.0020 * Math.sin(2.0 * Math.PI * 0.09 * t + 1.3);
      idx[i] = acc;
    }
    const scale = (n - 1) / idx[n - 1];
    for (let i = 0; i < n; i++) idx[i] *= scale;
    data = data.map((ch) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = idx[i];
        const lo = Math.floor(x);
        if (lo >= n - 1) out[i] = ch[n - 1];
        else out[i] = ch[lo] + (ch[lo + 1] - ch[lo]) * (x - lo);
      }
      return out;
    });
  }

  let peak = 0.0;
  for (const ch of data) peak = Math.max(peak, peakOf(ch));
  if (peak > 0) {
    const s = 0.89 / peak;
    for (const ch of data) for (let i = 0; i < n; i++) ch[i] *= s;
  }

  const fadeIn = Math.min(Math.trunc(0.04 * sr), n);
  for (let i = 0; i < fadeIn; i++) {
    const g = i / fadeIn;
    data[0][i] *= g;
    data[1][i] *= g;
  }
  const fadeOut = Math.min(Math.trunc(1.4 * sr), Math.floor(n / 2));
  for (let i = 0; i < fadeOut; i++) {
    const g = 1.0 - i / fadeOut;
    data[0][n - fadeOut + i] *= g;
    data[1][n - fadeOut + i] *= g;
  }

  const out = new OfflineAudioContext(2, n, sr).createBuffer(2, n, sr);
  out.getChannelData(0).set(data[0]);
  out.getChannelData(1).set(data[1]);
  return out;
}
