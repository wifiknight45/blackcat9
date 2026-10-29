# Changelog — blackcat9 (K-CAT 99.9)

All notable changes made by Muse to this repo are recorded here, newest
first. Times are America/Los_Angeles. This file is updated after every
verified stage of work. Aubrey pushes from bash and reviews after
pushing.

## 2026-10-28

### 23:39 PDT — S3: the radio (verified)

- `kcat/radio.py`: session planner + continuous renderer. Every
  session opens with the signature track, then wanders the dial —
  seeds and stations drawn from the session seed's SplitMix64
  stream, so a session seed replays the same broadcast forever.
- Between tracks: a burst of tuning static (band-swept, tremored)
  and a synthesized station ident — the incoming channel's motif in
  its own lead voice over an EP swell — joined with equal-power
  crossfades. A JSON program guide is written beside the WAV.
- REC: `--tape-dir` writes every track as its own WAV (the tape
  rack). CLI: `python3 -m kcat radio --seed 9 --tracks 3
  --tape-dir tapes`. Demo broadcast (session seed 9): 8.0 min —
  signature DUST, a second DUST track, then MIN'YO's "Bamboo Wind
  over Shirakawa-go" (E yo).
- 49/49 tests pass (42 + 7 radio: planning determinism, signature
  rule, static energy, manifest/duration accounting, byte-identical
  session re-renders).

### 23:33 PDT — Two new stations: MIN'YO + KISSATEN; signature track pinned

- **MIN'YO 76.2** (folk): Japanese scales in `theory.py` — `in`
  (miyako-bushi, the Sakura sound), `yo` (festival folk), `ryukyu`
  (Okinawa) — with pentatonic-safe chord qualities, folk progression
  templates, and a pentatonic-safe random walk. Slow tempos, a sparse
  kit (`drum_density`), long plucked phrases, folk titles ("Hida
  First Snow"). New voice: `voices.pluck_note`, a Karplus-Strong
  plucked string — koto/shamisen physics in miniature.
- **KISSATEN 82.9** (Japanese jazz): dorian/mixolydian/lydian over
  ii-V-I and backdoor changes, 84-104 BPM, dense vibraphone lines.
- Per-channel lead voices wired into the composer: DUST and JAZZ CAT
  keep the vibes, SUNRISE now sings through the Moog lead (with
  legato glide between close notes), MIN'YO plucks, KISSATEN swings.
  Existing stations' RNG streams are untouched (density gates
  short-circuit), so their renders are unchanged.
- **Signature track**: seed 42 on DUST ("Shimokitazawa Umbrellas")
  is pinned as `SIGNATURE_SEED`/`SIGNATURE_CHANNEL` in recipes.py —
  the first sound the app makes, per Aubrey's pick on 2026-10-28.
- README now carries the name in Japanese — ブラックキャット9 —
  and lists all five stations. 42/42 tests pass (34 + 8 new).

### 23:33 PDT — S2: the Moog module (verified)

- `kcat/moog.py`: a 4-pole ladder filter with tanh saturation in the
  feedback path (resonance to the self-oscillation edge, never
  unstable; scalar or per-sample cutoff for filter envelopes),
  additive band-limited oscillators with seeded tuning drift
  (random-walk cents), exponential portamento glide, and three
  patches: `taurus_bass`, `moog_lead`, `moog_pad`.
- `tests/test_s2.py`: 10 tests — stability at resonance 0.95/1.0,
  resonance band-energy character, drift determinism, glide
  direction/landing, patch shape/bounds. Full suite 34/34 at the time.

### 23:22 PDT — S1 full: lead line, pad, arrangement (verified)

- `voices.lead_note`: vibraphone-ish melody voice — inharmonic
  partials (1, 3.98, 9.24) with a tremolo that blooms in after the
  attack. `voices.pad_chord`: detuned stereo pad (L −5 cents,
  R +5), slow swell, lowpassed warmth. `dsp.place_stereo` added.
- The composer now writes a **seeded lead line**: a random walk over
  the mode's scale that snaps to chord tones on strong steps, phrases
  in syncopated 16ths, and rests every fourth bar. Density is a
  per-channel recipe knob (`melody_density`, `pad_level` in CHANNELS:
  sunrise is pad-rich and sparse, dusty stays dry).
- Arrangement: pads join after the intro; bars 12 and 16 of a 16-bar
  render are **breaks** (kit thins to a heartbeat kick, hats only).
- Showcase render: seed 7, JAZZ CAT — "3AM in Sangenjaya", 83 BPM,
  Eb dorian, 16 bars. 24/24 tests pass (19 + 5 new), renders still
  byte-deterministic with the full arrangement.

### 23:19 PDT — Crackle rebuilt as vinyl (Aubrey's listening-gate note)

Gate verdict on the slice: groove, swing, EP and bass approved as-is;
the crackle sounded like static, not a record. `damage.crackle` is
rewritten on how a stylus actually reports vinyl:

- surface bed is pink-tilted noise, decorrelated per channel, with a
  once-per-revolution swell (33⅓ rpm = 1.8 s);
- a dense rain of micro-ticks forms the continuous "frying" texture;
- clicks are transient + resonant ring + a low thock, not noise
  bursts — a noise burst reads as radio static, a ring reads as vinyl;
- a few scratches are fixed on the record's surface and repeat every
  1.8 s with slightly varying force, the signature flaw of a pressing.

Verified: crackle-only at dust 0.94 peaks 0.365 with RMS 0.006 (quiet
bed, distinct events), dust 0 is true silence, 19/19 tests pass, and
seed 42 re-rendered — same song, now on a record.

### 23:16 PDT — S1 slice: the first render (verified, awaiting listening gate)

- `kcat/dsp.py`: FFT warmth/band filters, envelopes, constant-power
  panning, soft clip. `kcat/voices.py`: additive Rhodes-ish EP (tine
  ping + tremolo) and round bass. `kcat/drums.py`: synthesized kick
  (pitch-swept sine), snare (shaped noise + body), hats.
- `kcat/damage.py`: generated vinyl crackle (hiss + seeded pops) and
  varispeed tape wobble (wow + flutter on the finished mix).
- `kcat/render.py`: the composer — chord hits/stabs/top-note peeks,
  walking bass with chromatic approaches, swung + humanized drums
  (MPC-style off-16th delay from the recipe's swing), intro bars,
  dust-scaled warmth mastering. All musical decisions come from
  SplitMix64 streams derived from the recipe seed.
- CLI: `python3 -m kcat render --seed N --channel C --bars B --out F`.
- First track: seed 42, DUST — "Shimokitazawa Umbrellas", 73 BPM,
  C harmonic minor, 16 bars, 52.6 s. Renders are byte-deterministic
  (test-pinned). 19/19 tests pass (14 S0 + 5 new render tests).
- Known slice limits: no lead melody yet, no Moog voices (S2), simple
  intro/full arrangement; MP3 export is via WAV for now.

### 23:14 PDT — S0: recipe & theory core (verified)

- Repo scaffold: pyproject (package `kcat`, console entry point),
  Apache-2.0 LICENSE, .gitignore, this changelog, real README.
- `kcat/rng.py`: SplitMix64 PRNG implemented explicitly (not Python's
  `random`) so the future web engine reproduces the identical stream
  bit-for-bit. First outputs for seed 0 are pinned by a regression test.
- `kcat/theory.py`: note/scale tables (8 scales), 9 chord qualities
  with lofi extensions (min11, maj9, 6/9...), per-mode degree-quality
  map, drop-2 EP voicings, 6 named progression templates plus a
  weighted random-walk progression generator.
- `kcat/recipes.py`: the Recipe dataclass (versioned JSON, round-trips
  exactly) and the three TUNING channels — dusty, jazz-cat, sunrise —
  each with tempo/key/mode/swing/dust/wobble ranges and house
  progressions. Seeded procedural titles ("Rain over Ikebukuro"...).
- `kcat/__main__.py`: `python3 -m kcat recipe --seed N --channel C
  [--out file]` prints/writes a song's DNA as JSON.
- Tests: 14 stdlib unittest cases (RNG determinism + pinned vectors,
  theory correctness, recipe determinism/round-trip/sanity) — all pass;
  CLI exercised for all three channels.
