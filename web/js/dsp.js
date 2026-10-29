// Small DSP helpers — the web twin of kcat/dsp.py's role.
//
// Python renders offline with numpy: zero-phase FFT filters and a
// PCG64 noise generator (np_rng). Neither exists in the browser, so
// this module holds the JS analogues and every voice module shares
// them, so each approximation lives in exactly one place:
//
//  - NoiseGen: a deterministic gaussian stream built on SplitMix64 +
//    Box-Muller. It is NOT numpy's PCG64: the *values* differ from
//    Python's noise draws. Noise in this engine is texture (drum
//    bodies, the KS burst, crackle), never composition — every
//    musical decision comes from the SplitMix64 streams in
//    compose.js, which ARE bit-identical to Python. Documented
//    divergence, same contract as dsp.py's own header: "the recipe,
//    not the filter, is the shared contract."
//  - zero-phase filters: Python's FFT filters are applied here as
//    forward+backward one-pole passes (zero phase, gentle slope).
//    Close in character, not identical in curve.

import { SplitMix64 } from "./rng.js";

export const MASK64 = (1n << 64n) - 1n;

export function midiFreq(midi) {
  return 440.0 * (2.0 ** ((midi - 69) / 12.0));
}

// Deterministic gaussian stream (the np_rng analogue — see header).
export class NoiseGen {
  constructor(seed) {
    this.rng = new SplitMix64(BigInt(seed) & MASK64);
    this.spare = null;
  }
  next() {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u1 = 0.0;
    while (u1 <= 0.0) u1 = this.rng.random();
    const u2 = this.rng.random();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const th = 2.0 * Math.PI * u2;
    this.spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
  fill(n) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.next();
    return out;
  }
  uniform(a, b) {
    return a + (b - a) * this.rng.random();
  }
  // numpy rng.integers(lo, hi): uniform integer in [lo, hi).
  integers(lo, hi) {
    return lo + Math.floor(this.rng.random() * (hi - lo));
  }
  random() {
    return this.rng.random();
  }
}

// kcat.dsp.exp_env: attack ramp (1 - exp(-t/attack)) * exp(-t/tau),
// with the same clamps Python applies to tau and attack.
export function expEnv(n, tauS, attackS, sr) {
  const tau = Math.max(tauS, 1e-3);
  const atk = Math.max(attackS, 1e-4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = (1.0 - Math.exp(-t / atk)) * Math.exp(-t / tau);
  }
  return out;
}

// kcat.dsp.adsr_env: attack ramp into an exponential decay toward a
// sustain floor. (Python's attack_s is used as a time constant.)
export function adsrEnv(n, attackS, decayTauS, sustain, sr) {
  const atk = Math.max(attackS, 1e-4);
  const tau = Math.max(decayTauS, 1e-3);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = (1.0 - Math.exp(-t / atk)) *
      (sustain + (1.0 - sustain) * Math.exp(-t / tau));
  }
  return out;
}

function onePoleLPInPlace(x, fc, sr) {
  const a = 1.0 - Math.exp(-2.0 * Math.PI * fc / sr);
  let y = 0.0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = y;
  }
}

// Zero-phase lowpass: one-pole forward then backward (see header).
export function lowpassZP(samples, fc, sr) {
  const x = Float32Array.from(samples);
  onePoleLPInPlace(x, fc, sr);
  x.reverse();
  onePoleLPInPlace(x, fc, sr);
  x.reverse();
  return x;
}

// Zero-phase highpass: x - lowpass(x), forward+backward.
export function highpassZP(samples, fc, sr) {
  const lp = lowpassZP(samples, fc, sr);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < out.length; i++) out[i] = samples[i] - lp[i];
  return out;
}

// kcat.dsp.bandpass(x, lo, hi) = lowpass(highpass(x, lo), hi).
export function bandpassZP(samples, lo, hi, sr) {
  return lowpassZP(highpassZP(samples, lo, sr), hi, sr);
}

export function peakOf(x) {
  let m = 0.0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  return m;
}

// Wrap mono (or [L, R]) sample arrays in an AudioBuffer for any
// BaseAudioContext (live or offline).
export function samplesToBuffer(ctx, channels) {
  const list = Array.isArray(channels) ? channels : [channels];
  const len = list[0].length;
  const buf = ctx.createBuffer(list.length, len, ctx.sampleRate);
  for (let ch = 0; ch < list.length; ch++) {
    buf.getChannelData(ch).set(list[ch]);
  }
  return buf;
}

// Constant-power pan gains, identical formula to kcat.dsp.place and
// kcat.damage._place_event: angle = (pan + 1) * pi / 4.
export function panGains(pan) {
  const angle = (pan + 1.0) * Math.PI / 4.0;
  return [Math.cos(angle), Math.sin(angle)];
}
