"""Golden plans: plan_session's exact track sequences, pinned.

These goldens are the contract the web radio (web/js/radio.js Session)
is tested against — the dial must wander identically in both engines.
Generated from the S3 implementation; if a change here is intentional,
regenerate consciously and update web/test/radio.test.mjs to match.
"""
import unittest

from kcat.radio import plan_session


def seq(plan):
    return [(r.channel, r.seed) for r in plan]


class TestGoldenPlans(unittest.TestCase):
    GOLDEN_ALL = {
        9: [("dusty", 42), ("dusty", 354295), ("minyo", 232724),
            ("sunrise", 958796), ("minyo", 823174), ("jazz-cat", 220913),
            ("wa-jazz", 152103), ("minyo", 236586)],
        42: [("dusty", 42), ("sunrise", 492044), ("dusty", 779036),
             ("wa-jazz", 479243), ("jazz-cat", 145433), ("sunrise", 310463),
             ("jazz-cat", 925728), ("minyo", 184241)],
        1974: [("dusty", 42), ("jazz-cat", 568443), ("jazz-cat", 969238),
               ("dusty", 865325), ("dusty", 4609), ("wa-jazz", 475448),
               ("dusty", 239484), ("wa-jazz", 829917)],
    }

    def test_all_mode_goldens(self):
        for seed, want in self.GOLDEN_ALL.items():
            with self.subTest(session_seed=seed):
                self.assertEqual(seq(plan_session(seed, "all", tracks=8)), want)

    def test_pinned_station_skips_the_signature(self):
        # S7a bug #6: pre-fix, a pinned plan opened with the DUST
        # signature track; the web Session never did. Now both agree:
        # pinning a station starts that station, and the plan equals
        # the web golden sequence exactly (no entry dropped).
        plan = seq(plan_session(9, "minyo", tracks=8))
        self.assertTrue(all(ch == "minyo" for ch, _ in plan))
        self.assertEqual(plan, [("minyo", 469201), ("minyo", 354295),
                                ("minyo", 807525), ("minyo", 232724),
                                ("minyo", 141872), ("minyo", 958796),
                                ("minyo", 347755), ("minyo", 823174)])

    def test_pinned_jazz_cat_plan_matches_the_review_case(self):
        # The exact case from the S7 review: plan_session(5, "jazz-cat")
        # opened with a DUST track before the fix.
        plan = seq(plan_session(5, "jazz-cat", tracks=5))
        self.assertEqual(plan, [("jazz-cat", 71655), ("jazz-cat", 518906),
                                ("jazz-cat", 741116), ("jazz-cat", 712264),
                                ("jazz-cat", 817817)])

    def test_signature_flag_still_controls_the_open_dial(self):
        self.assertEqual(seq(plan_session(9, "all", tracks=8))[0],
                         ("dusty", 42))
        plan = seq(plan_session(9, "all", tracks=8, signature=False))
        self.assertNotEqual(plan[0], ("dusty", 42))
        self.assertEqual(len(plan), 8)


if __name__ == "__main__":
    unittest.main()
