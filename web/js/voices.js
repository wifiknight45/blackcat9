// Synthesized instruments — the web twin of kcat/voices.py, plus the
// Moog-ish lead from kcat/moog.py.
//
// Each voice is a pure sample-rendering function: (sampleRate, ...)
// -> Float32Array mono (pad -> [L, R]). player.js wraps the samples
// in AudioBuffers. Rendering sample-by-sample, rather than with
// oscillator nodes, keeps the Python formulas intact — partial
// stacks, envelope shapes and parameter values below are copied from
// the .py sources, not re-invented.
//
// Where the browser forces a divergence, it is the documented kind:
//  - Python's FFT zero-phase filters (pad warmth) become forward+
//    backward one-pole passes (dsp.js) — same zero phase, gentler
//    slope.
//  - numpy noise (the Karplus-Strong burst, Moog drift walks) comes
//    from dsp.js NoiseGen — same distributions and algorithm, different
//    values. Texture, not composition.
//  - Python's Moog ladder is a true 4-pole feedback ladder; at render
//    time here the ladder itself is reproduced sample-for-sample as
//    an algorithm (it is cheap arithmetic, see moogLadder), while
//    player.js's *live* monitoring path may substitute biquads — the
//    offline renderer in player.js uses these buffers, so exported
//    audio hears the ladder, not the substitute.

import {
  NoiseGen, adsrEnv, expEnv, lowpassZP, midiFreq, peakOf,
} from "./dsp.js";
import { SplitMix64 } from "./rng.js";

// ---------------------------------------------------------------- EP

// (harmonic ratio, gain, decay tau as a fraction of note length)
const EP_PARTIALS = [
  [1.0, 1.00, 0.55],
  [2.0, 0.45, 0.32],
  [3.0, 0.22, 0.20],
  [4.0, 0.10, 0.12],
];

export function epNoteSamples(sr, midi, durS, velocity = 1.0) {
  const freq = midiFreq(midi);
  const n = Math.max(1, Math.trunc(durS * sr));
  const out = new Float32Array(n);
  for (const [ratio, gain, tauFrac] of EP_PARTIALS) {
    const tau = Math.max(0.05, durS * tauFrac * (0.8 + 0.4 * velocity));
    const env = expEnv(n, tau, 0.004, sr);
    const w = 2.0 * Math.PI * freq * ratio / sr;
    for (let i = 0; i < n; i++) out[i] += gain * Math.sin(w * i) * env[i];
  }
  // The tine: a brief inharmonic ping at the attack (0.045 s).
  const tineN = Math.min(n, Math.trunc(0.045 * sr));
  if (tineN > 8) {
    const w = 2.0 * Math.PI * freq * 13.7 / sr;
    for (let i = 0; i < tineN; i++) {
      const t = i / sr;
      out[i] += 0.14 * Math.sin(w * i) * Math.exp(-t / 0.012);
    }
  }
  for (let i = 0; i < n; i++) out[i] *= velocity;
  return out;
}

export function epChordSamples(sr, midis, durS, velocity = 1.0,
                               tremoloHz = 4.6, tremoloDepth = 0.12) {
  const n = Math.max(1, Math.trunc(durS * sr));
  const out = new Float32Array(n);
  const per = velocity / Math.max(1, Math.sqrt(midis.length));
  for (const m of midis) {
    const note = epNoteSamples(sr, m, durS, per);
    for (let i = 0; i < note.length; i++) out[i] += note[i];
  }
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] *= 1.0 - tremoloDepth *
      (0.5 + 0.5 * Math.sin(2.0 * Math.PI * tremoloHz * t));
  }
  return out;
}

// ---------------------------------------------------------------- bass

export function bassNoteSamples(sr, midi, durS, velocity = 1.0) {
  const freq = midiFreq(midi);
  const n = Math.max(1, Math.trunc(durS * sr));
  const env = adsrEnv(n, 0.006, durS * 0.45, 0.55, sr);
  const out = new Float32Array(n);
  const w = 2.0 * Math.PI * freq / sr;
  for (let i = 0; i < n; i++) {
    out[i] = (Math.sin(w * i) + 0.35 * Math.sin(2 * w * i) +
              0.10 * Math.sin(3 * w * i)) * env[i];
  }
  // Gentle release so note ends don't click (last 0.03 s).
  const rel = Math.min(n, Math.trunc(0.03 * sr));
  if (rel > 1) {
    for (let i = 0; i < rel; i++) out[n - rel + i] *= 1.0 - i / rel;
  }
  for (let i = 0; i < n; i++) out[i] *= velocity;
  return out;
}

// ---------------------------------------------------------------- lead (vibes)

// Inharmonic partials — what makes a vibraphone a vibraphone.
const LEAD_PARTIALS = [
  [1.0, 1.00, 0.60],
  [3.98, 0.30, 0.28],
  [9.24, 0.07, 0.10],
];

export function leadNoteSamples(sr, midi, durS, velocity = 1.0) {
  const freq = midiFreq(midi);
  const n = Math.max(1, Math.trunc(durS * sr));
  const out = new Float32Array(n);
  for (const [ratio, gain, tauFrac] of LEAD_PARTIALS) {
    const env = expEnv(n, Math.max(0.06, durS * tauFrac), 0.006, sr);
    const w = 2.0 * Math.PI * freq * ratio / sr;
    for (let i = 0; i < n; i++) out[i] += gain * Math.sin(w * i) * env[i];
  }
  // Tremolo that blooms in after the attack (ramp tau 0.12 s, 5.2 Hz).
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ramp = 1.0 - Math.exp(-t / 0.12);
    out[i] *= 1.0 - 0.10 * ramp *
      (0.5 + 0.5 * Math.sin(2.0 * Math.PI * 5.2 * t));
  }
  const peak = peakOf(out);
  if (peak > 1.0) for (let i = 0; i < n; i++) out[i] /= peak;
  for (let i = 0; i < n; i++) out[i] *= velocity * 0.9;
  return out;
}

// ---------------------------------------------------------------- pad

const PAD_PARTIALS = [[1.0, 1.0], [2.0, 0.38], [3.0, 0.16], [4.0, 0.05]];

// Returns [L, R]: each note is two detuned additive stacks (left a
// few cents flat, right a few sharp), slow swell, gentle release.
// Python finishes each channel with a 3000 Hz FFT lowpass; here a
// zero-phase one-pole pair stands in (see module header).
export function padChordSamples(sr, midis, durS, velocity = 1.0) {
  const n = Math.max(1, Math.trunc(durS * sr));
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    env[i] = (1.0 - Math.exp(-t / 0.45)) * (0.55 + 0.45 * Math.exp(-t / 1.2));
  }
  const tail = Math.min(n, Math.trunc(0.25 * sr));
  if (tail > 1) {
    for (let i = 0; i < tail; i++) env[n - tail + i] *= 1.0 - i / tail;
  }
  const scale = velocity * 0.5 / Math.max(1, Math.sqrt(midis.length));
  const channels = [];
  for (const cents of [-5.0, 5.0]) {
    const detune = 2.0 ** (cents / 1200.0);
    const stack = new Float32Array(n);
    for (const m of midis) {
      const freq = midiFreq(m) * detune;
      for (const [ratio, gain] of PAD_PARTIALS) {
        const w = 2.0 * Math.PI * freq * ratio / sr;
        for (let i = 0; i < n; i++) stack[i] += gain * Math.sin(w * i);
      }
    }
    for (let i = 0; i < n; i++) stack[i] *= env[i] * scale;
    channels.push(lowpassZP(stack, 3000.0, sr));
  }
  return channels;
}

// ---------------------------------------------------------------- pluck (Karplus-Strong)

// Mirrors voices.pluck_note block-for-block: a noise burst
// recirculating through a one-period delay line, damping 0.996,
// processed one period at a time. The burst values come from
// NoiseGen(seed) instead of numpy (see module header).
export function pluckSamples(sr, midi, durS, velocity = 1.0, seed = 0n) {
  const freq = midiFreq(midi);
  const n = Math.max(1, Math.trunc(durS * sr));
  const period = Math.max(2, Math.round(sr / freq));
  const rng = new NoiseGen(seed);
  let cur = rng.fill(period);
  const peak = peakOf(cur) || 1.0;
  for (let i = 0; i < period; i++) cur[i] /= peak;
  const out = new Float32Array(n);
  const damping = 0.996;
  let prevLast = 0.0;
  let pos = 0;
  while (pos < n) {
    const take = Math.min(period, n - pos);
    for (let i = 0; i < take; i++) out[pos + i] = cur[i];
    const shifted = new Float32Array(period);
    shifted[0] = prevLast;
    for (let i = 1; i < period; i++) shifted[i] = cur[i - 1];
    prevLast = cur[period - 1];
    for (let i = 0; i < period; i++) {
      cur[i] = damping * 0.5 * (cur[i] + shifted[i]);
    }
    pos += take;
  }
  const tail = Math.min(n, Math.trunc(0.04 * sr));
  if (tail > 1) {
    for (let i = 0; i < tail; i++) out[n - tail + i] *= 1.0 - i / tail;
  }
  for (let i = 0; i < n; i++) out[i] *= velocity * 0.85;
  return out;
}

// ---------------------------------------------------------------- moog lead

const TAG_LEAD = 0x1EADn;
const MASK64 = (1n << 64n) - 1n;

// The ladder from kcat/moog.py, run as-is: four one-pole stages in a
// feedback loop, tanh where the feedback re-enters, k = 4 * res.
// cutoffHz may be a scalar or a per-sample array.
export function moogLadder(samples, cutoffHz, resonance, sr) {
  const n = samples.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const res = Math.min(1.0, Math.max(0.0, resonance));
  const k = 4.0 * res;
  const perSample = Array.isArray(cutoffHz) || ArrayBuffer.isView(cutoffHz);
  let gScalar = 0.0;
  if (!perSample) {
    const fc = Math.min(0.45 * sr, Math.max(10.0, cutoffHz));
    gScalar = 1.0 - Math.exp(-2.0 * Math.PI * fc / sr);
  }
  let s1 = 0.0, s2 = 0.0, s3 = 0.0, s4 = 0.0;
  for (let i = 0; i < n; i++) {
    let g = gScalar;
    if (perSample) {
      const fc = Math.min(0.45 * sr, Math.max(10.0, cutoffHz[i]));
      g = 1.0 - Math.exp(-2.0 * Math.PI * fc / sr);
    }
    const v = Math.tanh(samples[i] - k * s4);
    s1 += g * (v - s1);
    s2 += g * (s1 - s2);
    s3 += g * (s2 - s3);
    s4 += g * (s3 - s4);
    out[i] = s4;
  }
  return out;
}

// moog.py's _drift_cents: a smoothed random walk in cents, peak-
// normalized to `amount`, plus a small static detune. numpy's
// convolve(mode="same") zero-pads the edges; the same is done here.
function driftCents(n, gen, amount, sr) {
  const step = Math.max(1, Math.floor(sr / 100));  // ~10 ms control points
  const m = Math.ceil(n / step) + 1;
  const walk = new Float64Array(m);
  let acc = 0.0;
  for (let i = 0; i < m; i++) {
    acc += gen.next();
    walk[i] = acc;
  }
  if (m >= 5) {
    const sm = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let s = 0.0;
      for (let j = -2; j <= 2; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < m) s += walk[idx];
      }
      sm[i] = s / 5.0;
    }
    walk.set(sm);
  }
  let peak = 0.0;
  for (let i = 0; i < m; i++) peak = Math.max(peak, Math.abs(walk[i]));
  peak = peak || 1.0;
  for (let i = 0; i < m; i++) walk[i] *= amount / peak;
  // np.interp: linear between control points, clamped at the ends.
  const cents = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / step;
    const lo = Math.floor(x);
    if (lo >= m - 1) cents[i] = walk[m - 1];
    else cents[i] = walk[lo] + (walk[lo + 1] - walk[lo]) * (x - lo);
  }
  const statik = gen.uniform(-0.4 * amount, 0.4 * amount);
  for (let i = 0; i < n; i++) cents[i] += statik;
  return cents;
}

// moog.py's analog_osc (saw path): additive band-limited sawtooth
// from a single phase trajectory shaped by a freq array, drift and
// detune. Harmonic cap keeps partials below ~0.42 * sr.
function analogSaw(sr, freqArr, gen, driftAmount, detuneCents) {
  const n = freqArr.length;
  const cents = new Float64Array(n).fill(detuneCents);
  if (gen !== null && driftAmount > 0.0) {
    const drift = driftCents(n, gen, driftAmount, sr);
    for (let i = 0; i < n; i++) cents[i] += drift[i];
  }
  const phase = new Float64Array(n);
  let acc = 0.0;
  let fmax = 1.0;
  for (let i = 0; i < n; i++) {
    const f = freqArr[i] * (2.0 ** (cents[i] / 1200.0));
    if (f > fmax) fmax = f;
    acc += f;
    phase[i] = 2.0 * Math.PI * acc / sr;
  }
  const kmax = Math.trunc(Math.min(48, Math.max(1, 0.42 * sr / Math.max(fmax, 1.0))));
  const out = new Float32Array(n);
  for (let kk = 1; kk <= kmax; kk++) {
    const g = 0.55 / kk;
    for (let i = 0; i < n; i++) out[i] += g * Math.sin(kk * phase[i]);
  }
  return out;
}

function endFade(x, fadeS, sr) {
  const n = x.length;
  const fade = Math.min(n, Math.trunc(fadeS * sr));
  if (fade > 1) {
    for (let i = 0; i < fade; i++) x[n - fade + i] *= 1.0 - i / fade;
  }
  return x;
}

function tame(x, ceiling) {
  const peak = peakOf(x);
  if (peak > ceiling) {
    const s = ceiling / peak;
    for (let i = 0; i < x.length; i++) x[i] *= s;
  }
  return x;
}

// The singing lead (moog.moog_lead): two saws a few cents apart
// through the ladder, vibrato blooming in, exponential glide when
// glideFrom (a midi note) is given. glideS mirrors moog's glide_s.
export function moogLeadSamples(sr, midi, durS, velocity = 1.0,
                                seed = 0n, glideFrom = null, glideS = 0.13) {
  const n = Math.trunc(Math.round(durS * sr));
  if (n <= 0) return new Float32Array(0);
  // moog._seeded_rng(seed, TAG): the stream seed is the first u64 of
  // SplitMix64(seed ^ tag); the gaussian values then come from
  // NoiseGen rather than numpy (see module header).
  const streamSeed = new SplitMix64((BigInt(seed) ^ TAG_LEAD) & MASK64).next_u64();
  const gen = new NoiseGen(streamSeed);

  const freq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let m;
    if (glideFrom === null || glideFrom === undefined) m = midi;
    else m = midi + (glideFrom - midi) * Math.exp(-t / Math.max(glideS, 1e-3));
    const vib = 6.0 * (1.0 - Math.exp(-t / 0.30)) *
      Math.sin(2.0 * Math.PI * 5.4 * t);
    freq[i] = midiFreq(m + vib / 100.0);
  }
  const oscA = analogSaw(sr, freq, gen, 4.0, -6.0);
  const oscB = analogSaw(sr, freq, gen, 4.0, 6.0);
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = 0.5 * (oscA[i] + oscB[i]);

  const cutoff = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cutoff[i] = 2600.0 + 1400.0 * Math.exp(-(i / sr) / 0.25);
  }
  let y = moogLadder(mix, cutoff, 0.50, sr);
  const env = adsrEnv(n, 0.03, 0.40, 0.85, sr);
  for (let i = 0; i < n; i++) y[i] *= env[i];
  y = endFade(y, 0.04, sr);
  y = tame(y, 0.92);
  for (let i = 0; i < n; i++) y[i] *= velocity;
  return y;
}
