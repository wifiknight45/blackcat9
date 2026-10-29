"""S0 tests: RNG determinism, theory correctness, recipe round-trips.

Run from the repo root:  python3 -m unittest discover -s tests -v
Pure stdlib — no dependencies for this stage.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kcat.recipes import CHANNELS, Recipe, generate_recipe
from kcat.rng import SplitMix64
from kcat.theory import chord_for_degree, midi_of, scale_notes, scale_pcs


class TestRng(unittest.TestCase):
    def test_stream_is_deterministic(self):
        a = [SplitMix64(42).next_u64() for _ in range(1)]
        r1, r2 = SplitMix64(42), SplitMix64(42)
        self.assertEqual([r1.next_u64() for _ in range(100)],
                         [r2.next_u64() for _ in range(100)])
        self.assertEqual(len(a), 1)

    def test_different_seeds_diverge(self):
        r1, r2 = SplitMix64(1), SplitMix64(2)
        self.assertNotEqual([r1.next_u64() for _ in range(8)],
                            [r2.next_u64() for _ in range(8)])

    def test_random_in_unit_interval(self):
        r = SplitMix64(7)
        for _ in range(1000):
            x = r.random()
            self.assertGreaterEqual(x, 0.0)
            self.assertLess(x, 1.0)

    def test_first_values_pinned(self):
        # Regression pin: if the mixing constants or gamma ever change,
        # every existing seed's song changes. That must be a loud failure.
        r = SplitMix64(0)
        self.assertEqual(r.next_u64(), 0xE220A8397B1DCDAF)
        self.assertEqual(r.next_u64(), 0x6E789E6AA1B965F4)


class TestTheory(unittest.TestCase):
    def test_midi_numbers(self):
        self.assertEqual(midi_of("C", 4), 60)
        self.assertEqual(midi_of("Eb", 3), 51)
        self.assertEqual(midi_of("A", 4), 69)

    def test_scale_pcs(self):
        self.assertEqual(scale_pcs("C", "major"), [0, 2, 4, 5, 7, 9, 11])
        self.assertEqual(scale_pcs("A", "natural_minor"),
                         [9, 11, 0, 2, 4, 5, 7])

    def test_scale_notes(self):
        self.assertEqual(scale_notes("C", "major", 4),
                         [60, 62, 64, 65, 67, 69, 71])

    def test_chord_tones(self):
        chord = chord_for_degree("C", "major", 1)
        self.assertEqual(chord["symbol"], "Cmaj9")
        self.assertEqual(sorted(chord["pcs"]), [0, 2, 4, 7, 11])
        ii = chord_for_degree("C", "major", 2)
        self.assertEqual(ii["symbol"], "Dmin9")
        self.assertEqual(sorted(ii["pcs"]), [0, 2, 4, 5, 9])

    def test_voicing_is_ascending_and_in_register(self):
        for mode in ("major", "dorian", "natural_minor"):
            for degree in range(1, 8):
                notes = chord_for_degree("Eb", mode, degree)["notes"]
                self.assertEqual(notes, sorted(notes))
                self.assertGreaterEqual(notes[0], 41)
                self.assertLessEqual(notes[-1], 84)


class TestRecipes(unittest.TestCase):
    def test_deterministic_per_seed_and_channel(self):
        for channel in CHANNELS:
            r1 = generate_recipe(42, channel)
            r2 = generate_recipe(42, channel)
            self.assertEqual(r1.to_json(), r2.to_json())

    def test_seeds_change_the_song(self):
        titles = {generate_recipe(s, "dusty").to_json() for s in range(20)}
        self.assertGreater(len(titles), 15)

    def test_json_round_trip(self):
        for channel in CHANNELS:
            r = generate_recipe(1234, channel)
            self.assertEqual(Recipe.from_json(r.to_json()), r)

    def test_recipe_fields_sane(self):
        for channel, cfg in CHANNELS.items():
            r = generate_recipe(99, channel)
            lo, hi = cfg["tempo"]
            self.assertTrue(lo <= r.tempo_bpm <= hi)
            self.assertIn(r.mode, cfg["modes"])
            self.assertIn(r.key_root, cfg["keys"])
            self.assertEqual(len(r.progression["chords"]), 4)
            scale = set(scale_pcs(r.key_root, r.mode))
            for chord in r.progression["chords"]:
                self.assertIn(chord["root_pc"], scale)
            self.assertEqual(r.bars, 8 * len(r.sections))

    def test_unknown_channel_rejected(self):
        with self.assertRaises(ValueError):
            generate_recipe(1, "polka")


if __name__ == "__main__":
    unittest.main()
