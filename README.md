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
- `rng.ts` — pure, cursor-based seeded PRNG (mulberry32): `nextRandom`/
  `nextInt`/`shuffle`/`weightedPick`. Every function takes the current
  numeric cursor and returns `{ value, cursor }` — the caller owns where that
  cursor lives (typically a `rngCursor` field on the game's own state), so
  full games stay bit-reproducible from a single seed. `weightedPick` picks
  an index with probability proportional to a weight list — useful for an AI
  that wants to weight its options by a heuristic score instead of always
  taking a deterministic argmax.
- `storage.ts` — namespaced localStorage helpers (`safeGet`/`safeSet`/
  `safeRemove`, never throwing even in private browsing or when disabled) plus
  factories for the three recurring persistence patterns: `createSaveSlot`
  (one resumable in-progress game), `createHistoryStore` (an append-only,
  capped history of finished games), `createNotesStore` (free-text per-game/
  per-author notes, deliberately never part of game state so they can't leak
  over the network), and `createCrashStore` (a last-uncaught-error stash for
  bug reports).
- `log.ts` — `createLogger`, a generic append-only structured event logger
  factory. Parametrize it with a `getContext(state)` callback returning
  whatever per-event fields matter for that game (turn/round/phase/side,
  etc.); it merges those onto every logged event alongside the universal
  `seq`/`type`/`actor`/`detail`/`data` fields.
- `deck.ts` — `drawInto`/`drawOne` (draw N/1 from a deck into a hand,
  reshuffling the discard back in when it runs dry) and `keyedShuffle`, a
  second, independent deterministic shuffle stream (distinct from `rng.ts`'s
  main gameplay cursor) for setup/side-deck shuffles that shouldn't perturb
  the main rng stream mid-game.
- `undo.ts` — `createUndoStack`, a generic snapshot-based undo/redo history
  stack. Works over any serializable state (deep-clones via
  `structuredClone`); useful for a "take back a move" dev/solo-play feature.
- `download.ts` — `downloadText`/`downloadJson`, the Blob/ObjectURL/anchor-
  click DOM dance (with a new-tab fallback if downloads are blocked) for
  exporting game state/logs/bug-reports as a file, with nothing game-specific
  about it.

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
WebRTC/PeerJS session model. `rng.ts`/`storage.ts`/`log.ts` cover that
framework's seeded-RNG and persistence concerns already; still missing here:
a hosted/async `GameServer`, the `ChoiceRequest`/`EffectContext` pause-resume
protocol, and a `useGame` React hook. If a future title needs asynchronous
(non-realtime) play, `digital-boardgame-framework`'s `GameServer` + pluggable
store is worth adopting directly for that title rather than reinventing it
here.

## What deliberately stays OUT of this package

Some things are better left per-game rather than wrapped in a shared
abstraction, because the wrapper would add indirection without saving real
duplicated code:

- **Turn/phase state machines.** Each game's phase graph, transition rules,
  and "what's interactive vs. auto-run" gating are different enough (and
  `starcraft-tbg` doesn't even share `meq`'s phase-based structure at all)
  that a generic FSM helper would just be a thin wrapper around a `switch`
  statement each game already writes cleanly on its own.
- **AI search (MCTS/ISMCTS and friends).** The tree/UCB1/backprop loop itself
  is genuinely game-agnostic, but the bulk of the complexity — and nearly all
  of the value — lives in each game's own action space, rollout policy, and
  evaluation heuristics, which a shared wrapper can't meaningfully reduce.
  Not worth the indirection unless a future title's AI needs literally the
  same search loop meq's already has.
- **The card *content*/effect vocabulary.** `deck.ts` covers the mechanical
  plumbing (draw/discard/reshuffle); what a given card actually *does* is
  100% game rules and isn't abstractable without losing expressiveness.

## Usage

No build step — consumed as raw TypeScript (every consumer already runs
Vite/esbuild, which transpiles `.ts` from `node_modules` directly). Add as a
local dependency:

```json
"dependencies": { "boardgame-kit": "file:../boardgame-kit" }
```

Then import via the package's subpath exports, e.g.
`import { useGameSession } from 'boardgame-kit/session'`.
