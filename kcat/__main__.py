"""K-CAT command line.

Usage (from the repo root):
    python3 -m kcat recipe --seed 42 --channel dusty
    python3 -m kcat recipe --seed 7 --channel jazz-cat --out seven.json
"""

import argparse
import sys
import time

from .recipes import CHANNELS, generate_recipe


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

    args = parser.parse_args(argv)

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
