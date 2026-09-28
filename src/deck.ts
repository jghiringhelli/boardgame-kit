// Generic card-deck plumbing shared by every game: draw N cards from a deck
// into a hand, recycling the discard pile back into the deck (reshuffled)
// when it runs dry.
//
// The shuffle itself is NOT baked in here — pass whichever seeded shuffle you
// want (the shared gameplay stream from boardgame-kit/rng, or `keyedShuffle`
// below for a side-channel one) so callers keep full control over their own
// RNG cursor/determinism story.

export function drawInto<T>(
  deck: T[], hand: T[], discard: T[], n: number, shuffle: (arr: readonly T[]) => T[],
): void {
  for (let i = 0; i < n; i++) {
    if (deck.length === 0) {
      if (discard.length === 0) return;
      deck.push(...shuffle(discard));
      discard.length = 0;
    }
    hand.push(deck.shift()!);
  }
}

/** Draw a single card, reshuffling the discard back in if the deck is dry.
 *  Returns null if both are empty. */
export function drawOne<T>(deck: T[], discard: T[], shuffle: (arr: readonly T[]) => T[]): T | null {
  if (deck.length === 0) {
    if (discard.length === 0) return null;
    deck.push(...shuffle(discard));
    discard.length = 0;
  }
  return deck.length ? deck.shift()! : null;
}

/**
 * A second, independent deterministic shuffle stream (a small LCG), for
 * "side-channel" shuffles — building a deck at setup, or recycling a
 * secondary discard pile — that must stay reproducible from the game seed
 * but shouldn't advance/perturb the main gameplay rng cursor
 * (boardgame-kit/rng's nextInt/shuffle) mid-game, since that would ripple
 * into every unrelated draw/combat-card-shuffle downstream of it.
 *
 * Callers derive `key` from whatever should make each call's stream distinct
 * (e.g. `seed ^ 0x51ec7`, or `seed ^ (0x91007 + turn)`) — reusing the same
 * key replays the exact same permutation, which is fine for a one-shot setup
 * shuffle but wrong for a discard pile recycled turn after turn.
 */
export function keyedShuffle<T>(items: readonly T[], key: number): T[] {
  const a = items.slice();
  let r = key >>> 0;
  const rand = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 0x100000000; };
  for (let j = a.length - 1; j > 0; j--) {
    const t = Math.floor(rand() * (j + 1));
    [a[j], a[t]] = [a[t], a[j]];
  }
  return a;
}
