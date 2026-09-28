// A generic snapshot-based undo/redo stack: works over ANY serializable
// state, since it never inspects the state's shape — it just keeps deep
// clones (via structuredClone, falling back to JSON round-trip) and moves an
// index back and forth through them. Useful for a "take back a move"
// dev/solo-play feature, or debugging/time-travel, in any game in this
// workspace.
//
// This is deliberately NOT an action-replay log (storing actions and
// re-applying them) — it stores full snapshots, which is simpler and
// correct for any state regardless of whether the game's own reducer is
// perfectly pure/deterministic, at the cost of more memory for large states.

function cloneState<T>(state: T): T {
  const g = globalThis as { structuredClone?: <U>(x: U) => U };
  if (g.structuredClone) return g.structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as T;
}

export interface UndoStack<T> {
  /** Push a new state onto the stack, becoming the current one. Discards any
   *  redo history beyond the current point (the usual undo/redo semantics:
   *  making a new move after undoing erases the redone-away future). */
  push(state: T): void;
  /** Step back one state. Returns null if there is nothing to undo to. */
  undo(): T | null;
  /** Step forward one state (only valid right after an undo(), before any
   *  push()). Returns null if there is nothing to redo. */
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** The current state (the top of the stack), or null if nothing was ever pushed. */
  current(): T | null;
  /** Drop all history, keeping only the current state (or nothing). */
  clear(): void;
}

/** Creates an undo/redo stack capped at `maxSize` snapshots (oldest dropped first). */
export function createUndoStack<T>(maxSize = 50): UndoStack<T> {
  let history: T[] = [];
  let index = -1; // points at the current state within `history`

  return {
    push(state: T): void {
      history = history.slice(0, index + 1);
      history.push(cloneState(state));
      if (history.length > maxSize) history.shift();
      index = history.length - 1;
    },
    undo(): T | null {
      if (index <= 0) return null;
      index -= 1;
      return cloneState(history[index]!);
    },
    redo(): T | null {
      if (index < 0 || index >= history.length - 1) return null;
      index += 1;
      return cloneState(history[index]!);
    },
    canUndo(): boolean { return index > 0; },
    canRedo(): boolean { return index >= 0 && index < history.length - 1; },
    current(): T | null { return index >= 0 ? cloneState(history[index]!) : null; },
    clear(): void { history = []; index = -1; },
  };
}
