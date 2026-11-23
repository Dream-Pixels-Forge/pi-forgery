# Goal: Cross-Session Persistence — auto-save/auto-load activity snapshot

## Objective
Make pi-forgery's activity store survive Pi restarts: automatically save the activity snapshot to `.pi/forgery/activity-last.json` on `session_shutdown` and reload it on `session_start`, so model routing outcomes (goal 26) and budget state (goal 29) persist across sessions.

## Context
- `session_start` previously called `store.reset()` (wiped the store) — goal 16
- `session_shutdown` only called `ui.stop()` — nothing was saved — goal 16
- `store.exportSnapshot()` / `store.importSnapshot(json)` existed (goal 24) but required manual `/forgery export` / `/forgery import`
- Model router outcomes (`recordOutcome`/`agentOutcomeFor`, goal 26) and budget enforcement state (goal 29) lived in the in-memory store and were lost every restart
- `#outcomes` was not serialized in snapshots — fixed as part of this goal

## Deliverables
- [x] `src/activity/types.ts` — `outcomes` field added to `ForgerySnapshot`
- [x] `src/activity/store.ts` — `createSnapshot()` serializes outcomes; `importSnapshot()` restores them; `reset()` clears them
- [x] `index.ts` `session_start` hook: auto-import from `.pi/forgery/activity-last.json` if it exists (instead of blind reset); corrupt file → start fresh
- [x] `index.ts` `session_shutdown` hook: auto-export to `.pi/forgery/activity-last.json`
- [x] `index.ts`: `FORGERY_AUTO_PERSIST` env var (default true) to disable persistence
- [x] `tests/cross-session.test.ts`: 4 tests — round-trip preserves runs + outcomes, corrupt import throws, empty store exports valid JSON, import replaces all contents
- [x] `dev-notes/goals/31-cross-session-persistence.md` — goal spec

## Definition of Done
- [x] root `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` → all pass, 0 fail (274 tests)
- [x] `npm run build` → exit 0, `dist/index.js` exists
- [x] Session shutdown writes `.pi/forgery/activity-last.json`
- [x] Session start reloads it (model outcomes + budget state survive)
- [x] `FORGERY_AUTO_PERSIST=false` skips both save and load
- [x] Corrupt/missing persistence file does not crash startup
- [x] `git diff main --stat` → changes confined to root + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0 ✅
2. `npx tsx --test tests/*.test.ts` → all pass ✅
3. `npm run build` → exit 0 + `dist/index.js` exists ✅
4. Inspect `index.ts` session_start/session_shutdown hooks for save/load logic ✅
5. Run cross-session tests ✅

## Anti-Drift Rules
- Persistence uses existing `exportSnapshot`/`importSnapshot` — no new data model
- Default path `.pi/forgery/activity-last.json` matches existing export convention
- Corrupt file → log warning, start fresh (never crash Pi)
- `autoPersist` defaults to true; opt-out via `FORGERY_AUTO_PERSIST=false`
- No new npm dependencies; TypeScript-only

## Non-Goals (follow-up candidates)
- Per-run instead of whole-snapshot persistence
- Encryption of persisted snapshot
- Persistence to a remote/backend store

## Estimated Effort
Implementation: ~60 lines + tests. Audit: ~5 min.
