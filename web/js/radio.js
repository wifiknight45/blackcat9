// radio.js — the live session brain: a JS port of kcat/radio.py's
// plan_session (same SplitMix64 stream, same signature-first rule),
// plus the WebAudio static burst and station ident that bridge tracks
// on air. (Python renders its bridges offline; on the web they are
// synthesized live — same feel, not sample-identical.)
import { SplitMix64 } from "./rng.js";
import { CHANNELS, generate_recipe, SIGNATURE_SEED, SIGNATURE_CHANNEL } from "./recipes.js";

const TAG_SESSION = 0x9a17;

export class Session {
  constructor(sessionSeed, mode = "all") {
    this.sessionSeed = sessionSeed;
    this.mode = mode; // "all" or a channel slug
    this.rng = new SplitMix64(sessionSeed ^ TAG_SESSION);
    this.lastKey = null;
    this.started = false;
  }
  next() {
    if (!this.started) {
      this.started = true;
      if (this.mode === "all") {
        const r = generate_recipe(SIGNATURE_SEED, SIGNATURE_CHANNEL);
        this.lastKey = r.channel + ":" + r.seed;
        return r;
      }
    }
    const stations = Object.keys(CHANNELS).sort();
    for (;;) {
      const ch = this.mode === "all" ? this.rng.choice(stations) : this.mode;
      const seed = Number(this.rng.next_u64() % 1000000n);
      const key = ch + ":" + seed;
      if (key === this.lastKey) continue;
      this.lastKey = key;
      return generate_recipe(seed, ch);
    }
  }
}

// A burst of band-swept tape static. Resolves when it ends.
export function playStatic(ctx, dest, dur = 0.9, level = 0.4) {
  return new Promise((resolve) => {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.floor(sr * dur));
    const buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = Math.min(1, i / (sr * 0.03)) * Math.min(1, (n - i) / (sr * 0.12));
        const white = Math.random() * 2 - 1;
        lp += 0.16 * (white - lp);
        d[i] = (white * 0.32 + lp * 0.95) * env;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 0.7;
    const t0 = ctx.currentTime;
    bp.frequency.setValueAtTime(480, t0);
    bp.frequency.exponentialRampToValueAtTime(2600, t0 + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start();
    setTimeout(resolve, dur * 1000);
  });
}

// The station ident: three ascending chord tones from the incoming
// track (its own first chord, top notes +12) over a soft swell —
// the live twin of radio.py's ident_for.
export function playIdent(ctx, dest, recipe, dur = 1.6) {
  return new Promise((resolve) => {
    const t0 = ctx.currentTime + 0.02;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1900;
    const g = ctx.createGain(); g.gain.value = 0.9;
    lp.connect(g); g.connect(dest);
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const chord = recipe.progression.chords[0];
    const swellNotes = chord.notes;
    for (const m of swellNotes) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mf(m);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(0.045, t0 + 0.3);
      og.gain.setValueAtTime(0.045, t0 + dur - 0.4);
      og.gain.linearRampToValueAtTime(0, t0 + dur);
      o.connect(og); og.connect(lp); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    const motif = [...chord.notes].sort((a, b) => a - b).slice(-3).map((m) => m + 12);
    motif.forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = mf(m);
      const og = ctx.createGain();
      const s = t0 + 0.12 + i * 0.21;
      og.gain.setValueAtTime(0, s);
      og.gain.linearRampToValueAtTime(0.11, s + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0008, s + 0.55);
      o.connect(og); og.connect(lp); o.start(s); o.stop(s + 0.6);
    });
    setTimeout(resolve, dur * 1000);
  });
}
