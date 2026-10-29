// Deterministic PRNG (SplitMix64) — bit-for-bit port of kcat/rng.py.
//
// All arithmetic is on unsigned 64-bit integers, which JS numbers
// cannot hold, so the state and mixing are BigInt throughout. The
// float-producing helpers mirror the Python semantics exactly,
// including how each one consumes the stream:
//   random()  -> (next_u64 >> 11) * 2^-53
//   randint() -> a + int(random() * (b - a + 1))     (truncation)
//   choice()  -> seq[int(random() * len(seq))]      (truncation)
//   shuffle() -> Fisher-Yates with j = int(random() * (i + 1))

const MASK64 = (1n << 64n) - 1n;
const GAMMA = 0x9E3779B97F4A7C15n;
const MIX1 = 0xBF58476D1CE4E5B9n;
const MIX2 = 0x94D049BB133111EBn;

export class SplitMix64 {
  constructor(seed) {
    // Python: seed & MASK64 (works for negative seeds too, BigInt
    // bitwise AND on negative values follows two's complement,
    // matching Python's infinite-precision semantics here).
    this.state = BigInt(seed) & MASK64;
  }

  next_u64() {
    this.state = (this.state + GAMMA) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * MIX1) & MASK64;
    z = ((z ^ (z >> 27n)) * MIX2) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  }

  random() {
    // (next_u64 >> 11) is < 2^53, so Number() is exact.
    // NB: 2 ** 53, not 1 << 53 — JS bitwise shifts mask the shift
    // count to 5 bits, so 1 << 53 would silently be 1 << 21.
    return Number(this.next_u64() >> 11n) * (1.0 / 2 ** 53);
  }

  uniform(a, b) {
    return a + (b - a) * this.random();
  }

  randint(a, b) {
    if (b < a) throw new Error("empty range");
    return a + Math.floor(this.random() * (b - a + 1));
  }

  chance(p) {
    return this.random() < p;
  }

  choice(seq) {
    if (!seq || seq.length === 0) throw new Error("choice from empty sequence");
    return seq[Math.floor(this.random() * seq.length)];
  }

  weighted_choice(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) throw new Error("weights must sum to a positive value");
    const r = this.random() * total;
    let acc = 0.0;
    for (let i = 0; i < items.length; i++) {
      acc += weights[i];
      if (r < acc) return items[i];
    }
    return items[items.length - 1];
  }

  shuffle(xs) {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = xs[i];
      xs[i] = xs[j];
      xs[j] = tmp;
    }
    return xs;
  }
}
