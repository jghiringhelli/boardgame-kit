// Namespaced localStorage helpers shared by every game: try/catch-wrapped
// primitives (private browsing / quota-exceeded / SSR must never throw),
// plus small factories for three recurring persistence patterns every title
// in this workspace needs: a single resumable in-progress save, an
// append-only capped history of finished games, free-text per-game notes,
// and a last-uncaught-error stash for bug reports.
//
// Notes are deliberately never part of a game's own state: keeping them in a
// separate localStorage slot means they can never leak over the network or
// be clobbered by another player's state broadcast, even in online play.

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* quota / disabled */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export const storage = { safeGet, safeSet, safeRemove };

export interface SavedGame<TState, TMeta> {
  state: TState;
  meta: TMeta;
  savedAt: string;
}

interface SaveEnvelope<TState, TMeta> {
  schema: number;
  savedAt: string;
  state: TState;
  meta: TMeta;
}

/** One resumable "current game" slot, namespaced per game (e.g. 'meq'). */
export function createSaveSlot<TState, TMeta = Record<string, unknown>>(namespace: string, schema = 1) {
  const KEY = `${namespace}.save.v1`;
  return {
    save(state: TState, meta: TMeta = {} as TMeta): void {
      const env: SaveEnvelope<TState, TMeta> = { schema, savedAt: new Date().toISOString(), state, meta };
      try { safeSet(KEY, JSON.stringify(env)); } catch { /* non-serializable state — skip */ }
    },
    load(): SavedGame<TState, TMeta> | null {
      const raw = safeGet(KEY);
      if (!raw) return null;
      try {
        const env = JSON.parse(raw) as SaveEnvelope<TState, TMeta>;
        if (env.schema !== schema || !env.state) return null;
        return { state: env.state, meta: env.meta, savedAt: env.savedAt };
      } catch { return null; }
    },
    has(): boolean { return safeGet(KEY) !== null; },
    clear(): void { safeRemove(KEY); },
  };
}

/** An append-only, size-capped history of finished games. */
export function createHistoryStore<TEntry>(namespace: string, limit = 100) {
  const KEY = `${namespace}.history.v1`;
  const load = (): TEntry[] => {
    const raw = safeGet(KEY);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? (list as TEntry[]) : [];
    } catch { return []; }
  };
  return {
    record(entry: TEntry): void {
      const list = load();
      list.unshift(entry);
      safeSet(KEY, JSON.stringify(list.slice(0, limit)));
    },
    load,
    clear(): void { safeRemove(KEY); },
  };
}

/** Free-text per-game notes, kept out of GameState/network entirely. */
export function createNotesStore(namespace: string) {
  const key = (gameKey: string | number, author = 'me') => `${namespace}.notes.v1.${gameKey}.${author}`;
  return {
    load(gameKey: string | number, author = 'me'): string {
      return safeGet(key(gameKey, author)) ?? '';
    },
    save(gameKey: string | number, text: string, author = 'me'): void {
      if (text.trim() === '') { safeRemove(key(gameKey, author)); return; }
      safeSet(key(gameKey, author), text);
    },
  };
}

/** Last-uncaught-error stash, so an ErrorBoundary fallback screen (which has
 *  no live in-memory game state of its own) can still attach it to a bug report. */
export interface CrashInfo {
  message: string;
  stack?: string;
  componentStack?: string;
}

export function createCrashStore(namespace: string) {
  const KEY = `${namespace}.last-crash.v1`;
  return {
    record(crash: CrashInfo): void {
      try { safeSet(KEY, JSON.stringify({ ...crash, at: new Date().toISOString() })); } catch { /* ignore */ }
    },
    load(): (CrashInfo & { at: string }) | null {
      const raw = safeGet(KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    clear(): void { safeRemove(KEY); },
  };
}
