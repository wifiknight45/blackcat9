#!/usr/bin/env python3
"""Generate web/test/goldens.json from the Python engine.

Golden recipes for the JS/Python parity test: every channel x a set
of seeds, plus forced traditional-tune recipes. Each entry carries
the recipe as a parsed object AND the raw string of Recipe.to_json()
(Python json.dumps with sort_keys=True, indent=2) so the web test
can check both deep equality and exact serialization.

Run from the repo root:  python3 scripts/gen_goldens.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kcat.recipes import generate_recipe  # noqa: E402

CHANNELS = ["dusty", "jazz-cat", "sunrise", "minyo", "wa-jazz"]
SEEDS = [0, 1, 7, 9, 42, 123, 2024]
FORCED_TUNES = [("sakura", 9), ("sakura", 42), ("furusato", 4),
                ("furusato", 42)]


def main() -> int:
    entries = []
    for channel in CHANNELS:
        for seed in SEEDS:
            recipe = generate_recipe(seed, channel)
            entries.append({
                "channel": channel,
                "seed": seed,
                "tune": None,
                "json": recipe.to_json(),
                "recipe": json.loads(recipe.to_json()),
            })
    for tune, seed in FORCED_TUNES:
        recipe = generate_recipe(seed, "minyo", tune=tune)
        entries.append({
            "channel": "minyo",
            "seed": seed,
            "tune": tune,
            "json": recipe.to_json(),
            "recipe": json.loads(recipe.to_json()),
        })
    out = Path(__file__).resolve().parent.parent / "web" / "test" / "goldens.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"entries": entries}, indent=2) + "\n",
                   encoding="utf-8")
    print(f"wrote {out}: {len(entries)} golden recipes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
