import { describe, it, expect } from 'vitest';
import { nextRandom, nextInt, shuffle } from '../src/rng';

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
      cursor = r.cursor;
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
