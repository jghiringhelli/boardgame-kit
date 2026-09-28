import { describe, it, expect } from 'vitest';
import { drawInto, drawOne, keyedShuffle } from '../src/deck';

// A no-op-ish shuffle stand-in that reverses the array, just so tests can
// assert exactly what got shuffled in without needing real randomness.
const reverseShuffle = <T>(arr: readonly T[]): T[] => arr.slice().reverse();

describe('drawInto', () => {
  it('draws straight off the deck while it has cards', () => {
    const deck = [1, 2, 3];
    const hand: number[] = [];
    const discard: number[] = [];
    drawInto(deck, hand, discard, 2, reverseShuffle);
    expect(hand).toEqual([1, 2]);
    expect(deck).toEqual([3]);
  });

  it('reshuffles the discard into the deck once it runs dry', () => {
    const deck: number[] = [];
    const hand: number[] = [];
    const discard = [1, 2, 3];
    drawInto(deck, hand, discard, 2, reverseShuffle);
    expect(discard).toEqual([]);
    // reverseShuffle([1,2,3]) = [3,2,1]; drawing 2 takes 3 then 2, leaving 1 in the deck
    expect(hand).toEqual([3, 2]);
    expect(deck).toEqual([1]);
  });

  it('stops silently (does not throw) if both deck and discard run out', () => {
    const deck: number[] = [];
    const hand: number[] = [];
    const discard: number[] = [];
    expect(() => drawInto(deck, hand, discard, 5, reverseShuffle)).not.toThrow();
    expect(hand).toEqual([]);
  });

  it('can reshuffle mid-draw (deck runs dry partway through the requested count)', () => {
    const deck = [1];
    const hand: number[] = [];
    const discard = [2, 3];
    drawInto(deck, hand, discard, 3, reverseShuffle);
    expect(hand).toEqual([1, 3, 2]); // 1 from deck, then reshuffled discard [3,2]
    expect(deck).toEqual([]);
  });
});

describe('drawOne', () => {
  it('draws the top of the deck', () => {
    expect(drawOne([1, 2], [], reverseShuffle)).toBe(1);
  });

  it('reshuffles the discard in when the deck is empty', () => {
    expect(drawOne([], [1, 2, 3], reverseShuffle)).toBe(3); // reversed: [3,2,1]
  });

  it('returns null when both piles are empty', () => {
    expect(drawOne([], [], reverseShuffle)).toBeNull();
  });
});

describe('keyedShuffle', () => {
  it('is deterministic for a given key', () => {
    const a = keyedShuffle([1, 2, 3, 4, 5], 12345);
    const b = keyedShuffle([1, 2, 3, 4, 5], 12345);
    expect(a).toEqual(b);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    keyedShuffle(input, 1);
    expect(input).toEqual([1, 2, 3]);
  });

  it('preserves every element', () => {
    const input = [1, 2, 3, 4, 5];
    expect(keyedShuffle(input, 7).slice().sort()).toEqual(input.slice().sort());
  });

  it('different keys usually produce different permutations', () => {
    const a = keyedShuffle([1, 2, 3, 4, 5, 6, 7, 8], 1);
    const b = keyedShuffle([1, 2, 3, 4, 5, 6, 7, 8], 2);
    expect(a).not.toEqual(b);
  });
});

// Reference formulas copied verbatim from meq's pre-extraction call sites
// (src/engine/corruption.ts's localShuffle, src/engine/sauronmech.ts's
// drawPlots, src/engine/setup.ts's seedSauronHands) — locks in that
// keyedShuffle is bit-for-bit identical to all three, since existing saved
// games' seeds must keep reshuffling their side decks exactly as before.
describe('bit-for-bit parity with the pre-extraction meq call sites', () => {
  it('matches corruption.ts localShuffle (internal seed ^ 0x51ec7)', () => {
    function referenceLocalShuffle(ids: number[], seed: number): number[] {
      const a = [...ids];
      let r = (seed ^ 0x51ec7) >>> 0;
      const rand = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 0x100000000; };
      for (let j = a.length - 1; j > 0; j--) { const t = Math.floor(rand() * (j + 1)); [a[j], a[t]] = [a[t], a[j]]; }
      return a;
    }
    const ids = [10, 20, 30, 40, 50, 60, 70];
    for (const seed of [0, 1, 42, 999999, -7]) {
      expect(keyedShuffle(ids, (seed ^ 0x51ec7) >>> 0)).toEqual(referenceLocalShuffle(ids, seed));
    }
  });

  it('matches sauronmech.ts drawPlots inline shuffle (seed ^ (0x91007 + turn))', () => {
    function referenceShuffle(d: number[], seed: number, turn: number): number[] {
      let r = (seed ^ (0x91007 + turn)) >>> 0;
      const rand = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 0x100000000; };
      const arr = [...d];
      for (let j = arr.length - 1; j > 0; j--) { const t = Math.floor(rand() * (j + 1)); [arr[j], arr[t]] = [arr[t], arr[j]]; }
      return arr;
    }
    const cards = [1, 2, 3, 4, 5, 6];
    for (const [seed, turn] of [[0, 0], [12345, 3], [-100, 10]] as [number, number][]) {
      expect(keyedShuffle(cards, (seed ^ (0x91007 + turn)) >>> 0)).toEqual(referenceShuffle(cards, seed, turn));
    }
  });

  it('matches setup.ts seedSauronHands inline shuffle (seed ^ 0x5c0b1a7)', () => {
    function referenceShuffle(deck: number[], seed: number): number[] {
      let r = (seed ^ 0x5c0b1a7) >>> 0;
      const rand = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 0x100000000; };
      const d = [...deck];
      for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      return d;
    }
    const plots = Array.from({ length: 18 }, (_, i) => i);
    for (const seed of [0, 1, 555, -42]) {
      expect(keyedShuffle(plots, (seed ^ 0x5c0b1a7) >>> 0)).toEqual(referenceShuffle(plots, seed));
    }
  });
});
