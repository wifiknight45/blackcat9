"""S3 radio tests: session planning and continuous rendering.

Run: python3 -m unittest discover -s tests -v   (needs numpy)
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from kcat.radio import plan_session, render_session, static_burst
from kcat.recipes import SIGNATURE_CHANNEL, SIGNATURE_SEED


class TestPlan(unittest.TestCase):
    def test_signature_opens_the_session(self):
        plan = plan_session(1974, "all", tracks=4)
        self.assertEqual(plan[0].seed, SIGNATURE_SEED)
        self.assertEqual(plan[0].channel, SIGNATURE_CHANNEL)

    def test_plan_is_deterministic(self):
        a = plan_session(7, "all", tracks=5)
        b = plan_session(7, "all", tracks=5)
        self.assertEqual([(r.seed, r.channel) for r in a],
                         [(r.seed, r.channel) for r in b])

    def test_single_station_stays_put(self):
        plan = plan_session(3, "minyo", tracks=3, signature=False)
        self.assertTrue(all(r.channel == "minyo" for r in plan))


class TestStatic(unittest.TestCase):
    def test_static_burst_shape_and_energy(self):
        sig = static_burst(1.3, seed=1)
        self.assertEqual(sig.shape[1], 2)
        self.assertGreater(float(np.sqrt(np.mean(sig ** 2))), 0.03)
        self.assertLessEqual(float(np.max(np.abs(sig))), 0.51)


class TestRenderSession(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = plan_session(11, "all", tracks=2, signature=False)
        cls.buf, cls.manifest = render_session(
            cls.plan, session_seed=11, crossfade_s=0.4,
            bridge_fade_s=0.2, track_bars=4)

    def test_manifest_matches_plan(self):
        self.assertEqual(len(self.manifest), 2)
        self.assertEqual(self.manifest[0]["seed"], self.plan[0].seed)
        self.assertEqual(self.manifest[1]["seed"], self.plan[1].seed)
        self.assertGreater(self.manifest[1]["start_s"],
                           self.manifest[0]["start_s"])

    def test_total_duration_accounts_for_everything(self):
        total = len(self.buf) / 44100
        last = self.manifest[-1]
        end = last["start_s"] + last["duration_s"]
        self.assertAlmostEqual(total, end, delta=0.15)
        # Bridges + tracks must exceed the bare track sum.
        bare = sum(m["duration_s"] for m in self.manifest)
        self.assertGreater(total, bare)

    def test_session_is_deterministic(self):
        buf2, _ = render_session(self.plan, session_seed=11,
                                 crossfade_s=0.4, bridge_fade_s=0.2,
                                 track_bars=4)
        self.assertTrue(np.array_equal(self.buf, buf2))


if __name__ == "__main__":
    unittest.main()
