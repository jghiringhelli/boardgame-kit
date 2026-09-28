# boardgame-kit

Shared, engine-agnostic multiplayer plumbing extracted from parallel duplication
across this workspace's digital boardgame ports (`starcraft-tbg`, `meq`, and
future titles):

- `identity.ts` — stable per-browser player identity (localStorage), namespaced
  per game.
- `roles.ts` — seat/controller/roster model (human / ai / open), pure and
  generic over the game's own seat-id type.
- `session.ts` — a React hook (`useGameSession`) wrapping a host-authoritative
  PeerJS (WebRTC) session: the host holds the one true state, applies every
  action, and broadcasts; clients only ever send actions and render pushed
  state.
- `host.ts` — pure host-side reducer helpers (`applyRemoteAction`, `claimSeat`,
  `dropPlayer`) that enforce per-seat ownership before dispatching into the
  game's own reducer.

Each game keeps its own engine, its own action/state types, and its own
`net/roles.ts`-style thin wrapper providing the game-specific bits this
package can't know about (the action shape, and a `roleOf(action)` mapping
telling the kit which seat/`'flow'` an action belongs to).

## Why this exists

Both `starcraft-tbg` and `meq` independently built near-identical
`identity.ts`/`roles.ts`/`session.ts`/`host.ts` files (verified: `identity.ts`
differed only in a namespace string; `session.ts` differed in ~15% of lines,
all game-specific type references). This package is the generalized common
90%, so future ports (and bug fixes to this transport layer) don't need to be
copy-pasted and re-fixed N times.

## Design lineage

The overall shape — a minimal per-game adapter (here: `roleOf` + the game's
own reducer) wired into shared, reusable session/host/persistence plumbing —
is directly inspired by John Champaign's
[`digital-boardgame-framework`](https://www.npmjs.com/package/digital-boardgame-framework)
(MIT), the shared library behind his own boardgame ports (Star Wars Rebellion,
War of the Ring, Innovation, Impulse, ...). That library additionally
provides a hosted/async `GameServer` (pluggable storage: filesystem for dev,
Supabase for production), a serializable `ChoiceRequest`/`EffectContext`
pause-resume protocol for in-resolution decisions, deterministic seeded RNG,
and a `useGame` React hook — none of which this package currently implements.

This package deliberately reimplements a **narrower** scope from scratch
(peer-to-peer only, no backend/Supabase dependency, no async/hosted play)
rather than adopting `digital-boardgame-framework` directly, since both
`starcraft-tbg` and `meq` are architected around a fully serverless
WebRTC/PeerJS session model. If a future title needs asynchronous
(non-realtime) play, `digital-boardgame-framework`'s `GameServer` + pluggable
store is worth adopting directly for that title rather than reinventing it
here.

## Usage

No build step — consumed as raw TypeScript (every consumer already runs
Vite/esbuild, which transpiles `.ts` from `node_modules` directly). Add as a
local dependency:

```json
"dependencies": { "boardgame-kit": "file:../boardgame-kit" }
```

Then import via the package's subpath exports, e.g.
`import { useGameSession } from 'boardgame-kit/session'`.
