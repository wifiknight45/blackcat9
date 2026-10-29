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

    def test_single_station_plan_opens_with_signature_in_python(self):
        # Python's plan_session(signature=True) puts the signature first
        # even on a pinned station. The web Session deliberately skips
        # it there (tuning to a station starts that station) — the web
        # golden therefore equals this plan minus its first entry.
        plan = seq(plan_session(9, "minyo", tracks=8))
        self.assertEqual(plan[0], ("dusty", 42))
        self.assertTrue(all(ch == "minyo" for ch, _ in plan[1:]))
        self.assertEqual(plan[1:], [("minyo", 469201), ("minyo", 354295),
                                    ("minyo", 807525), ("minyo", 232724),
                                    ("minyo", 141872), ("minyo", 958796),
                                    ("minyo", 347755)])


if __name__ == "__main__":
    unittest.main()
