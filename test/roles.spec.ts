import { describe, it, expect } from 'vitest';
import {
  emptyRoster, mayDispatch, seatsOf, aiSeats, assignSeat, releasePlayer,
  markDisconnected, markReconnected, type Roster,
} from '../src/roles';

type Seat = 'a' | 'b' | 'flowless';

describe('emptyRoster', () => {
  it('opens every given seat', () => {
    const r = emptyRoster<Seat>(['a', 'b']);
    expect(r).toEqual({ a: { kind: 'open' }, b: { kind: 'open' } });
  });
});

describe('mayDispatch', () => {
  const roster: Roster<Seat> = { a: { kind: 'human', playerId: 'p1', name: 'Alice' }, b: { kind: 'ai' } };

  it('the host may dispatch anything, including flow actions', () => {
    expect(mayDispatch(roster, 'anyone', true, 'flow')).toBe(true);
    expect(mayDispatch(roster, 'anyone', true, 'a')).toBe(true);
  });

  it('nobody but the host may dispatch a flow action', () => {
    expect(mayDispatch(roster, 'p1', false, 'flow')).toBe(false);
  });

  it("a seat's owning player may dispatch actions belonging to that seat", () => {
    expect(mayDispatch(roster, 'p1', false, 'a')).toBe(true);
  });

  it('a different player may not dispatch actions for a seat they do not own', () => {
    expect(mayDispatch(roster, 'p2', false, 'a')).toBe(false);
  });

  it('nobody may dispatch for an AI or open seat', () => {
    expect(mayDispatch(roster, 'p1', false, 'b')).toBe(false);
  });

  it('a disconnected human still owns their seat (no auto-AI-takeover mid-dispatch check)', () => {
    const disc: Roster<Seat> = { a: { kind: 'human', playerId: 'p1', name: 'Alice', connected: false } };
    expect(mayDispatch(disc, 'p1', false, 'a')).toBe(true);
  });
});

describe('seatsOf / aiSeats', () => {
  const roster: Roster<Seat> = {
    a: { kind: 'human', playerId: 'p1', name: 'Alice' },
    b: { kind: 'human', playerId: 'p1', name: 'Alice' }, // same player, two seats
    flowless: { kind: 'ai' },
  };

  it('lists every seat a player controls', () => {
    expect(seatsOf(roster, 'p1').sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for a player who holds no seats', () => {
    expect(seatsOf(roster, 'p2')).toEqual([]);
  });

  it('lists every non-human seat (ai or open) for the AI to run', () => {
    expect(aiSeats(roster)).toEqual(['flowless']);
  });
});

describe('assignSeat', () => {
  it('assigns a seat without mutating the original roster (immutable)', () => {
    const r0 = emptyRoster<Seat>(['a', 'b']);
    const r1 = assignSeat(r0, 'a', { kind: 'human', playerId: 'p1', name: 'Alice' });
    expect(r0.a).toEqual({ kind: 'open' }); // original untouched
    expect(r1.a).toEqual({ kind: 'human', playerId: 'p1', name: 'Alice' });
  });
});

describe('releasePlayer / markDisconnected / markReconnected', () => {
  const base: Roster<Seat> = {
    a: { kind: 'human', playerId: 'p1', name: 'Alice' },
    b: { kind: 'human', playerId: 'p2', name: 'Bob' },
  };

  it('releasePlayer opens every seat that player held, leaving others untouched', () => {
    const r = releasePlayer(base, 'p1');
    expect(r.a).toEqual({ kind: 'open' });
    expect(r.b).toEqual(base.b);
  });

  it('markDisconnected flags a seat offline without releasing it (still reserved)', () => {
    const r = markDisconnected(base, 'p1');
    expect(r.a).toEqual({ kind: 'human', playerId: 'p1', name: 'Alice', connected: false });
    expect(mayDispatch(r, 'p1', false, 'a')).toBe(true); // still theirs, just flagged
  });

  it('markReconnected restores a disconnected seat to connected', () => {
    const disconnected = markDisconnected(base, 'p1');
    const r = markReconnected(disconnected, 'p1');
    expect(r.a).toEqual({ kind: 'human', playerId: 'p1', name: 'Alice', connected: true });
  });

  it('a departed player leaves no trace on a re-claimed seat', () => {
    const released = releasePlayer(base, 'p1');
    const reclaimed = assignSeat(released, 'a', { kind: 'human', playerId: 'p3', name: 'Carol' });
    expect(mayDispatch(reclaimed, 'p1', false, 'a')).toBe(false);
    expect(mayDispatch(reclaimed, 'p3', false, 'a')).toBe(true);
  });
});
