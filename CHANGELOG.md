# Changelog — blackcat9 (K-CAT 99.9)

All notable changes made by Muse to this repo are recorded here, newest
first. Times are America/Los_Angeles. This file is updated after every
verified stage of work. Aubrey pushes from bash and reviews after
pushing.

## 2026-10-29

### 20:37 PDT — S7b: hardening (likely problems + smaller fixes)

- **Rack XSS hygiene** — `renderRack` builds rows with DOM calls and
  `textContent` throughout; no localStorage-derived value reaches
  `innerHTML` any more.
- **Noise streams split** — the drum kit and the crackle bed both
  derived from `seed ^ 0xF001`; crackle now has its own tag
  (`_TAG_CRACKLE` / `TAG_CRACKLE` = 0xF002) in both engines, drums
  unchanged. Composition is untouched; renders for a seed differ
  from pre-S7b only in their noise components.
- **Bridge timing** — `playStatic`/`playIdent` resolve on the audio
  clock (the source's `onended`) instead of `setTimeout`, with the
  timer kept as a fallback for a suspended context. Smoke-verified
  end to end.
- **Main-thread freezes, pragmatic half** — REC and tape playback
  now yield two frames (`nextPaint`) so their state paints before
  the synchronous render; the console prefetches the next track
  mid-playback (`Session.peekNext` + `prepareTrack` bundle), so the
  track-change boundary no longer pays the synthesis cost. The full
  Worker migration is deferred (see S7 report).
- **Smaller fixes** — stale "three stations" comment corrected to
  five; `web/package-lock.json` generated and included (`npm ci`
  verified from a clean copy); README test badge updated to the real
  count (84+); the "same seed, same song, forever" claim softened —
  recipes are bit-identical across engines, rendered samples can
  vary slightly with numpy/FFT versions.
- **DuckDuckGo honesty note** — the rack now says tapes live in
  browser storage and are emptied when a browser clears site data
  (DDG Fire Button / private windows); WAV download is the durable
  copy. (The audit's §5 finding; persistence itself is by design
  and not code-fixable.)
- **Verified:** Python 84/84, JS unit 15/15 (+ peek test), parity
  39/39, ruff + ESLint clean, browser smoke on air, `npm ci` clean.
  Python fuzz still reports "0 renders" — the render path gets its
  goldens in S7c.

### 20:30 PDT — S7a: the external-review bugs, reproduced then fixed

Baseline on a fresh clone of remote main (96e3b2f): 69 Python tests,
ruff + ESLint clean, recipe parity 39/39 — the review's numbers were
exact. Every confirmed bug was reproduced on the pristine tree
*before* fixing (browser boots with corrupted shelves, node compose
lengths, CLI tracebacks, planner/validator probes).

- **#1 Corrupted tape shelf bricks the console** — `web/js/app.js`
  now validates `kcat.tapes.v1` on load (`sanitizeTapes`): non-array
  payloads, unknown channels, non-string titles, null/partial
  entries are dropped, never thrown on. Covers `addSpine` and
  `renderRack` too (the audit's B5 crash path). Six corruption
  shapes that bricked boot in Chromium now boot clean.
- **#2 Tapes bypass POWER** — tape playback is stored (`tapeSrc`),
  routed through `radioBus` upstream of the `warm` gain (POWER
  governs tapes like the radio), replaced rather than overlapped by
  a second play, stopped by POWER off / retune / radio start, and
  `tapePlaying` resets on every exit path including a failed render.
  Playing a tape with the console off powers it on.
- **#3 Tape buffer leak** — deleting a tape now `tapeBufs.delete(t)`
  (each cached 48-bar render is ~15–20 MB); deleting the playing
  tape stops it first.
- **#4 Web played 16 bars, CLI plays `recipe.bars`** — the web
  player, tape renders and REC now all pass `bars: recipe.bars`
  (seed 42: 52.6 s → 157.8 s, the same piece as the CLI's).
- **#5 CLI tracebacks** — `--bars`/`--tracks` use an argparse
  positive-int type: exit 2 with a readable message, no traceback.
- **#6 Pinned channel opened with the signature** — Python
  `plan_session` now skips the signature when a channel is pinned,
  matching the JS `Session`; goldens on both sides now pin the same
  full pinned sequences (minyo/9, jazz-cat/5).
- **#7 `Recipe.from_json` didn't validate** — full shape validation
  in Python *and* a new JS mirror (`recipeFromJson`): unknown
  mode/channel/key/tune, unknown keys, missing fields and wrong
  types all raise errors naming the field and value. Valid recipes
  round-trip exactly (parity untouched).
- Regression coverage: `tests/test_s7a_regressions.py`,
  `web/test/recipes.test.mjs`, extended radio goldens both sides,
  and `web/test/tapes.mjs` (browser: 9 shelf shapes + power/delete
  behaviour, 16/16 green).
- **Verified:** Python 84/84 (69 + 15 new), JS unit 14/14, parity
  39/39 deep + byte-identical, ruff clean, ESLint clean, JS fuzz
  (bounded) green, tapes browser test green.

### 20:20 PDT — Cross-browser / mobile audit (report, no code changed)

- Full audit of the console on desktop + mobile engines/viewports
  landed at `~/workspace/blackcat9-cross-browser-audit/REPORT.md`
  (21 screenshots; Chromium + Firefox measured, WebKit/DDG by code
  inspection — WebKit could not run on the VM). Headlines: no
  viewport meta (phones render the 1280-px layout at ~0.31×);
  `#controlbox`/`#rack` sit outside `.scene` and never scale, so on
  Aubrey's iPhone 15 (DuckDuckGo iOS) the controls detach ~1,200 px
  from the console; `fit()` clips the scene below 1280 px wide; a
  malformed tape entry crashes boot (fixed in S7a above).
- DuckDuckGo's Fire Button wipes localStorage tapes *by design* —
  the workaround is fireproofing the site; §6 of the report is an
  on-device retest checklist.
- The audit's Stage 1 (viewport + fit geometry + pointer fixes)
  folds into S7c; its Stage 2 responsive redesign (hybrid layout
  recommended) is **Aubrey's design decision — deferred**, not
  implemented in S7.

### 00:47 PDT — S4b: the web audio renderer (the browser sings)

- `web/js/compose.js`: recipe → event lists, a statement-for-statement
  port of `render.py`'s composition (swing, humanize, intro/break
  bars, densities, the seeded melody walk, verbatim traditional
  tunes). Composition is a pure function of the recipe —
  `web/test/compose.test.mjs` proves compose-twice determinism.
- `web/js/voices.js` / `drums.js` / `crackle.js` / `dsp.js`:
  sample-level Web Audio twins of the Python voices with Python's
  parameter values — additive EP, vibes, Karplus-Strong pluck, a
  sample-by-sample reproduction of the Moog ladder for the lead,
  synthesized kit, and the rebuilt vinyl crackle scaled by `dust`.
- `web/js/player.js`: lookahead scheduler + `renderOffline()` (the
  faithful master: warmth, wobble, peak-normalize 0.89, fades).
  `web/listen.html` is the utilitarian test bench, not the console.
- **Verified in headless Chromium**: seed 42 / dusty renders
  52.603 s, RMS 0.238, peak 0.890 — real sound, no clipping, event
  counts matching the Python arrangement (359 events).
- Honest limits, also in the code: texture noise draws differ
  (SplitMix64 vs numpy PCG64), zero-phase FFT filters are
  approximated, panning law is equal-power. Identical recipes,
  identical events, near-identical voices — a twin, not a clone.

### 00:40 PDT — S4a: the web engine twin (recipe parity proven)

- `web/js/` (`rng.js`, `theory.js`, `recipes.js`, `traditional.js`):
  a dependency-free JavaScript mirror of the Python recipe brain —
  SplitMix64 via BigInt, same draw order, same channels, same
  traditional-tune integration, same signature constants.
- `scripts/gen_goldens.py` generates `web/test/goldens.json` from the
  Python engine (5 channels × 7 seeds, plus forced-tune recipes);
  `web/test/parity.mjs` compares the JS output against those goldens.
- **Result: 39/39 recipes deep-identical and byte-identical JSON.**
  A seed means the same song in the browser as in Python.
- `web/index.html`: plain proof page (seed + channel → recipe); the
  real console is S5's job. Python suite untouched: 63/63 still green.

## 2026-10-28

### 00:00 PDT — Traditional tunes on MIN'YO (verified note-by-note)

- `kcat/traditional.py`: real public-domain melodies, encoded as
  (semitone offset from tonic, beats) so they transpose to any key.
  Every note was verified against a published score — no tune was
  encoded from memory.
  - **Sakura Sakura** (さくら さくら): the complete 14-bar verse in
    the `in` scale, transcribed note-by-note from a published score
    (G. Tay) with ambiguous held notes resolved by notehead
    measurement; form cross-checks against the documented ABBAC
    structure. A provenance test pins the opening phrase.
  - **Furusato** (ふるさと, 1914): first section (8 bars, both
    phrases, ending on the tonic), from two concordant published
    scores. Later bars diverge between arrangements, so they were
    left out rather than guessed.
  - **Kojo no Tsuki**: deliberately NOT shipped — no freely readable
    note-level source could be secured and the historical versions
    differ. It joins the station when a verifiable score does.
- Recipes: minyo tracks roll a 50% chance of carrying a tune (a set
  tune overrides the mode to its native scale and takes the title);
  `Recipe.tune` is a new optional field, old JSON still loads.
  Force one any time: `python3 -m kcat render --tune sakura`.
- This patch also carries the README badges + console placeholder
  from the previous entry (bundled per Aubrey's request).
- 63/63 tests pass (49 + 14 new: scale-membership, provenance pins,
  round-trips, tuned renders).

### 23:55 PDT — README badges + console placeholder

- Eight `for-the-badge` shields under the title (all verified live):
  Python, NumPy, Stations 5, Scales 11, a 民謡 MIN'YO 76.2 badge in
  Japan red, Tests 49+ passing, deterministic Seeds, Apache-2.0.
- New README section "The console — design in progress": notes that
  console screenshots/design will be added as the Moog console firms
  up (per Aubrey's request).

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
