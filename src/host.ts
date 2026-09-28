// Pure host-authoritative reducer helpers. The host is the referee: it applies
// every action (its own and remote), enforcing per-seat ownership, and owns
// the canonical (game, roster) pair. Kept transport-free so it can be unit-
// tested and reused by the UI without duplicating rules.
//
// Generic over the game's own state/action/seat types: each game supplies its
// `apply` reducer and a `roleOf` mapping (which seat, or the shared `'flow'`
// role, an action belongs to) — this module only enforces "may this player
// perform this action" and threads it through.
import {
  mayDispatch, assignSeat, emptyRoster, releasePlayer, type ActionRole, type Roster,
} from './roles';

/**
 * Apply an action a client submitted. Returns the unchanged state if the
 * player does not own the seat the action belongs to (or, for shared flow
 * actions, if they are not the host — caller passes `isHost` accordingly).
 */
export function applyRemoteAction<TState, TAction, TSeat extends string>(
  game: TState, roster: Roster<TSeat> | null, playerId: string, isHost: boolean, action: TAction,
  roleOf: (action: TAction) => ActionRole<TSeat>,
  apply: (state: TState, action: TAction) => TState,
): TState {
  if (!mayDispatch(roster ?? {}, playerId, isHost, roleOf(action))) return game;
  return apply(game, action);
}

/** Claim or release a seat, returning the next roster (immutable). */
export function claimSeat<TSeat extends string>(
  roster: Roster<TSeat> | null, allSeats: TSeat[], playerId: string, name: string, seat: TSeat, release: boolean,
): Roster<TSeat> {
  const base = roster ?? emptyRoster(allSeats);
  return assignSeat(base, seat, release ? { kind: 'open' } : { kind: 'human', playerId, name });
}

/** Free every seat a departing/kicked player held (they revert to open → AI). */
export function dropPlayer<TSeat extends string>(roster: Roster<TSeat> | null, playerId: string): Roster<TSeat> | null {
  return roster ? releasePlayer(roster, playerId) : roster;
}
