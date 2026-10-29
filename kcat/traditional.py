"""Traditional Japanese tunes, encoded note-for-note for MIN'YO.

These are REAL public-domain melodies, transcribed from published
scores — never generated, never guessed. Accuracy is the whole point
of this module: a wrong note claimed as "Sakura" is worse than no
tune at all, so every entry carries its source, and a tune that
could not be verified against a reputable score was dropped
(Kojo no Tsuki: Taki's 1901 original in B minor and Yamada's 1917
D-minor rewrite differ, and no freely readable note-level source
could be secured — so it is NOT here).

Each tune's ``notes`` are (semitone_offset_from_tonic,
duration_in_beats) pairs relative to the tune's own tonic, so a
recipe in any key transposes the melody exactly. Rests in the
source are not encoded; phrase-final notes keep their notated
length and the renderer leaves a breath between passes.
"""

TUNES = {
    "sakura": {
        "name": "Sakura Sakura",
        "japanese": "さくら さくら",
        # The published score's pitch collection is E F A B C — the
        # "in" (miyako-bushi) scale rooted on E, where the melody
        # also ends. Offsets below are relative to that root, so
        # every offset's pitch class is in theory.SCALES["in"].
        "scale": "in",
        "source": (
            "Published score by Germaine Tay (The Musician Cat), "
            "14 bars, 4/4, verse 2 — read note-by-note and checked "
            "for internal ABBAC consistency; form and scale "
            "cross-checked against Wikipedia, 'Sakura Sakura' "
            "(in scale; ABBAC over 14 bars; the 1888 Sokyoku-shu "
            "arrangement). Pitches in the score: A B C E F over an "
            "E final — offsets here are from E."
        ),
        # Verse, complete (14 bars). Bar lines in comments.
        "notes": [
            (5, 1), (5, 1), (7, 2),            # A A B.
            (5, 1), (5, 1), (7, 2),            # A A B.
            (5, 1), (7, 1), (8, 1), (7, 1),    # A B C B
            (5, 1), (7, 0.5), (5, 0.5), (1, 2),  # A B A F.
            (0, 1), (-4, 1), (0, 1), (1, 1),   # E C E F
            (0, 1), (0, 0.5), (-4, 0.5), (-4, 2),  # E E C C.
            (5, 1), (7, 1), (8, 1), (7, 1),    # A B C B
            (5, 1), (7, 0.5), (5, 0.5), (1, 2),  # A B A F.
            (0, 1), (-4, 1), (0, 1), (1, 1),   # E C E F
            (0, 1), (0, 0.5), (-4, 0.5), (-4, 2),  # E E C C.
            (5, 1), (5, 1), (8, 2),            # A A C.
            (5, 1), (5, 1), (8, 2),            # A A C.
            (0, 1), (1, 1), (7, 0.5), (5, 0.5), (1, 1),  # E F B A F
            (0, 2),                            # E. (+ half rest)
        ],
    },
    "furusato": {
        "name": "Furusato",
        "japanese": "ふるさと",
        # The notated melody is heptatonic F major (offsets below
        # use all seven major pitch classes). K-CAT files the tune
        # under "yo" — the open folk pentatonic the MIN'YO station's
        # harmony is built on — so a tuned recipe's progression
        # stays pentatonic-safe like every other minyo recipe; the
        # encoded notes themselves are the exact published melody,
        # Bb and E included.
        "scale": "yo",
        "source": (
            "doremifa.me melody score in F major, 3/4 — the note-"
            "name staff and the fixed-do solfa (fa so la si...) are "
            "two concordant renderings of the same notation; first "
            "section (8 bars, both phrases). Corroborated by the "
            "Senzoku Gakuen College of Music published score "
            "(score_furusato.pdf; G major, STEP 1 melody). "
            "Melody by Teiichi Okano, 1914. Only the first section "
            "is encoded: later bars of the arrangements consulted "
            "diverge in ornamentation, so they were left out rather "
            "than guessed."
        ),
        # First section, complete (8 bars of 3/4). Offsets from F.
        # Phrase-final half notes are followed by a quarter rest in
        # the source (not encoded — see module docstring).
        "notes": [
            (0, 1), (0, 1), (0, 1),            # F F F
            (2, 1.5), (4, 0.5), (2, 1),        # G. A G
            (4, 1), (4, 1), (5, 1),            # A A Bb
            (7, 2),                            # C.
            (5, 1), (7, 1), (9, 1),            # Bb C D
            (4, 1.5), (5, 0.5), (4, 1),        # A. Bb A
            (2, 1), (2, 1), (11, 1),           # G G E
            (0, 2),                            # F.
        ],
    },
}
