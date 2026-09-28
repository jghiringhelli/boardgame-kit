import { describe, it, expect } from 'vitest';
import { applyRemoteAction, claimSeat, dropPlayer } from '../src/host';
import { emptyRoster, type Roster, type ActionRole } from '../src/roles';

type Seat = 'a' | 'b';
interface TState { n: number; log: string[] }
type TAction = { kind: 'inc'; seat: Seat } | { kind: 'advance' };

const roleOf = (a: TAction): ActionRole<Seat> => (a.kind === 'advance' ? 'flow' : a.seat);
const apply = (s: TState, a: TAction): TState =>
  a.kind === 'inc' ? { ...s, n: s.n + 1, log: [...s.log, `inc:${a.seat}`] } : { ...s, log: [...s.log, 'advance'] };

describe('applyRemoteAction', () => {
  const roster: Roster<Seat> = { a: { kind: 'human', playerId: 'p1', name: 'Alice' }, b: { kind: 'ai' } };
  const state: TState = { n: 0, log: [] };

  it("applies an action submitted by the seat's own owning player", () => {
    const out = applyRemoteAction(state, roster, 'p1', false, { kind: 'inc', seat: 'a' }, roleOf, apply);
    expect(out.n).toBe(1);
    expect(out.log).toEqual(['inc:a']);
  });

  it('rejects (returns unchanged state for) an action from a non-owning player', () => {
    const out = applyRemoteAction(state, roster, 'p2', false, { kind: 'inc', seat: 'a' }, roleOf, apply);
    expect(out).toBe(state); // reference-equal: no-op
  });

  it('rejects a flow action from anyone but the host', () => {
    const out = applyRemoteAction(state, roster, 'p1', false, { kind: 'advance' }, roleOf, apply);
    expect(out).toBe(state);
  });

  it('the host may apply any action, including flow, regardless of roster', () => {
    const out1 = applyRemoteAction(state, roster, 'host', true, { kind: 'advance' }, roleOf, apply);
    expect(out1.log).toEqual(['advance']);
    const out2 = applyRemoteAction(state, roster, 'host', true, { kind: 'inc', seat: 'b' }, roleOf, apply);
    expect(out2.n).toBe(1);
  });

  it('treats a null roster as fully open (nobody but the host may act)', () => {
    const out = applyRemoteAction(state, null, 'p1', false, { kind: 'inc', seat: 'a' }, roleOf, apply);
    expect(out).toBe(state);
  });
});

describe('claimSeat', () => {
  it('claims an open seat for a new player', () => {
    const r0 = emptyRoster<Seat>(['a', 'b']);
    const r1 = claimSeat(r0, ['a', 'b'], 'p1', 'Alice', 'a', false);
    expect(r1.a).toEqual({ kind: 'human', playerId: 'p1', name: 'Alice' });
    expect(r1.b).toEqual({ kind: 'open' }); // untouched
  });

  it('builds a fresh roster from allSeats when none exists yet', () => {
    const r1 = claimSeat(null, ['a', 'b'], 'p1', 'Alice', 'a', false);
    expect(r1.a).toEqual({ kind: 'human', playerId: 'p1', name: 'Alice' });
    expect(r1.b).toEqual({ kind: 'open' });
  });

  it('releases a seat back to open', () => {
    const r0 = claimSeat(null, ['a', 'b'], 'p1', 'Alice', 'a', false);
    const r1 = claimSeat(r0, ['a', 'b'], 'p1', 'Alice', 'a', true);
    expect(r1.a).toEqual({ kind: 'open' });
  });
});

describe('dropPlayer', () => {
  it('frees every seat a departing player held', () => {
    const r0 = claimSeat(null, ['a', 'b'], 'p1', 'Alice', 'a', false);
    const r1 = dropPlayer(r0, 'p1');
    expect(r1?.a).toEqual({ kind: 'open' });
  });

  it('passes through a null roster unchanged', () => {
    expect(dropPlayer(null, 'p1')).toBeNull();
  });
});
