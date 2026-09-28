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

/**
 * Advances the cursor and returns a float in [0, 1). Standard mulberry32:
 * note the returned/persisted cursor is the post-increment, PRE-mix value —
 * the further avalanche mixing below is recomputed from scratch on every
 * call and never itself carried forward. Preserve this exactly; changing it
 * changes every game's random stream from that point on.
 */
export function nextRandom(cursor: number): RngResult {
  const c = (cursor + 0x6d2b79f5) | 0;
  let t = c;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, cursor: c };
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
