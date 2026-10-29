# Changelog — blackcat9 (K-CAT 99.9)

All notable changes made by Muse to this repo are recorded here, newest
first. Times are America/Los_Angeles. This file is updated after every
verified stage of work. Aubrey pushes from bash and reviews after
pushing.

## 2026-10-28

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
