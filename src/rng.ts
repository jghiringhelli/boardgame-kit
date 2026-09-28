// Seeded deterministic PRNG (mulberry32) shared by every game in this
// workspace so shuffles/dice rolls are provably bit-reproducible from a
// single numeric seed. Every function here is pure: it takes the current
// numeric "cursor" and returns both the result and the advanced cursor —
// the caller owns where that cursor lives (typically a `rngCursor`/`rngState`
// field on that game's own GameState), so this module has zero dependency on
// any particular game's state shape.

export interface RngResult {
  value: number;
  cursor: number;
}

/** Advances the cursor and returns a float in [0, 1). */
export function nextRandom(cursor: number): RngResult {
  let t = (cursor + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, cursor: t >>> 0 };
}

/** Advances the cursor and returns an integer in [0, maxExclusive). */
export function nextInt(cursor: number, maxExclusive: number): RngResult {
  const r = nextRandom(cursor);
  return { value: Math.floor(r.value * maxExclusive), cursor: r.cursor };
}

export interface ShuffleResult<T> {
  items: T[];
  cursor: number;
}

/** Fisher–Yates using the seeded stream. Returns a new array; never mutates `arr`. */
export function shuffle<T>(cursor: number, arr: readonly T[]): ShuffleResult<T> {
  const out = arr.slice();
  let c = cursor;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(c, i + 1);
    c = r.cursor;
    const j = r.value;
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return { items: out, cursor: c };
}
