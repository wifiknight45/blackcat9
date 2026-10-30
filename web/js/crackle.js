// Vinyl crackle — the web twin of kcat/damage.py's crackle().
//
// Modelled on a real record, exactly as the Python is:
//   - a surface bed of pink-tilted noise, decorrelated between the
//     channels, breathing once per revolution (33 1/3 rpm = 1.8 s);
//   - a dense rain of micro-ticks (the "frying" texture);
//   - clicks built as transient + resonant ring + thock;
//   - scratches fixed on the record's surface, returning every
//     revolution with slightly varying force.
// Density and level scale with the recipe's dust (0..1), and the
// draw order below mirrors Python's stream consumption statement
// for statement — positions, counts and amplitudes would match
// Python's if the underlying generator did.
//
// It does not: Python draws from numpy PCG64, this from dsp.js
// NoiseGen (SplitMix64 + Box-Muller). Same distributions, same
// structure, different values — texture, not composition. Two more
// honest substitutions: the bed's spectral tilt is done with a
// Kellett pink filter where Python reshapes an FFT, and the bed's
// 4200 Hz FFT lowpass becomes a zero-phase one-pole pair.

import { NoiseGen, lowpassZP, panGains, peakOf } from "./dsp.js";

export const REV_S = 1.8;  // one revolution at 33 1/3 rpm

// Paul Kellett's pink-noise approximation (three one-pole sections
// with the standard coefficients) — the time-domain stand-in for
// Python's 1/sqrt(f) spectral tilt.
function pinkNoise(gen, n) {
  const out = new Float32Array(n);
  let b0 = 0.0, b1 = 0.0, b2 = 0.0;
  for (let i = 0; i < n; i++) {
    const w = gen.next();
    b0 = 0.99765 * b0 + 0.0990460 * w;
    b1 = 0.96300 * b1 + 0.2965164 * w;
    b2 = 0.57000 * b2 + 1.0526913 * w;
    out[i] = (b0 + b1 + b2 + 0.1848 * w) * 0.05;
  }
  return out;
}

// damage._click: transient + resonant ring + thock, peak-normalized
// to amp. Consumes `n` gaussians from the stream, as Python does.
function clickSamples(gen, sr, amp, ringHz, ringTauMs, durMs) {
  const n = Math.max(8, Math.trunc(durMs * sr / 1000.0));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const transient = gen.next() * Math.exp(-t / 0.00035);
    const ring = Math.sin(2.0 * Math.PI * ringHz * t) *
      Math.exp(-t / (ringTauMs / 1000.0));
    const thock = Math.sin(2.0 * Math.PI * 210.0 * t) *
      Math.exp(-t / 0.0008);
    out[i] = 0.65 * transient + 0.55 * ring + 0.30 * thock;
  }
  const peak = peakOf(out) || 1.0;
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * amp;
  return out;
}

function placeEvent(outL, outR, sig, pos, pan) {
  const n = outL.length;
  if (pos < 0 || pos >= n) return;
  const end = Math.min(n, pos + sig.length);
  if (end <= pos) return;
  const [gl, gr] = panGains(pan);
  for (let i = pos; i < end; i++) {
    outL[i] += sig[i - pos] * gl;
    outR[i] += sig[i - pos] * gr;
  }
}

// generateCrackleSamples(sr, durationS, dust, seed) -> [L, R]
// seed is the combined stream seed (recipe seed ^ TAG_CRACKLE
// since S7b; it shared the drum kit's TAG_NOISE stream before),
// the same value render.py passes to damage.crackle.
export function generateCrackleSamples(sr, durationS, dust, seed) {
  const n = Math.trunc(durationS * sr);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  if (dust <= 0.0 || n === 0) return [outL, outR];
  const gen = new NoiseGen(seed);

  // --- surface bed: pink-tilted, decorrelated per channel, with a
  // once-per-revolution swell. Python peak-normalizes the bed to 1
  // before scaling; so does this.
  const outs = [outL, outR];
  for (let ch = 0; ch < 2; ch++) {
    let bed = pinkNoise(gen, n);
    bed = lowpassZP(bed, 4200.0, sr);
    const peak = peakOf(bed) || 1.0;
    const level = 0.011 * dust / peak;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const swell = 0.85 + 0.15 * Math.sin(2.0 * Math.PI * t / REV_S + ch * 1.7);
      outs[ch][i] += bed[i] * swell * level;
    }
  }

  // --- micro-ticks: the continuous frying texture.
  const ticks = Math.trunc(dust * 70 * durationS);
  for (let k = 0; k < ticks; k++) {
    const pos = gen.integers(0, n);
    const length = gen.integers(10, 55);
    const amp = gen.uniform(0.008, 0.085) * (0.25 + 0.75 * dust);
    const sig = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      sig[i] = gen.next() * Math.exp(-i / (length / 3.0));
    }
    const peak = peakOf(sig) || 1.0;
    for (let i = 0; i < length; i++) sig[i] = (sig[i] / peak) * amp;
    placeEvent(outL, outR, sig, pos, gen.uniform(-0.85, 0.85));
  }

  // --- clicks: fewer, larger, each with its own ring pitch.
  const clicks = Math.trunc(dust * 5 * durationS);
  for (let k = 0; k < clicks; k++) {
    const pos = gen.integers(0, n);
    const amp = gen.uniform(0.10, 0.42) * (0.3 + 0.7 * dust);
    const sig = clickSamples(gen, sr, amp,
      gen.uniform(1600.0, 4200.0),
      gen.uniform(0.7, 1.6),
      gen.uniform(2.5, 6.0));
    placeEvent(outL, outR, sig, pos, gen.uniform(-0.85, 0.85));
  }

  // --- scratches: flaws fixed on the surface, returning every
  // revolution with slightly varying force.
  const nScratches = 1 + Math.trunc(gen.random() * (1.0 + dust * 2.0));
  const revs = Math.trunc(durationS / REV_S) + 1;
  for (let s = 0; s < nScratches; s++) {
    const phase = gen.uniform(0.1, REV_S - 0.1);
    const baseAmp = gen.uniform(0.16, 0.34) * (0.3 + 0.7 * dust);
    const ringHz = gen.uniform(900.0, 1700.0);
    const pan = gen.uniform(-0.7, 0.7);
    for (let rev = 0; rev < revs; rev++) {
      const pos = Math.trunc((phase + rev * REV_S) * sr);
      if (pos >= n) break;
      const amp = baseAmp * gen.uniform(0.85, 1.15);
      const sig = clickSamples(gen, sr, amp, ringHz,
        gen.uniform(1.2, 2.2),
        gen.uniform(3.5, 7.0));
      placeEvent(outL, outR, sig, pos, pan);
    }
  }
  return [outL, outR];
}

// Buffer convenience wrapper for player.js.
export function generateCrackleBuffer(ctx, durationS, dust, seed) {
  const [l, r] = generateCrackleSamples(ctx.sampleRate, durationS, dust, seed);
  const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
  buf.getChannelData(0).set(l);
  buf.getChannelData(1).set(r);
  return buf;
}
