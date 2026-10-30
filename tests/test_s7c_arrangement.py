"""S7c: sections-driven arrangement (Python side).

Pre-S7c the breaks were hard-coded at bars 11 and 15 and the recipe's
sections were inert. These tests pin the new rule (mirrored in
web/js/compose.js; cross-engine agreement is pinned by
web/test/arrangement_goldens.json + the JS arrangement test):

  * break bars: intro and outro sections, plus the last bar of a
    bridge section;
  * the lead rests on the third bar of each verse, and through the
    outro except the final bar;
  * fragments (< 8 bars) get no section breaks.
"""
import unittest

from kcat.recipes import generate_recipe
from kcat.render import arrangement_flags, is_break_bar, melody_rests


def flags(recipe, bars):
    return arrangement_flags(recipe, bars)


class TestSeed42Arrangement(unittest.TestCase):
    # seed 42 / dusty sections: intro verse bridge verse verse outro
    def setUp(self):
        self.r = generate_recipe(42, "dusty")
        self.assertEqual(self.r.sections,
                         ["intro", "verse", "bridge", "verse", "verse", "outro"])

    def test_break_bars_come_from_sections(self):
        breaks = [b for b, (_, br, _) in enumerate(flags(self.r, 48)) if br]
        self.assertEqual(breaks, list(range(0, 8)) + [23] + list(range(40, 48)))

    def test_the_old_hard_coded_bars_are_unremarkable_now(self):
        # Bars 11 and 15 were THE breaks before S7c; both are plain
        # verse bars for this recipe now.
        self.assertFalse(is_break_bar(self.r, 11, 48))
        self.assertFalse(is_break_bar(self.r, 15, 48))

    def test_melody_rests_come_from_sections(self):
        rests = [b for b, (_, _, mr) in enumerate(flags(self.r, 48)) if mr]
        # third bar of each verse section (10, 26, 34) + outro except
        # the closing phrase on the final bar (47).
        self.assertEqual(rests, [10, 26, 34] + list(range(40, 47)))
        self.assertFalse(melody_rests(self.r, 47, 48))

    def test_the_track_develops_after_bar_16(self):
        # The flagship complaint: nothing changed after bar 16. Now
        # the second half differs structurally from the first.
        first = flags(self.r, 48)[:24]
        second = flags(self.r, 48)[24:]
        self.assertNotEqual([s for s, _, _ in first], [s for s, _, _ in second])
        self.assertTrue(any(br for _, br, _ in second))     # bridge turn + outro
        self.assertTrue(any(mr for _, _, mr in second))     # outro rests


class TestArrangementRules(unittest.TestCase):
    def test_fragments_have_no_section_breaks(self):
        r = generate_recipe(42, "dusty")
        self.assertFalse(any(br for _, br, _ in flags(r, 4)))
        self.assertFalse(any(br for _, br, _ in flags(r, 7)))

    def test_every_recipe_form_arranges(self):
        for seed in (0, 1, 7, 42, 1234):
            for channel in ("dusty", "jazz-cat", "minyo", "wa-jazz", "sunrise"):
                r = generate_recipe(seed, channel)
                fl = flags(r, r.bars)
                self.assertEqual(len(fl), r.bars)
                # intro section always breaks; outro always breaks;
                # final bar is never a melody rest.
                self.assertTrue(all(br for _, br, _ in fl[:8]))
                self.assertTrue(all(br for _, br, _ in fl[-8:]))
                self.assertFalse(fl[-1][2])

    def test_sixteen_bar_render_uses_the_same_sections(self):
        r = generate_recipe(42, "dusty")
        breaks = [b for b, (_, br, _) in enumerate(flags(r, 16)) if br]
        self.assertEqual(breaks, list(range(0, 8)))


if __name__ == "__main__":
    unittest.main()
