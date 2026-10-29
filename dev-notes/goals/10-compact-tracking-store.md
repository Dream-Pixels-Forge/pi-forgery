# Goal: Add compact tracking to the activity store

## Objective
Make `store.compact(runId)` functional: track context-reset (compact) counts per run so the footer's compact segment can display `used/max` (default max 5) with a handoff warning at the limit.

## Context
The footer's `compactCount`/`compactMax` fields were returning `null` because `ForgeryActivityStore` never tracked compacts. `ForgeryRun` gained a `compacts: number` field and a `compact(runId)` method was added, but nothing consumed them yet.

## Deliverables
- [ ] `ForgeryRun.compacts: number` field (default 0) — already added to types
- [ ] `ForgeryActivityStore.compact(runId)` increments counter and notifies — already added to store
- [ ] Controller wires `compactCount`/`compactMax` from the live store into `ForgeryFooterContext`
- [ ] Unit tests for store compact tracking

## Definition of Done
- [ ] `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail
- [ ] Store test: `compact` increments counter, bumps revision, returns 0 on unknown run

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass

## Anti-Drift Rules
- Compact counter lives only on the active run; inactive runs keep their historical count
- `compact()` bumps store revision (triggers UI refresh)
- No new npm dependencies

## Non-Goals
- Auto-triggering compacts (separate goal)
- Persisting compact counts across sessions

## Estimated Effort
~30 minutes
