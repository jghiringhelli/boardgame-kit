// Append-only structured event log shared by every game: every event is
// captured as an ordered record so a whole session can be dumped to JSON and
// analysed later. `type`/`actor`/`detail`/`data`/`seq` are universal; a
// per-game `getContext` callback supplies whatever extra fields matter for
// that game (turn/round/phase/side, etc.), flattened onto each event.

export interface LogEventBase {
  seq: number;
  type: string;
  actor: string;
  detail: string;
  data?: Record<string, unknown>;
}

export type LoggableState<TEvent> = { log: TEvent[] };

/**
 * Builds a `log(state, type, actor, detail, data?)` function bound to a
 * particular game's log field and per-event context shape.
 *
 * `getContext(state)` is called once per event and its returned fields are
 * merged onto the event (before `type`/`actor`/`detail`/`data`, so the
 * universal fields always win in case of a name clash).
 */
export function createLogger<
  TState extends LoggableState<TEvent>,
  TContext extends object,
  TEvent extends LogEventBase = LogEventBase & TContext,
>(getContext: (state: TState) => TContext) {
  return function log(
    state: TState,
    type: string,
    actor: string,
    detail: string,
    data?: Record<string, unknown>,
  ): void {
    const e = {
      ...getContext(state),
      seq: state.log.length,
      type,
      actor,
      detail,
      ...(data ? { data } : {}),
    } as unknown as TEvent;
    state.log.push(e);
  };
}
