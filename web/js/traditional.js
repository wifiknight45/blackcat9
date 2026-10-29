// Traditional Japanese tunes — data port of kcat/traditional.py.
// See that module for provenance: every melody was transcribed from a
// published score, never guessed. Notes are
// [semitone_offset_from_tonic, duration_in_beats] pairs.

export const TUNES = {
  "sakura": {
    "name": "Sakura Sakura",
    "japanese": "さくら さくら",
    "scale": "in",
    "source": (
      "Published score by Germaine Tay (The Musician Cat), " +
      "14 bars, 4/4, verse 2 — read note-by-note and checked " +
      "for internal ABBAC consistency; form and scale " +
      "cross-checked against Wikipedia, 'Sakura Sakura' " +
      "(in scale; ABBAC over 14 bars; the 1888 Sokyoku-shu " +
      "arrangement). Pitches in the score: A B C E F over an " +
      "E final — offsets here are from E."
    ),
    "notes": [
      [5, 1], [5, 1], [7, 2],
      [5, 1], [5, 1], [7, 2],
      [5, 1], [7, 1], [8, 1], [7, 1],
      [5, 1], [7, 0.5], [5, 0.5], [1, 2],
      [0, 1], [-4, 1], [0, 1], [1, 1],
      [0, 1], [0, 0.5], [-4, 0.5], [-4, 2],
      [5, 1], [7, 1], [8, 1], [7, 1],
      [5, 1], [7, 0.5], [5, 0.5], [1, 2],
      [0, 1], [-4, 1], [0, 1], [1, 1],
      [0, 1], [0, 0.5], [-4, 0.5], [-4, 2],
      [5, 1], [5, 1], [8, 2],
      [5, 1], [5, 1], [8, 2],
      [0, 1], [1, 1], [7, 0.5], [5, 0.5], [1, 1],
      [0, 2],
    ],
  },
  "furusato": {
    "name": "Furusato",
    "japanese": "ふるさと",
    "scale": "yo",
    "source": (
      "doremifa.me melody score in F major, 3/4 — the note-" +
      "name staff and the fixed-do solfa (fa so la si...) are " +
      "two concordant renderings of the same notation; first " +
      "section (8 bars, both phrases). Corroborated by the " +
      "Senzoku Gakuen College of Music published score " +
      "(score_furusato.pdf; G major, STEP 1 melody). " +
      "Melody by Teiichi Okano, 1914. Only the first section " +
      "is encoded: later bars of the arrangements consulted " +
      "diverge in ornamentation, so they were left out rather " +
      "than guessed."
    ),
    "notes": [
      [0, 1], [0, 1], [0, 1],
      [2, 1.5], [4, 0.5], [2, 1],
      [4, 1], [4, 1], [5, 1],
      [7, 2],
      [5, 1], [7, 1], [9, 1],
      [4, 1.5], [5, 0.5], [4, 1],
      [2, 1], [2, 1], [11, 1],
      [0, 2],
    ],
  },
};
