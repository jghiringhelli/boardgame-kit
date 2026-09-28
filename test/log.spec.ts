import { describe, it, expect } from 'vitest';
import { createLogger, type LogEventBase } from '../src/log';

interface Ctx { turn: number; phase: string }
interface Event extends LogEventBase, Ctx {}
interface TState { turn: number; phase: string; log: Event[] }

describe('createLogger', () => {
  const log = createLogger<TState, Ctx>((s) => ({ turn: s.turn, phase: s.phase }));

  it('appends a sequential, ordered event with the universal fields', () => {
    const state: TState = { turn: 1, phase: 'setup', log: [] };
    log(state, 'draw', 'Hero', 'drew a card');
    expect(state.log).toEqual([{ seq: 0, turn: 1, phase: 'setup', type: 'draw', actor: 'Hero', detail: 'drew a card' }]);
  });

  it('merges in the per-game context at the moment of logging (not a stale snapshot)', () => {
    const state: TState = { turn: 1, phase: 'setup', log: [] };
    log(state, 'a', 'Hero', 'first');
    state.turn = 2;
    state.phase = 'combat';
    log(state, 'b', 'Hero', 'second');
    expect(state.log[0]).toMatchObject({ turn: 1, phase: 'setup' });
    expect(state.log[1]).toMatchObject({ turn: 2, phase: 'combat' });
  });

  it('increments seq for every event, regardless of type', () => {
    const state: TState = { turn: 1, phase: 'setup', log: [] };
    log(state, 'a', 'Hero', '1');
    log(state, 'b', 'Sauron', '2');
    log(state, 'c', 'Hero', '3');
    expect(state.log.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it('attaches optional structured data only when provided', () => {
    const state: TState = { turn: 1, phase: 'setup', log: [] };
    log(state, 'a', 'Hero', 'no data');
    log(state, 'b', 'Hero', 'with data', { amount: 3 });
    expect(state.log[0]!.data).toBeUndefined();
    expect(state.log[1]!.data).toEqual({ amount: 3 });
  });
});
