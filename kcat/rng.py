"""Deterministic PRNG (SplitMix64) shared across the Python and web engines.

The recipe system depends on identical random streams in every
implementation, so we do NOT use Python's ``random`` module (the web
twin cannot reproduce it). SplitMix64 is tiny, public-domain, and easy
to port bit-for-bit to TypeScript: all arithmetic is on unsigned
64-bit integers.
"""

MASK64 = (1 << 64) - 1

_GAMMA = 0x9E3779B97F4A7C15
_MIX1 = 0xBF58476D1CE4E5B9
_MIX2 = 0x94D049BB133111EB


class SplitMix64:
    """SplitMix64 generator: seed it once, get a stable stream forever."""

    def __init__(self, seed: int):
        self.state = seed & MASK64

    def next_u64(self) -> int:
        self.state = (self.state + _GAMMA) & MASK64
        z = self.state
        z = ((z ^ (z >> 30)) * _MIX1) & MASK64
        z = ((z ^ (z >> 27)) * _MIX2) & MASK64
        return (z ^ (z >> 31)) & MASK64

    def random(self) -> float:
        """Float in [0, 1) with 53 bits of precision (like Math.random)."""
        return (self.next_u64() >> 11) * (1.0 / (1 << 53))

    def uniform(self, a: float, b: float) -> float:
        return a + (b - a) * self.random()

    def randint(self, a: int, b: int) -> int:
        """Integer in [a, b] inclusive."""
        if b < a:
            raise ValueError("empty range")
        return a + int(self.random() * (b - a + 1))

    def chance(self, p: float) -> bool:
        return self.random() < p

    def choice(self, seq):
        if not seq:
            raise ValueError("choice from empty sequence")
        return seq[int(self.random() * len(seq))]

    def weighted_choice(self, items, weights):
        total = float(sum(weights))
        if total <= 0:
            raise ValueError("weights must sum to a positive value")
        r = self.random() * total
        acc = 0.0
        for item, w in zip(items, weights):
            acc += w
            if r < acc:
                return item
        return items[-1]

    def shuffle(self, xs):
        """In-place Fisher-Yates shuffle driven by this stream."""
        for i in range(len(xs) - 1, 0, -1):
            j = int(self.random() * (i + 1))
            xs[i], xs[j] = xs[j], xs[i]
        return xs
