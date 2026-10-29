# blackcat9 — K-CAT 99.9 📻🐈‍⬛

A procedural lofi radio station broadcasting from a rainy Tokyo apartment
in 1974. Every song is **synthesized from scratch** — no samples, no
recordings — from a deterministic seed: the same seed always makes the
same song, on any machine, forever.

Three stations on the TUNING dial:

- **DUST 88.5** — boom-bap & tape (Dilla's swing, heavy crackle)
- **JAZZ CAT 94.7** — modal & melancholy (Nujabes changes, space to breathe)
- **SUNRISE 101.3** — warm & weightless (Tycho pads, clean air)

The console is a 1970s Moog-hearted receiver: a ladder filter at its
core, wood cheeks, VU meters — and a black cat named **Nine** who sleeps
on top where it's warm. The web console (GitHub Pages) is the same
station in your browser: rain on the window, a cigarette in the ashtray,
and a REC deck that captures songs off the radio to WAV/MP3.

## Status

**S0 — recipe & theory core: done.** Recipes (song DNA as JSON),
SplitMix64 deterministic seeds shared across engines, scales/chords/
voicings/progressions. Next: S1, the synth engine's first render.

## Run it

```bash
git clone https://github.com/wifiknight45/blackcat9.git
cd blackcat9

# print a song's recipe (its DNA) as JSON
python3 -m kcat recipe --seed 42 --channel dusty

# save one to a file
python3 -m kcat recipe --seed 7 --channel jazz-cat --out seven.json

# run the tests (pure stdlib, no install needed for S0)
python3 -m unittest discover -s tests -v
```

## Design in one paragraph

One musical brain, two renderers. A **recipe** — seed, channel, tempo,
key, progression, feel knobs — fully describes a song as JSON. The
Python engine renders it with numpy; the web engine (Web Audio) reads
the same recipe and plays the same song. Seeds are the catalog:
share a seed, share the song.

## License

Apache-2.0. All music the engine generates is synthesized by the code —
there are no samples to license.
