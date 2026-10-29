// Synthesized drum kit — the web twin of kcat/drums.py.
//
// Kick is a pitch-swept sine (pure math, identical to Python).
// Snare and hats are shaped noise: Python draws that noise from one
// shared numpy stream (seed ^ 0xF001 in render.py) in event order.
// The DrumKit mirrors the arrangement — one NoiseGen per track,
// consumed in compose.js's drum-event order — but the noise *values*
// are Box-Muller gaussians, not PCG64 (see dsp.js). Drum *decisions*
// (which hits, when, how hard) are bit-identical via compose.js;
// only the noise texture differs. That is the engine's standing
// bargain: composition is shared, texture is local.
//
// Python's bandpass/highpass are zero-phase FFT filters; here they
// are forward+backward one-pole passes (dsp.js) — same zero phase,
// gentler slopes, slightly rounder snap. Noted, not hidden.

import {
  NoiseGen, bandpassZP, expEnv, highpassZP, peakOf,
} from "./dsp.js";

export function kickSamples(sr, velocity = 1.0) {
  const dur = 0.28;
  const n = Math.trunc(dur * sr);
  const env = expEnv(n, 0.105, 0.0015, sr);
  const out = new Float32Array(n);
  let phase = 0.0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const freq = 43.0 + (120.0 - 43.0) * Math.exp(-t / 0.045);
    phase += 2.0 * Math.PI * freq / sr;  // cumsum, as numpy does
    out[i] = Math.sin(phase) * env[i] * velocity;
  }
  return out;
}

export function snareSamples(sr, gen, velocity = 1.0) {
  const dur = 0.19;
  const n = Math.trunc(dur * sr);
  const noise = gen.fill(n);
  const snapEnv = expEnv(n, 0.042, 0.001, sr);
  const snap = bandpassZP(noise, 1300.0, 5200.0, sr);
  const bodyEnv = expEnv(n, 0.05, 0.001, sr);
  const out = new Float32Array(n);
  const w = 2.0 * Math.PI * 186.0 / sr;
  for (let i = 0; i < n; i++) {
    out[i] = snap[i] * snapEnv[i] * 0.85 +
      Math.sin(w * i) * bodyEnv[i] * 0.5;
  }
  const peak = peakOf(out) || 1.0;
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.9 * velocity;
  return out;
}

export function hatSamples(sr, gen, openHat = false, velocity = 1.0) {
  const dur = openHat ? 0.32 : 0.055;
  const tau = openHat ? 0.085 : 0.011;
  const n = Math.trunc(dur * sr);
  const noise = gen.fill(n);
  const hp = highpassZP(noise, 7800.0, sr);
  const env = expEnv(n, tau, 0.0008, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = hp[i] * env[i];
  const peak = peakOf(out) || 1.0;
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.55 * velocity;
  return out;
}

// One kit per track render: holds the shared noise stream. Call
// renderHit in compose.js's drum-event order (the order Python's
// render loop consumes its stream) — player.js does exactly that.
export class DrumKit {
  constructor(seed, sampleRate) {
    // seed here is the *combined* stream seed (recipe seed ^ TAG_NOISE),
    // matching render.py's np.random.default_rng(seed ^ _TAG_NOISE).
    this.gen = new NoiseGen(seed);
    this.sampleRate = sampleRate;
  }
  renderHit(type, velocity) {
    const sr = this.sampleRate;
    switch (type) {
      case "kick": return kickSamples(sr, velocity);
      case "snare": return snareSamples(sr, this.gen, velocity);
      case "hat": return hatSamples(sr, this.gen, false, velocity);
      case "openhat": return hatSamples(sr, this.gen, true, velocity);
      default: throw new Error(`unknown drum type ${type}`);
    }
  }
}
