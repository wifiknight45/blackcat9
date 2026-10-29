"""Traditional-tunes tests: the encoded melodies in
kcat/traditional.py, their provenance pins, and how recipes and the
renderer treat them.

Run: python3 -m unittest discover -s tests -v   (needs numpy)
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from kcat.recipes import CHANNELS, Recipe, generate_recipe
from kcat.render import render_recipe
from kcat.theory import SCALES
from kcat.traditional import TUNES


class TestSakuraEncoding(unittest.TestCase):
    def test_sakura_offsets_stay_in_the_in_scale(self):
        # Every pitch class Sakura touches must be a member of the
        # "in" scale relative to the tonic — the tune IS the scale.
        pcs = {(offset % 12) for offset, _ in TUNES["sakura"]["notes"]}
        self.assertLessEqual(pcs, set(SCALES["in"]))
        self.assertEqual(TUNES["sakura"]["scale"], "in")

    def test_sakura_opening_phrase_is_the_published_one(self):
        # Provenance pin: the opening of the published score (see
        # TUNES["sakura"]["source"]) — A A B. | A A B. | A B C B,
        # written here as offsets from the in-scale root E:
        # A = +5, B = +7, C = +8. If this ever changes, the tune
        # being claimed as "Sakura Sakura" has changed.
        expected = [
            (5, 1), (5, 1), (7, 2),
            (5, 1), (5, 1), (7, 2),
            (5, 1), (7, 1), (8, 1), (7, 1),
        ]
        self.assertEqual(TUNES["sakura"]["notes"][:len(expected)], expected)

    def test_sakura_is_the_complete_verse(self):
        # 14 bars of 4/4; the last bar is a half note + half rest,
        # and rests are not encoded, so the notes sum to 54 beats.
        total = sum(d for _, d in TUNES["sakura"]["notes"])
        self.assertEqual(total, 54)


class TestFurusatoEncoding(unittest.TestCase):
    def test_furusato_first_section_beats(self):
        # 8 bars of 3/4, with a quarter rest after each phrase-final
        # half note (rests not encoded): 24 - 2 = 22 beats of notes.
        total = sum(d for _, d in TUNES["furusato"]["notes"])
        self.assertEqual(total, 22)

    def test_furusato_opening_phrase(self):
        # F F F | G. A G — offsets from the tonic F.
        expected = [(0, 1), (0, 1), (0, 1), (2, 1.5), (4, 0.5), (2, 1)]
        self.assertEqual(TUNES["furusato"]["notes"][:len(expected)],
                         expected)


class TestTuneRecipes(unittest.TestCase):
    def test_forced_sakura_recipe(self):
        r = generate_recipe(9, "minyo", tune="sakura")
        self.assertEqual(r.tune, "sakura")
        self.assertEqual(r.mode, "in")
        self.assertIn("Sakura", r.title)
        self.assertTrue(r.title.endswith("(traditional)"))

    def test_tune_survives_json_round_trip(self):
        r = generate_recipe(9, "minyo", tune="sakura")
        back = Recipe.from_json(r.to_json())
        self.assertEqual(back, r)
        self.assertEqual(back.tune, "sakura")

    def test_old_json_without_tune_still_loads(self):
        data = json.loads(generate_recipe(42, "dusty").to_json())
        del data["tune"]
        r = Recipe.from_json(json.dumps(data))
        self.assertIsNone(r.tune)

    def test_rolled_tunes_are_consistent(self):
        # The 50% roll: whenever a minyo recipe carries a tune, its
        # mode must be that tune's native scale and its title must
        # name the tune. (Both outcomes of the roll are fine.)
        for seed in range(30):
            r = generate_recipe(seed, "minyo")
            if r.tune is None:
                continue
            self.assertIn(r.tune, TUNES)
            self.assertEqual(r.mode, TUNES[r.tune]["scale"])
            self.assertEqual(
                r.title, f"{TUNES[r.tune]['name']} (traditional)")

    def test_roll_actually_happens(self):
        # Over 40 seeds the roll must produce both tuned and
        # untuned minyo recipes (a stuck roll would fail loudly).
        tunes = {generate_recipe(s, "minyo").tune for s in range(40)}
        self.assertIn(None, tunes)
        self.assertGreaterEqual(len(tunes), 2)

    def test_non_minyo_never_carries_a_tune(self):
        for channel in CHANNELS:
            if channel == "minyo":
                continue
            for seed in range(10):
                self.assertIsNone(generate_recipe(seed, channel).tune)

    def test_forced_tune_rejected_off_minyo(self):
        with self.assertRaises(ValueError):
            generate_recipe(1, "dusty", tune="sakura")

    def test_unknown_tune_rejected(self):
        with self.assertRaises(ValueError):
            generate_recipe(1, "minyo", tune="kojo-no-tsuki")


class TestTuneRender(unittest.TestCase):
    def test_tuned_minyo_render_is_real_and_deterministic(self):
        r = generate_recipe(9, "minyo", tune="sakura")
        buf1 = render_recipe(r, bars=4)
        buf2 = render_recipe(r, bars=4)
        self.assertEqual(buf1.shape[1], 2)
        self.assertTrue(np.all(np.isfinite(buf1)))
        self.assertGreater(float(np.sqrt(np.mean(buf1 ** 2))), 0.02)
        self.assertTrue(np.array_equal(buf1, buf2))


if __name__ == "__main__":
    unittest.main()
