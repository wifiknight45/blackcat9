"""Seed-sweep fuzzer for the Python engine (S6d).

Unit tests pin known seeds; this sweeps THOUSANDS of unseen ones
looking for the seed that breaks an invariant. The sweep population
is itself deterministic: a SplitMix64 stream keyed by --fuzz-seed
draws the per-channel seed lists, so any failure reproduces exactly:

    python3 -m tests.fuzz                 # default sweep
    python3 -m tests.fuzz --seeds 50 --fuzz-seed 7

A failure prints the offending (channel, seed) pair, which then
reproduces standalone through the normal CLI:

    python3 -m kcat recipe --seed <seed> --channel <channel>

Checks per recipe: generation never raises; two generations are
byte-identical JSON; title/tempo/chords/notes sit inside the
channel's own declared ranges. Every --renders-every-th recipe also
renders 4 bars: the buffer must be finite, non-silent, peak <= 1.0,
and exactly the expected length. Session plans are swept too.
"""

import argparse
import sys

import numpy as np

from kcat.radio import plan_session
from kcat.recipes import CHANNELS, generate_recipe
from kcat.render import render_recipe
from kcat.rng import SplitMix64

SWEEP_TAG = 0xF022


def sweep_seeds(fuzz_seed, per_channel):
    rng = SplitMix64((fuzz_seed ^ SWEEP_TAG) & (2**64 - 1))
    return {ch: [int(rng.next_u64() % 1_000_000) for _ in range(per_channel)]
            for ch in sorted(CHANNELS)}


def fail(channel, seed, check, detail):
    print(f"FUZZ FAIL channel={channel} seed={seed} check={check}: {detail}")
    print(f"repro: python3 -m kcat recipe --seed {seed} --channel {channel}")
    sys.exit(1)


def check_recipe(channel, seed):
    cfg = CHANNELS[channel]
    try:
        recipe = generate_recipe(seed, channel)
        again = generate_recipe(seed, channel)
    except Exception as exc:  # the fuzzer's whole job is catching these
        fail(channel, seed, "generate", f"{type(exc).__name__}: {exc}")
    if recipe.to_json() != again.to_json():
        fail(channel, seed, "determinism", "two generations differ")
    if not recipe.title:
        fail(channel, seed, "title", "empty title")
    lo, hi = cfg["tempo"]
    if not (lo <= recipe.tempo_bpm <= hi):
        fail(channel, seed, "tempo", f"{recipe.tempo_bpm} outside [{lo}, {hi}]")
    chords = recipe.progression["chords"]
    if len(chords) < 2:
        fail(channel, seed, "chords", f"only {len(chords)} chords")
    for chord in chords:
        if not (0 <= chord["root_pc"] <= 11):
            fail(channel, seed, "chord-root", f"root_pc {chord['root_pc']}")
        if len(chord["notes"]) < 3:
            fail(channel, seed, "chord-notes", f"chord has {len(chord['notes'])} notes")
        for note in chord["notes"]:
            if not (24 <= note <= 100):
                fail(channel, seed, "chord-notes", f"note {note} out of range")
    return recipe


def check_render(channel, recipe):
    from kcat.dsp import SR
    bars = 4
    try:
        buf = render_recipe(recipe, bars=bars)
    except Exception as exc:
        fail(channel, recipe.seed, "render", f"{type(exc).__name__}: {exc}")
    expected = int(bars * (4 * 60.0 / recipe.tempo_bpm) * SR)
    if abs(len(buf) - expected) > SR:
        fail(channel, recipe.seed, "render-length",
             f"{len(buf)} samples, expected ~{expected}")
    if not np.isfinite(buf).all():
        fail(channel, recipe.seed, "render-finite", "NaN or inf in buffer")
    peak = float(np.max(np.abs(buf)))
    if peak > 1.0:
        fail(channel, recipe.seed, "render-peak", f"peak {peak:.3f} > 1.0")
    if peak < 0.05:
        fail(channel, recipe.seed, "render-silent", f"peak {peak:.4f}")


def main(argv=None):
    ap = argparse.ArgumentParser(description="K-CAT seed-sweep fuzzer")
    ap.add_argument("--seeds", type=int, default=200,
                    help="seeds per channel (default 200)")
    ap.add_argument("--fuzz-seed", type=int, default=1,
                    help="seed of the sweep itself (default 1)")
    ap.add_argument("--renders-every", type=int, default=200,
                    help="render every Nth recipe (default 200; 0 = never)")
    args = ap.parse_args(argv)

    population = sweep_seeds(args.fuzz_seed, args.seeds)
    checked = rendered = 0
    for channel, seeds in population.items():
        for seed in seeds:
            recipe = check_recipe(channel, seed)
            checked += 1
            if args.renders_every and checked % args.renders_every == 0:
                check_render(channel, recipe)
                rendered += 1

    plan_rng = SplitMix64((args.fuzz_seed ^ 0x91A5) & (2**64 - 1))
    for _ in range(50):
        s = int(plan_rng.next_u64() % 1_000_000)
        tracks = plan_session(s, "all", tracks=6)
        if len(tracks) != 6 or tracks[0].seed != 42:
            fail("all", s, "plan",
                 f"session shape wrong: {len(tracks)} tracks, first {tracks[0]}")

    print(f"FUZZ: {checked} recipes + 50 session plans + {rendered} renders, "
          f"all invariants hold (fuzz-seed {args.fuzz_seed})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
