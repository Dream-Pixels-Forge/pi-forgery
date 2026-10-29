# Goal: Auto-compact trigger

## Objective
Auto-compact the active run when context usage exceeds 85%, so the compact counter actually increments instead of staying at 0 forever.

## Context
`store.compact(runId)` existed but was never invoked. The compact counter would always read 0. The controller's `refresh()` is the right place to check context usage and trigger a compact, with a cooldown to prevent refresh-loop thrashing (compact bumps store revision which re-triggers refresh).

## Deliverables
- [ ] Controller `#maybeCompact(snap)`: checks `ctx.getContextUsage().percent`, calls `store.compact(activeRunId)` when > 85%
- [ ] 60-second cooldown (`#lastCompactAt`) prevents re-compact thrashing
- [ ] No compaction when no active run exists
- [ ] No throw when context getter is stale/invalidated
- [ ] Unit tests: high-context compacts, low-context skips, cooldown blocks re-compact, no active run doesn't throw

## Definition of Done
- [ ] `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail
- [ ] Compact counter actually increments under high context usage

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass

## Anti-Drift Rules
- Cooldown prevents refresh-loop: compact bumps revision → refresh → `#maybeCompact` → must not compact again within cooldown
- Stale context degrades gracefully (caught by `#read` try/catch)
- No new npm dependencies

## Non-Goals
- Manual compact trigger via `/forgery compact` command
- Configurable threshold (hardcoded 85%)

## Estimated Effort
~45 minutes
