#!/usr/bin/env python3
"""Generate web/test/arrangement_goldens.json from the Python engine.

S7c: the sections-driven arrangement (which bars break, where the
lead rests) must agree between render.py and web/js/compose.js just
as recipes do. Each entry carries a recipe (seed + channel) and, for
two bar counts, the per-bar flags from kcat.render.arrangement_flags
as compact [section, is_break, melody_rests] triples.

Run from the repo root:  python3 scripts/gen_arrangement_goldens.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kcat.recipes import generate_recipe  # noqa: E402
from kcat.render import arrangement_flags  # noqa: E402

CASES = [(42, "dusty"), (7, "jazz-cat"), (5, "minyo"),
         (99, "sunrise"), (1234, "wa-jazz")]
BAR_COUNTS = [48, 16]


def main() -> int:
    entries = []
    for seed, channel in CASES:
        recipe = generate_recipe(seed, channel)
        entry = {"seed": seed, "channel": channel,
                 "sections": recipe.sections, "bars": {}}
        for bars in BAR_COUNTS:
            entry["bars"][str(bars)] = [
                [section, int(is_break), int(rests)]
                for section, is_break, rests in arrangement_flags(recipe, bars)
            ]
        entries.append(entry)
    out = (Path(__file__).resolve().parent.parent
           / "web" / "test" / "arrangement_goldens.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"entries": entries}, indent=2) + "\n",
                   encoding="utf-8")
    print(f"wrote {out}: {len(entries)} arrangement goldens")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
