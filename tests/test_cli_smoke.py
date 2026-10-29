"""CLI smoke: the documented bash entry points actually run.

Kept deliberately shallow (and therefore fast): the recipe JSON parses
and names the right song; a 4-bar render writes a real WAV. The full
radio session is NOT smoked here — a single 48-bar track renders for
over a minute; that path is covered in-process by test_radio.
"""
import json
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_cli(*args):
    return subprocess.run(
        [sys.executable, "-m", "kcat", *args],
        cwd=ROOT, capture_output=True, text=True, timeout=300,
    )


class TestCliSmoke(unittest.TestCase):
    def test_recipe_cli_prints_the_signature_json(self):
        p = run_cli("recipe", "--seed", "42", "--channel", "dusty")
        self.assertEqual(p.returncode, 0, p.stderr)
        r = json.loads(p.stdout)
        self.assertEqual(r["seed"], 42)
        self.assertEqual(r["channel"], "dusty")
        self.assertEqual(r["title"], "Shimokitazawa Umbrellas")

    def test_render_cli_writes_a_real_wav(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "smoke.wav"
            p = run_cli("render", "--seed", "7", "--channel", "jazz-cat",
                        "--bars", "4", "--out", str(out))
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertTrue(out.exists())
            with wave.open(str(out)) as w:
                self.assertEqual(w.getnchannels(), 2)
                self.assertEqual(w.getsampwidth(), 2)
                self.assertEqual(w.getframerate(), 44100)
                dur = w.getnframes() / w.getframerate()
            self.assertGreater(dur, 5)
            self.assertLess(dur, 30)


if __name__ == "__main__":
    unittest.main()
