// Peer-to-peer multiplayer transport (WebRTC via PeerJS). Host-authoritative:
// the host holds the one true game state, applies every action (its own and
// remote), and broadcasts the resulting state to all clients. Clients never
// mutate state locally — they send actions to the host and render whatever
// state the host pushes back.
//
// This module is transport-only. The host's game logic (applying actions, AI,
// persistence) lives in the UI via the callbacks passed to useGameSession, so
// the engine stays completely unaware of the network.
import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { Roster } from './roles';
import { getLocalPlayerId } from './identity';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars
export function newGameCode(len = 5): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export interface NetOptions {
  /** Short prefix for PeerJS ids, to avoid clashes with other games/apps
   *  sharing the public PeerJS cloud broker (e.g. `'sctbg-'`, `'meq-'`). */
  idPrefix: string;
  /** Namespace passed to getLocalPlayerId (usually the same as idPrefix
   *  without the trailing dash), so persisted identities don't collide
   *  across games sharing a browser's localStorage. */
  identityNamespace: string;
  /** `globalThis` key an app can set to point at a local/self-hosted PeerJS
   *  broker instead of the public cloud one (great for tests and offline
   *  dev). Defaults to a per-game key derived from `identityNamespace` if
   *  omitted, e.g. `__MEQ_PEER__`. */
  globalOverrideKey?: string;
  /** Additional PeerJS options resolution, e.g. reading Vite env vars. Called
   *  once per connection attempt; return undefined to fall back to the
   *  public PeerJS cloud broker. */
  resolvePeerOptions?: () => PeerOptions | undefined;
}

function peerOptions(opts: NetOptions): PeerOptions | undefined {
  const key = opts.globalOverrideKey ?? `__${opts.identityNamespace.toUpperCase()}_PEER__`;
  const g = (globalThis as unknown as Record<string, { host?: string; port?: number; path?: string; secure?: boolean } | undefined>)[key];
  if (g?.host) return { host: g.host, port: g.port ?? 9000, path: g.path ?? '/', secure: !!g.secure };
  return opts.resolvePeerOptions?.();
}

export type NetRole = 'off' | 'host' | 'client';

export interface PeerInfo { playerId: string; name: string }

/** Wire protocol, generic over the game's state/action/seat types. */
export type Msg<TState, TAction, TSeat extends string> =
  | { type: 'hello'; name: string; playerId: string }
  | { type: 'state'; state: TState }
  | { type: 'roster'; roster: Roster<TSeat> }
  | { type: 'action'; action: TAction }
  | { type: 'claim'; seat: TSeat }
  | { type: 'release'; seat: TSeat }
  | { type: 'kicked' };

export interface SessionCallbacks<TState, TAction, TSeat extends string> {
  /** Host: a client (or the host UI) submitted an action. Apply + rebroadcast. */
  onRemoteAction?: (playerId: string, action: TAction) => void;
  /** Client: the host pushed a new authoritative state. */
  onState?: (state: TState) => void;
  /** Client: the host pushed the seated-players roster. */
  onRoster?: (roster: Roster<TSeat>) => void;
  /** Host: a client asked to (un)claim a seat. */
  onClaim?: (playerId: string, name: string, seat: TSeat, release: boolean) => void;
  /** Host: a player connected — `playerId` is their STABLE persistent id (see
   *  identity.ts), so a reconnecting player is recognized as the same person
   *  even though PeerJS gave their new connection a different network peer
   *  id underneath. */
  onJoin?: (playerId: string, name: string) => void;
  /** Host: a player disconnected (network-level) — `playerId` is their stable
   *  persistent id. Does NOT necessarily mean they're gone for good; the UI
   *  pairs this with a grace-period timer before fully releasing their seat(s). */
  onLeave?: (playerId: string) => void;
  /** Client: the host kicked us. */
  onKicked?: () => void;
}

export interface Net<TState, TAction, TSeat extends string> {
  role: NetRole;
  gameId: string | null;
  playerId: string;
  connected: boolean;
  error: string | null;
  peers: PeerInfo[];
  createHost: () => Promise<string>;
  join: (code: string, name: string) => Promise<void>;
  leave: () => void;
  /** Client → host: submit an action. On host this is a no-op (host applies directly). */
  sendAction: (action: TAction) => void;
  /** Client → host: (un)claim a seat. */
  claimSeat: (seat: TSeat, release?: boolean) => void;
  /** Host → clients: push the authoritative state. */
  broadcastState: (state: TState) => void;
  /** Host → clients: push the roster. */
  broadcastRoster: (roster: Roster<TSeat>) => void;
  /** Host: disconnect a player. */
  kick: (playerId: string) => void;
}

/**
 * React hook owning the PeerJS session. `cbs` may change every render; we read
 * it through a ref so connection handlers always see the latest callbacks.
 */
export function useGameSession<TState, TAction, TSeat extends string>(
  opts: NetOptions, cbs: SessionCallbacks<TState, TAction, TSeat>,
): Net<TState, TAction, TSeat> {
  type M = Msg<TState, TAction, TSeat>;
  const [role, setRole] = useState<NetRole>('off');
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  const toPeerId = (code: string) => opts.idPrefix + code.trim().toUpperCase();

  const peerRef = useRef<Peer | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map()); // host: network peer-id → conn
  // Host: stable persistent playerId (see identity.ts) ↔ current live
  // network peer-id. A reconnecting client gets a NEW network peer-id every
  // time (PeerJS assigns it randomly), but sends its unchanging persistent id
  // in `hello` — this map is how we recognize "the same person is back" and
  // route messages to whichever connection they currently hold.
  const personaToConnRef = useRef<Map<string, string>>(new Map());  // persistent id → network peer-id
  const connToPersonaRef = useRef<Map<string, string>>(new Map());  // network peer-id → persistent id
  const hostConnRef = useRef<DataConnection | null>(null);          // client: conn to host
  const cbsRef = useRef(cbs);
  cbsRef.current = cbs;

  const send = (conn: DataConnection, msg: M) => { try { conn.send(msg); } catch { /* dropped */ } };

  const broadcast = useCallback((msg: M) => {
    for (const conn of connsRef.current.values()) send(conn, msg);
  }, []);

  const createHost = useCallback(async (): Promise<string> => {
    const code = newGameCode();
    const peer = new Peer(toPeerId(code), peerOptions(opts));
    peerRef.current = peer;
    return new Promise<string>((resolve, reject) => {
      peer.on('open', () => {
        setRole('host');
        setGameId(code);
        setPlayerId('host');
        setConnected(true);
        resolve(code);
      });
      peer.on('error', (e) => { setError(String(e)); reject(e); });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          connsRef.current.set(conn.peer, conn);
        });
        conn.on('data', (raw) => {
          const msg = raw as M;
          if (msg.type === 'hello') {
            personaToConnRef.current.set(msg.playerId, conn.peer);
            connToPersonaRef.current.set(conn.peer, msg.playerId);
            setPeers((p) => [...p.filter((x) => x.playerId !== msg.playerId), { playerId: msg.playerId, name: msg.name }]);
            cbsRef.current.onJoin?.(msg.playerId, msg.name);
          } else if (msg.type === 'action') {
            const pid = connToPersonaRef.current.get(conn.peer) ?? conn.peer;
            cbsRef.current.onRemoteAction?.(pid, msg.action);
          } else if (msg.type === 'claim' || msg.type === 'release') {
            const pid = connToPersonaRef.current.get(conn.peer) ?? conn.peer;
            const name = peersNameOf(pid);
            cbsRef.current.onClaim?.(pid, name, msg.seat, msg.type === 'release');
          }
        });
        conn.on('close', () => {
          connsRef.current.delete(conn.peer);
          const pid = connToPersonaRef.current.get(conn.peer);
          connToPersonaRef.current.delete(conn.peer);
          if (pid) {
            // Only clear the persona→conn pointer if it still points at THIS
            // (now-closed) connection — a fast reconnect may already have
            // registered a newer one via a fresh 'hello'.
            if (personaToConnRef.current.get(pid) === conn.peer) personaToConnRef.current.delete(pid);
            setPeers((p) => p.filter((x) => x.playerId !== pid));
            cbsRef.current.onLeave?.(pid);
          }
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const peersNameOf = (pid: string): string => {
    for (const info of peersRef.current) if (info.playerId === pid) return info.name;
    return pid;
  };
  const peersRef = useRef<PeerInfo[]>([]);
  peersRef.current = peers;

  const join = useCallback(async (code: string, name: string): Promise<void> => {
    const myId = getLocalPlayerId(opts.identityNamespace);
    setPlayerId(myId); // stable identity, known immediately — no round trip needed
    const peer = new Peer(undefined as unknown as string, peerOptions(opts));
    peerRef.current = peer;
    return new Promise<void>((resolve, reject) => {
      peer.on('open', () => {
        const conn = peer.connect(toPeerId(code), { reliable: true });
        hostConnRef.current = conn;
        conn.on('open', () => {
          setRole('client');
          setGameId(code);
          setConnected(true);
          send(conn, { type: 'hello', name, playerId: myId });
          resolve();
        });
        conn.on('data', (raw) => {
          const msg = raw as M;
          if (msg.type === 'state') cbsRef.current.onState?.(msg.state);
          else if (msg.type === 'roster') cbsRef.current.onRoster?.(msg.roster);
          else if (msg.type === 'kicked') { cbsRef.current.onKicked?.(); leave(); }
        });
        conn.on('close', () => { setConnected(false); setError('Disconnected from host.'); });
      });
      peer.on('error', (e) => { setError(String(e)); reject(e); });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(() => {
    connsRef.current.forEach((c) => c.close());
    connsRef.current.clear();
    personaToConnRef.current.clear();
    connToPersonaRef.current.clear();
    hostConnRef.current?.close();
    hostConnRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    setRole('off'); setGameId(null); setConnected(false); setPeers([]);
  }, []);

  const sendAction = useCallback((action: TAction) => {
    const conn = hostConnRef.current;
    if (conn) send(conn, { type: 'action', action });
  }, []);

  const claimSeat = useCallback((seat: TSeat, release = false) => {
    const conn = hostConnRef.current;
    if (conn) send(conn, { type: release ? 'release' : 'claim', seat });
  }, []);

  const broadcastState = useCallback((state: TState) => {
    broadcast({ type: 'state', state });
  }, [broadcast]);

  const broadcastRoster = useCallback((roster: Roster<TSeat>) => {
    broadcast({ type: 'roster', roster });
  }, [broadcast]);

  const kick = useCallback((pid: string) => {
    const connId = personaToConnRef.current.get(pid);
    const conn = connId ? connsRef.current.get(connId) : undefined;
    if (conn) { send(conn, { type: 'kicked' }); conn.close(); connsRef.current.delete(conn.peer); }
    if (connId) { personaToConnRef.current.delete(pid); connToPersonaRef.current.delete(connId); }
    setPeers((p) => p.filter((x) => x.playerId !== pid));
    cbsRef.current.onLeave?.(pid);
  }, []);

  useEffect(() => () => { peerRef.current?.destroy(); }, []);

  return {
    role, gameId, playerId, connected, error, peers,
    createHost, join, leave, sendAction, claimSeat, broadcastState, broadcastRoster, kick,
  };
}
