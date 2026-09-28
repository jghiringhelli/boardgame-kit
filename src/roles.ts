// Seat / controller model for multiplayer. Pure and engine-agnostic: the game
// engine never knows who controls a seat — the session layer decides who may
// dispatch a given action and which seats the AI must run for.
//
// A "seat" is whatever the host game calls its player slots (a faction id, a
// hero/Sauron side, etc.) — this module only needs it to be a string. Each
// seat is controlled by a human player, by the AI, or is open (unclaimed →
// AI at runtime).
export type Controller =
  // `connected` defaults to true when omitted (kept optional for old saves).
  | { kind: 'human'; playerId: string; name: string; connected?: boolean }
  | { kind: 'ai' }
  | { kind: 'open' };

export type Roster<TSeat extends string> = Partial<Record<TSeat, Controller>>;

/** A fresh roster with every given seat open (→ AI until claimed). */
export function emptyRoster<TSeat extends string>(seats: TSeat[]): Roster<TSeat> {
  const r: Roster<TSeat> = {};
  for (const seat of seats) r[seat] = { kind: 'open' };
  return r;
}

/** Which "role" (a seat, or the shared `'flow'` role for game-flow actions
 *  like advancing a phase) an action belongs to. Each game supplies its own
 *  `roleOf` mapping — this module only enforces "may this player perform an
 *  action belonging to this role", generically. */
export type ActionRole<TSeat extends string> = TSeat | 'flow';

/** May this player perform an action belonging to `role`? The host may do
 *  anything (it is the referee); otherwise the player must own the seat the
 *  action belongs to (or, for the shared `'flow'` role, be nobody — only the
 *  host drives phase flow). */
export function mayDispatch<TSeat extends string>(
  roster: Roster<TSeat>, playerId: string, isHost: boolean, role: ActionRole<TSeat>,
): boolean {
  if (isHost) return true;
  if (role === 'flow') return false; // only the host drives phase flow
  const c = roster[role];
  return !!c && c.kind === 'human' && c.playerId === playerId;
}

/** Seats a given player controls right now. */
export function seatsOf<TSeat extends string>(roster: Roster<TSeat>, playerId: string): TSeat[] {
  return (Object.entries(roster) as [TSeat, Controller | undefined][])
    .filter(([, c]) => c?.kind === 'human' && c.playerId === playerId)
    .map(([seat]) => seat);
}

/** Seats that no human holds → the AI must run them. */
export function aiSeats<TSeat extends string>(roster: Roster<TSeat>): TSeat[] {
  return (Object.entries(roster) as [TSeat, Controller | undefined][])
    .filter(([, c]) => c && c.kind !== 'human')
    .map(([seat]) => seat);
}

/** Assign a seat to a controller, returning a new roster (immutable). */
export function assignSeat<TSeat extends string>(
  roster: Roster<TSeat>, seat: TSeat, controller: Controller,
): Roster<TSeat> {
  return { ...roster, [seat]: controller };
}

/** Release every seat a departing/kicked player held (they revert to open →
 *  AI). Use markDisconnected for a network drop that should still give the
 *  same player (by persistent id) a chance to seamlessly resume. */
export function releasePlayer<TSeat extends string>(roster: Roster<TSeat>, playerId: string): Roster<TSeat> {
  const next: Roster<TSeat> = { ...roster };
  for (const [seat, c] of Object.entries(next) as [TSeat, Controller | undefined][]) {
    if (c?.kind === 'human' && c.playerId === playerId) next[seat] = { kind: 'open' };
  }
  return next;
}

/** A player's connection dropped: keep their seat(s) reserved (nobody else can
 *  claim them, no immediate AI takeover) but flag them as offline so the UI
 *  can show it. Pair with a host-side grace-period timer that calls
 *  releasePlayer if they never come back. */
export function markDisconnected<TSeat extends string>(roster: Roster<TSeat>, playerId: string): Roster<TSeat> {
  const next: Roster<TSeat> = { ...roster };
  for (const [seat, c] of Object.entries(next) as [TSeat, Controller | undefined][]) {
    if (c?.kind === 'human' && c.playerId === playerId) next[seat] = { ...c, connected: false };
  }
  return next;
}

/** The same persistent playerId reconnected before the grace period elapsed —
 *  seamlessly restore their seat(s) to connected, no re-claim needed. */
export function markReconnected<TSeat extends string>(roster: Roster<TSeat>, playerId: string): Roster<TSeat> {
  const next: Roster<TSeat> = { ...roster };
  for (const [seat, c] of Object.entries(next) as [TSeat, Controller | undefined][]) {
    if (c?.kind === 'human' && c.playerId === playerId) next[seat] = { ...c, connected: true };
  }
  return next;
}
