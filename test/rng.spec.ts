import { describe, it, expect } from 'vitest';
import { nextRandom, nextInt, shuffle, weightedPick } from '../src/rng';

// Reference implementation copied verbatim from meq's original
// src/engine/rng.ts (pre-extraction) — locks in that this module's output is
// bit-for-bit identical, since existing saved games' `rngCursor` must
// continue producing the exact same stream after this refactor.
function referenceNextInt(cursor: number, maxExclusive: number): { value: number; cursor: number } {
  let t = (cursor = (cursor + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value: Math.floor(r * maxExclusive), cursor };
}

describe('bit-for-bit parity with the pre-extraction meq implementation', () => {
  it('matches the reference formula across many seeds and draws', () => {
    let cursor = 0;
    let refCursor = 0;
    for (let i = 0; i < 1000; i++) {
      const a = nextInt(cursor, 100);
      const b = referenceNextInt(refCursor, 100);
      expect(a).toEqual(b);
      cursor = a.cursor;
      refCursor = b.cursor;
    }
  });
});

describe('nextRandom', () => {
  it('is deterministic: same cursor always produces the same result', () => {
    const a = nextRandom(12345);
    const b = nextRandom(12345);
    expect(a).toEqual(b);
  });

  it('returns a value in [0, 1)', () => {
    let cursor = 1;
    for (let i = 0; i < 200; i++) {
      const r = nextRandom(cursor);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      cursor = r.cursor;
    }
  });

  it('advances to a different cursor (stream does not stall)', () => {
    const a = nextRandom(0);
    const b = nextRandom(a.cursor);
    expect(b.cursor).not.toBe(a.cursor);
  });
});

describe('nextInt', () => {
  it('returns an integer strictly below maxExclusive', () => {
    let cursor = 42;
    for (let i = 0; i < 500; i++) {
      const r = nextInt(cursor, 6);
      expect(Number.isInteger(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
    }
  });
});

describe('shuffle', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    shuffle(7, input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves every element (a permutation, not a subset)', () => {
    const input = [1, 2, 3, 4, 5];
    const { items } = shuffle(7, input);
    expect(items.slice().sort()).toEqual(input.slice().sort());
  });

  it('is deterministic for a given seed', () => {
    const a = shuffle(99, [1, 2, 3, 4, 5, 6, 7, 8]);
    const b = shuffle(99, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.items).toEqual(b.items);
    expect(a.cursor).toBe(b.cursor);
  });

  it('advances the cursor so consecutive shuffles are independent', () => {
    const a = shuffle(1, [1, 2, 3]);
    const b = shuffle(a.cursor, [1, 2, 3]);
    // Not a hard guarantee for every seed, but with the mulberry32 stream and
    // 3 elements, two consecutive draws differing is overwhelmingly likely —
    // the real assertion is just that the cursor moved at all.
    expect(a.cursor).not.toBe(1);
    expect(b.cursor).not.toBe(a.cursor);
  });
});

describe('weightedPick', () => {
  it('always picks the only weighted option when others are 0', () => {
    let cursor = 1;
    for (let i = 0; i < 50; i++) {
      const r = weightedPick(cursor, [0, 5, 0]);
      expect(r.value).toBe(1);
      cursor = r.cursor;
    }
  });

  it('never returns an out-of-range index', () => {
    let cursor = 3;
    for (let i = 0; i < 300; i++) {
      const r = weightedPick(cursor, [1, 2, 3, 4]);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(4);
      cursor = r.cursor;
    }
  });

  it('is deterministic for a given cursor', () => {
    const a = weightedPick(42, [1, 1, 1]);
    const b = weightedPick(42, [1, 1, 1]);
    expect(a).toEqual(b);
  });

  it('respects proportional weighting over many draws', () => {
    let cursor = 7;
    const counts = [0, 0];
    for (let i = 0; i < 5000; i++) {
      const r = weightedPick(cursor, [1, 9]); // ~10% / ~90%
      counts[r.value]++;
      cursor = r.cursor;
    }
    const ratio = counts[1]! / (counts[0]! + counts[1]!);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.98);
  });

  it('treats an all-zero weight list as a safe no-op (returns index 0)', () => {
    const r = weightedPick(1, [0, 0, 0]);
    expect(r.value).toBe(0);
  });
});
