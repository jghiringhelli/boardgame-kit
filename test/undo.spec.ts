import { describe, it, expect } from 'vitest';
import { createUndoStack } from '../src/undo';

interface TState { round: number; items: string[] }

describe('createUndoStack', () => {
  it('starts with no current state', () => {
    const stack = createUndoStack<TState>();
    expect(stack.current()).toBeNull();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  it('push() makes the new state current', () => {
    const stack = createUndoStack<TState>();
    stack.push({ round: 1, items: [] });
    expect(stack.current()).toEqual({ round: 1, items: [] });
  });

  it('undo() restores the previous state', () => {
    const stack = createUndoStack<TState>();
    stack.push({ round: 1, items: [] });
    stack.push({ round: 2, items: ['a'] });
    expect(stack.undo()).toEqual({ round: 1, items: [] });
    expect(stack.current()).toEqual({ round: 1, items: [] });
  });

  it('redo() re-applies an undone state', () => {
    const stack = createUndoStack<TState>();
    stack.push({ round: 1, items: [] });
    stack.push({ round: 2, items: ['a'] });
    stack.undo();
    expect(stack.redo()).toEqual({ round: 2, items: ['a'] });
  });

  it('pushing after an undo discards the redo-able future', () => {
    const stack = createUndoStack<TState>();
    stack.push({ round: 1, items: [] });
    stack.push({ round: 2, items: ['a'] });
    stack.undo();
    stack.push({ round: 3, items: ['b'] });
    expect(stack.canRedo()).toBe(false);
    expect(stack.redo()).toBeNull();
  });

  it('undo() returns null when there is nothing before the first state', () => {
    const stack = createUndoStack<TState>();
    stack.push({ round: 1, items: [] });
    expect(stack.undo()).toBeNull();
    expect(stack.current()).toEqual({ round: 1, items: [] });
  });

  it('mutating a pushed object afterwards does not affect the stored snapshot', () => {
    const stack = createUndoStack<TState>();
    const state = { round: 1, items: [] as string[] };
    stack.push(state);
    state.items.push('mutated after push');
    expect(stack.current()).toEqual({ round: 1, items: [] });
  });

  it('caps history at maxSize, dropping the oldest snapshot', () => {
    const stack = createUndoStack<TState>(2);
    stack.push({ round: 1, items: [] });
    stack.push({ round: 2, items: [] });
    stack.push({ round: 3, items: [] });
    // Only the last 2 are kept — undoing past round 3 lands on round 2, not round 1.
    expect(stack.undo()).toEqual({ round: 2, items: [] });
    expect(stack.undo()).toBeNull();
  });

  it('clear() drops all history', () => {
    const stack = createUndoStack<TState>();
    stack.push({ round: 1, items: [] });
    stack.clear();
    expect(stack.current()).toBeNull();
    expect(stack.canUndo()).toBe(false);
  });
});
