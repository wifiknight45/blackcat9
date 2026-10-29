# blackcat9 — K-CAT 99.9 📻🐈‍⬛

### ブラックキャット9 — 雨の東京のアパートから放送中
*"Broadcasting from a rainy Tokyo apartment."*

![Python](https://img.shields.io/badge/Python-3-3776AB?style=for-the-badge&logo=python&logoColor=white) ![NumPy](https://img.shields.io/badge/NumPy-audio_engine-013243?style=for-the-badge&logo=numpy&logoColor=white) ![Stations](https://img.shields.io/badge/Stations-5-E4405F?style=for-the-badge) ![Scales](https://img.shields.io/badge/Scales-11-FC4C02?style=for-the-badge) ![Minyo](https://img.shields.io/badge/%E6%B0%91%E8%AC%A1-MINYO_76.2-BC002D?style=for-the-badge) ![Tests](https://img.shields.io/badge/Tests-49%2B_passing-2EA043?style=for-the-badge) ![Seeds](https://img.shields.io/badge/Seeds-deterministic-7C4DFF?style=for-the-badge) ![License](https://img.shields.io/badge/License-Apache_2.0-D22128?style=for-the-badge&logo=apache&logoColor=white)


A procedural lofi radio station broadcasting from a rainy Tokyo apartment
in 1974. Every song is **synthesized from scratch** — no samples, no
recordings — from a deterministic seed: the same seed always makes the
same song, on any machine, forever.

Five stations on the TUNING dial:

- **DUST 88.5** — boom-bap & tape (Dilla's swing, heavy crackle)
- **JAZZ CAT 94.7** — modal & melancholy (Nujabes changes, space to breathe)
- **SUNRISE 101.3** — warm & weightless (Tycho pads, clean air)
- **MIN'YŌ 76.2** — 民謡 folk songs: miyako-bushi melodies plucked
  koto-style, field rain, festival drums far away
- **KISSATEN 82.9** — 喫茶店 jazz: a smoky Tokyo jazz café at midnight,
  all swing and brushed gold

Turn it on and the first thing you hear is the signature track —
seed 42 on DUST, *"Shimokitazawa Umbrellas"* — chosen by ear, pinned
in the code (`SIGNATURE_SEED` in `kcat/recipes.py`).

The console is a 1970s Moog-hearted receiver: a ladder filter at its
core, wood cheeks, VU meters — and a black cat named **Nine** who sleeps
on top where it's warm. The web console (GitHub Pages) is the same
station in your browser: rain on the window, a cigarette in the ashtray,
and a REC deck that captures songs off the radio to WAV/MP3.

## Status

**Engine complete through S2.** Recipes (song DNA as JSON) and theory
core; a full synth engine — EP, bass, synthesized drums, vibraphone and
Moog-ladder leads, pads, Karplus-Strong plucked strings, vinyl crackle
and tape wobble — rendering deterministic songs on five stations.
Next: the infinite radio (S3), then the web console.

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

# hear the station: one continuous broadcast as a single WAV,
# with a JSON program guide beside it. The same session seed
# replays the same broadcast, forever. --tape-dir is the REC deck:
# every track also lands there as its own WAV.
python3 -m kcat radio --seed 9 --tracks 3 --tape-dir tapes
```

## Design in one paragraph

One musical brain, two renderers. A **recipe** — seed, channel, tempo,
key, progression, feel knobs — fully describes a song as JSON. The
Python engine renders it with numpy; the web engine (Web Audio) reads
the same recipe and plays the same song. Seeds are the catalog:
share a seed, share the song.

## The console — design in progress

The Moog-hearted web console — wood cheeks, chrome knobs, VU meters,
Nine the cat asleep on the warm receiver, rain over Tokyo outside the
window — is being designed now. Screenshots will land here as the
design firms up; this section is the placeholder they'll replace.

## License

Apache-2.0. All music the engine generates is synthesized by the code —
there are no samples to license.
