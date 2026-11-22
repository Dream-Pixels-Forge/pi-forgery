# Goal: Activity Distill — `activity.distill` (pattern mining → preset synthesis)

## Objective
Add `activity.distill({ minOccurrences, windowMs })` host call that mines the activity store's completed runs for repeated host-call sequences and proposes saving them as named presets or reusable skills, with occurrence counts, average cost, and suggested names.

## Context
pi-forgery's activity store is its unique asset — no other Pi extension persists structured run history. Today it's read-only observability. `activity.distill` makes it productive: it finds patterns like `pi.grep → pi.read ×N → agents.run(review)` recurring across runs and suggests distilling them into a preset/skill. This is "forging" in the literal sense — turning observed work into reusable tooling.

## Deliverables
- [x] `src/activity/distill.ts` — `distill({ minOccurrences, windowMs })` → array of `{ pattern, suggestedName, occurrences, avgCost, avgDuration, firstSeen, lastSeen }`
- [x] `src/exec/tool.ts` — register `activity.distill` host call
- [x] `extensions/forgery/tests/distill.test.ts` — unit tests: finds repeated 3-call sequences, ignores one-offs, sorts by occurrences desc
- [x] `docs/activity.md` — document `activity.distill` output shape

## Definition of Done
- [x] root `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail (232 tests)
- [x] A pattern occurring ≥ `minOccurrences` times within `windowMs` appears in results; one-offs do not
- [x] Results sorted by occurrences descending; `avgCost` derived from store usage records
- [x] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Read-only: `activity.distill` never mutates the store; it only proposes names/patterns
- Patterns are host-call sequences (not LLM outputs), so no privacy leakage of task content
- No new npm dependencies; TypeScript-only; pure computation over `ForgerySnapshot`

## Non-Goals (follow-up goal candidates)
- Auto-creating presets from distilled patterns (manual confirmation first — stays a proposal)
- Pattern matching across sessions (today in-memory window only)

## Estimated Effort
Implementation: ~120 lines + tests. Audit: ~5 min.
