"""K-CAT command line.

Usage (from the repo root):
    python3 -m kcat recipe --seed 42 --channel dusty
    python3 -m kcat recipe --seed 7 --channel jazz-cat --out seven.json
"""

import argparse
import sys
import time

from .recipes import CHANNELS, generate_recipe
from .traditional import TUNES


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="kcat", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_recipe = sub.add_parser("recipe", help="generate a song recipe as JSON")
    p_recipe.add_argument("--seed", type=int, default=None,
                          help="seed for the song's DNA (default: from the clock)")
    p_recipe.add_argument("--channel", choices=sorted(CHANNELS),
                          default="jazz-cat")
    p_recipe.add_argument("--out", default=None,
                          help="write JSON to this file instead of stdout")

    p_render = sub.add_parser("render", help="render a recipe to a WAV file")
    p_render.add_argument("--seed", type=int, required=True)
    p_render.add_argument("--channel", choices=sorted(CHANNELS),
                          default="jazz-cat")
    p_render.add_argument("--bars", type=int, default=16)
    p_render.add_argument("--tune", choices=sorted(TUNES), default=None,
                          help="play this traditional tune (encoded in "
                               "kcat/traditional.py) instead of a generated "
                               "melody; forces --channel minyo")
    p_render.add_argument("--out", default=None,
                          help="output WAV path (default: renders/seed-<seed>-<channel>.wav)")

    p_radio = sub.add_parser("radio", help="render a K-CAT radio session to one WAV")
    p_radio.add_argument("--seed", type=int, default=1974,
                         help="session seed: the same seed replays the same broadcast")
    p_radio.add_argument("--channel", default="all",
                         help="a station name, or 'all' to wander the dial")
    p_radio.add_argument("--tracks", type=int, default=6)
    p_radio.add_argument("--no-signature", action="store_true",
                         help="don't open with the signature track")
    p_radio.add_argument("--tape-dir", default=None,
                         help="also write each track as its own WAV here (REC tapes)")
    p_radio.add_argument("--out", default=None,
                         help="output WAV path (default: renders/radio-<seed>.wav)")

    args = parser.parse_args(argv)

    if args.command == "radio":
        import os

        from .radio import manifest_json, plan_session, render_session
        from .render import write_wav

        plan = plan_session(args.seed, args.channel, args.tracks,
                            signature=not args.no_signature)
        buf, manifest = render_session(plan, session_seed=args.seed,
                                       tape_dir=args.tape_dir)
        out = args.out or f"renders/radio-{args.seed}.wav"
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        write_wav(out, buf)
        man_path = os.path.splitext(out)[0] + ".json"
        with open(man_path, "w", encoding="utf-8") as fh:
            fh.write(manifest_json(manifest))
        print(f"broadcast {out}: {len(buf) / 44100 / 60:.1f} min · {len(plan)} tracks")
        for m in manifest:
            print(f"  {m['index']}. [{m['station']}] \u201c{m['title']}\u201d "
                  f"seed {m['seed']} · {m['tempo_bpm']} BPM · {m['key']} · "
                  f"starts {m['start_s']:.0f}s")
        print(f"program guide: {man_path}")
        return 0

    if args.command == "render":
        import os

        from .render import render_recipe, write_wav

        channel = "minyo" if args.tune else args.channel
        recipe = generate_recipe(args.seed, channel, tune=args.tune)
        buf = render_recipe(recipe, bars=args.bars)
        out = args.out or f"renders/seed-{args.seed}-{channel}.wav"
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        write_wav(out, buf)
        seconds = len(buf) / 44100
        print(f"rendered {out}: \u201c{recipe.title}\u201d · {recipe.tempo_bpm} BPM · "
              f"{recipe.key_root} {recipe.mode} · {seconds:.1f}s · seed {args.seed}")
        return 0

    if args.command == "recipe":
        seed = args.seed if args.seed is not None else int(time.time()) & 0xFFFFFFFF
        recipe = generate_recipe(seed, args.channel)
        text = recipe.to_json()
        if args.out:
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(text + "\n")
            print(f"wrote {args.out}: seed {seed} · {recipe.title} · "
                  f"{recipe.tempo_bpm} BPM · {recipe.key_root} {recipe.mode}")
        else:
            print(text)
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
