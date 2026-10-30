"""S7a regression tests: every confirmed bug from the external
clone-and-run review gets a test that fails on the pre-fix code.

Covered here (Python side):
  #5 CLI range validation — bad --bars/--tracks died as tracebacks.
  #7 Recipe.from_json validation — unknown modes/keys/types were
     accepted or raised a bare TypeError.
Bug #6 (pinned-channel signature) lives in test_radio_plan.py, whose
goldens pin the planner; bugs #1-#4 are web-side (web/test/).
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

from kcat.recipes import Recipe, generate_recipe

ROOT = Path(__file__).resolve().parent.parent


def run_cli(*args):
    return subprocess.run(
        [sys.executable, "-m", "kcat", *args],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )


class TestCliRangeValidation(unittest.TestCase):
    BAD = [
        ("radio", "--seed", "1", "--tracks", "0"),
        ("radio", "--seed", "1", "--tracks", "-2"),
        ("render", "--seed", "7", "--bars", "0"),
        ("render", "--seed", "7", "--bars", "-1"),
        ("render", "--seed", "7", "--bars", "lots"),
    ]

    def test_bad_counts_fail_as_argparse_errors(self):
        for args in self.BAD:
            with self.subTest(args=args):
                p = run_cli(*args)
                self.assertEqual(p.returncode, 2, p.stderr)
                self.assertNotIn("Traceback", p.stderr)
                self.assertIn("kcat", p.stderr)  # usage line

    def test_good_counts_still_parse(self):
        p = run_cli("recipe", "--seed", "42")
        self.assertEqual(p.returncode, 0, p.stderr)


class TestFromJsonValidation(unittest.TestCase):
    def setUp(self):
        self.good = json.loads(generate_recipe(42, "dusty").to_json())

    def payload(self, **changes):
        data = dict(self.good)
        data.update(changes)
        return json.dumps(data)

    def assert_field_error(self, payload, *needles):
        with self.assertRaises(ValueError) as cm:
            Recipe.from_json(payload)
        for needle in needles:
            self.assertIn(needle, str(cm.exception))

    def test_valid_recipes_still_round_trip(self):
        for seed, channel in [(42, "dusty"), (7, "jazz-cat"), (5, "minyo")]:
            r = generate_recipe(seed, channel)
            self.assertEqual(Recipe.from_json(r.to_json()), r)

    def test_unknown_mode_rejected_by_name(self):
        self.assert_field_error(self.payload(mode="nope"), "mode", "nope")

    def test_unknown_channel_rejected_by_name(self):
        self.assert_field_error(
            self.payload(channel="nope"), "channel", "nope")

    def test_unknown_key_rejected_by_name_not_typeerror(self):
        self.assert_field_error(self.payload(bogus_key=1), "bogus_key")

    def test_missing_field_rejected_by_name(self):
        data = dict(self.good)
        del data["title"]
        self.assert_field_error(json.dumps(data), "title")

    def test_wrong_types_rejected(self):
        self.assert_field_error(self.payload(tempo_bpm="fast"), "tempo_bpm")
        self.assert_field_error(self.payload(seed="42"), "seed")
        self.assert_field_error(self.payload(swing="lots"), "swing")
        self.assert_field_error(self.payload(bars=0), "bars")
        self.assert_field_error(self.payload(bars=-3), "bars")
        self.assert_field_error(self.payload(seed=True), "seed")

    def test_bad_key_root_and_tune_rejected(self):
        self.assert_field_error(self.payload(key_root="H"), "key_root")
        self.assert_field_error(self.payload(tune="nope"), "tune")

    def test_bad_sections_rejected(self):
        self.assert_field_error(
            self.payload(sections=["intro", "chorus"]), "sections")
        self.assert_field_error(self.payload(sections="verse"), "sections")

    def test_bad_progression_rejected(self):
        self.assert_field_error(
            self.payload(progression={"chords": []}), "progression")
        self.assert_field_error(
            self.payload(progression={"chords": [{"notes": []}]}),
            "progression")

    def test_non_object_and_broken_json_rejected(self):
        self.assert_field_error("[1, 2]", "object")
        self.assert_field_error("{not json", "JSON")

    def test_unsupported_version_rejected(self):
        self.assert_field_error(self.payload(version=99), "version")


if __name__ == "__main__":
    unittest.main()
