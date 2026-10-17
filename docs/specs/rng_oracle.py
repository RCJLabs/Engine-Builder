"""An independent implementation of docs/specs/rng.md, used as an oracle.

It is written from the spec in Python's unbounded integers with explicit 32-bit masks, so a
JavaScript-only slip (a `| 0` where `>>> 0` belonged, a shift's precedence) cannot hide in
both implementations. packages/core/src/rng.oracle.test.ts runs it and compares every case
with @eb/core.

Run it yourself:  python3 -I docs/specs/rng_oracle.py
"""

import json

M = 0xFFFFFFFF
TWO_POW_32 = 1 << 32


def fnv1a32(text):
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h = ((h ^ byte) * 0x01000193) & M
    return h


def hash_parts(*parts):
    return fnv1a32("\x1f".join(str(p) for p in parts))


def splitmix32(seed):
    a = seed & M

    def nxt():
        nonlocal a
        a = (a + 0x9E3779B9) & M
        t = a ^ (a >> 16)
        t = (t * 0x21F0AAAD) & M
        t ^= t >> 15
        t = (t * 0x735A2D97) & M
        return (t ^ (t >> 15)) & M

    return nxt


class Rng:
    def __init__(self, seed, words):
        self.seed = seed
        self.a, self.b, self.c, self.d = words

    @staticmethod
    def create(seed):
        mix = splitmix32(fnv1a32(seed))
        rng = Rng(seed, [mix(), mix(), mix(), mix()])
        for _ in range(12):
            rng.next_u32()
        return rng

    def fork(self, label):
        return Rng.create(f"{self.seed}\x1f{label}")

    def state(self):
        return [self.a, self.b, self.c, self.d]

    def next_u32(self):
        t = (self.a + self.b + self.d) & M
        self.d = (self.d + 1) & M
        self.a = self.b ^ (self.b >> 9)
        self.b = (self.c + (self.c << 3)) & M
        self.c = ((self.c << 21) & M) | (self.c >> 11)
        self.c = (self.c + t) & M
        return t

    def int(self, lo, hi):
        span = hi - lo + 1
        limit = TWO_POW_32 - (TWO_POW_32 % span)
        while True:
            x = self.next_u32()
            if x < limit:
                return lo + x % span

    def chance(self, num, den):
        return self.int(1, den) <= num

    def weighted_index(self, weights):
        roll = self.int(0, sum(weights) - 1)
        for i, w in enumerate(weights):
            roll -= w
            if roll < 0:
                return i
        raise AssertionError("unreachable")

    def shuffle(self, items):
        out = list(items)
        for i in range(len(out) - 1, 0, -1):
            j = self.int(0, i)
            out[i], out[j] = out[j], out[i]
        return out


def draws(rng, n):
    return [rng.next_u32() for _ in range(n)]


def cases():
    """The golden cases, in the order docs/specs/rng.md lists them."""
    stepped = Rng.create("engine-builder")
    draws(stepped, 3)
    dice = Rng.create("dice")
    wide = Rng.create("wide")
    odds = Rng.create("odds")
    weights = Rng.create("weights")
    return {
        "fnv1a32": {s: fnv1a32(s) for s in ["", "a", "foobar", "engine-builder", "Landnám", "🙂"]},
        "hashParts": hash_parts("run-7", 3, 12),
        "next": draws(Rng.create("engine-builder"), 8),
        "forkLoot": draws(Rng.create("engine-builder").fork("loot"), 4),
        "forkNumber": draws(Rng.create("engine-builder").fork(7), 2),
        "stateAfter3": stepped.state(),
        "dice": [dice.int(1, 6) for _ in range(12)],
        "wide": [wide.int(0, 3221225471) for _ in range(8)],
        "odds": [odds.chance(70, 100) for _ in range(10)],
        "deck": Rng.create("deck").shuffle(range(10)),
        "weights": [weights.weighted_index([5, 0, 3, 2]) for _ in range(10)],
    }


if __name__ == "__main__":
    print(json.dumps(cases(), ensure_ascii=False))
