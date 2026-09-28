import { describe, it, expect, beforeEach } from 'vitest';
import {
  storage, createSaveSlot, createHistoryStore, createNotesStore, createCrashStore,
} from '../src/storage';

describe('storage (safeGet/safeSet/safeRemove)', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a value', () => {
    storage.safeSet('k', 'v');
    expect(storage.safeGet('k')).toBe('v');
    storage.safeRemove('k');
    expect(storage.safeGet('k')).toBeNull();
  });
});

interface TState { round: number; log: string[] }

describe('createSaveSlot', () => {
  beforeEach(() => localStorage.clear());
  const slot = createSaveSlot<TState, { seed: number }>('test-game');

  it('returns null when nothing is saved', () => {
    expect(slot.load()).toBeNull();
    expect(slot.has()).toBe(false);
  });

  it('saves and reloads state + meta', () => {
    slot.save({ round: 3, log: ['a'] }, { seed: 7 });
    expect(slot.has()).toBe(true);
    const loaded = slot.load();
    expect(loaded?.state).toEqual({ round: 3, log: ['a'] });
    expect(loaded?.meta).toEqual({ seed: 7 });
    expect(typeof loaded?.savedAt).toBe('string');
  });

  it('clear() removes the saved game', () => {
    slot.save({ round: 1, log: [] }, { seed: 1 });
    slot.clear();
    expect(slot.load()).toBeNull();
  });

  it('two slots in different namespaces do not collide', () => {
    const other = createSaveSlot<TState, { seed: number }>('other-game');
    slot.save({ round: 1, log: [] }, { seed: 1 });
    expect(other.load()).toBeNull();
  });
});

describe('createHistoryStore', () => {
  beforeEach(() => localStorage.clear());
  interface Entry { seed: number; winner: string | null }
  const history = createHistoryStore<Entry>('test-game');

  it('starts empty', () => {
    expect(history.load()).toEqual([]);
  });

  it('records entries most-recent-first', () => {
    history.record({ seed: 1, winner: 'Hero' });
    history.record({ seed: 2, winner: 'Sauron' });
    expect(history.load()).toEqual([{ seed: 2, winner: 'Sauron' }, { seed: 1, winner: 'Hero' }]);
  });

  it('caps the list at the configured limit', () => {
    const capped = createHistoryStore<Entry>('capped-game', 2);
    capped.record({ seed: 1, winner: null });
    capped.record({ seed: 2, winner: null });
    capped.record({ seed: 3, winner: null });
    expect(capped.load()).toHaveLength(2);
    expect(capped.load()[0]).toEqual({ seed: 3, winner: null });
  });

  it('clear() empties the history', () => {
    history.record({ seed: 1, winner: null });
    history.clear();
    expect(history.load()).toEqual([]);
  });
});

describe('createNotesStore', () => {
  beforeEach(() => localStorage.clear());
  const notes = createNotesStore('test-game');

  it('returns an empty string when nothing is saved', () => {
    expect(notes.load(42)).toBe('');
  });

  it('saves and loads notes for a game key', () => {
    notes.save(42, 'remember to defend the north');
    expect(notes.load(42)).toBe('remember to defend the north');
  });

  it('keys notes per author so different players never overwrite each other', () => {
    notes.save(42, 'alice notes', 'alice');
    notes.save(42, 'bob notes', 'bob');
    expect(notes.load(42, 'alice')).toBe('alice notes');
    expect(notes.load(42, 'bob')).toBe('bob notes');
  });

  it('saving an empty/whitespace string clears the slot instead of storing it', () => {
    notes.save(42, 'something');
    notes.save(42, '   ');
    expect(notes.load(42)).toBe('');
  });
});

describe('createCrashStore', () => {
  beforeEach(() => localStorage.clear());
  const crashes = createCrashStore('test-game');

  it('returns null when no crash is recorded', () => {
    expect(crashes.load()).toBeNull();
  });

  it('records and loads a crash with a timestamp attached', () => {
    crashes.record({ message: 'boom', stack: 'at foo' });
    const loaded = crashes.load();
    expect(loaded?.message).toBe('boom');
    expect(loaded?.stack).toBe('at foo');
    expect(typeof loaded?.at).toBe('string');
  });

  it('clear() removes the stashed crash', () => {
    crashes.record({ message: 'boom' });
    crashes.clear();
    expect(crashes.load()).toBeNull();
  });
});
