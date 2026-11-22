# Goal: Budget Circuit Breaker — mid-run cost enforcement

## Objective
Add mid-run budget enforcement to `forgery_exec`: when a run crosses 80% of `maxCostPerRun`, pause spawning new agent/calls, emit a `⚠ budget` event, and surface it as a priority-0 footer segment (SG-09 plumbing already exists). At 100%, hard-stop the run with a summary event.

## Context
pi-forgery's cost manager already tracks `maxCostPerRun` and checks budgets *before* spawning (goal 25-area). But a run can still blow past budget mid-flight because checks are pre-flight only. The controller's refresh loop already ticks every second; adding a budget check there — plus the footer's priority segment system — gives honest, mid-run enforcement with no new data model.

## Deliverables
- [x] `src/agents/cost-manager.ts` — `budgetStatus(runId)` returning `{ pctUsed, overSoft, overHard }`
- [x] `src/ui/controller.ts` — `#checkBudgets()` in refresh loop + heartbeat: ≥80% warning event, ≥100% hard-stop
- [x] `src/ui/footer.ts` — `⚠ budget NN%` priority-0 segment
- [x] `extensions/forgery/index.ts` — shared cost manager singleton, passed to makeRegistry + controller
- [x] `src/exec/tool.ts` — accept shared cost manager parameter
- [x] `extensions/forgery/tests/budget.test.ts` — unit tests: budgetStatus thresholds, hard-stop, warning, no-budget case
- [x] `extensions/forgery/tests/controller.test.ts` — updated to pass cost manager
- [x] `docs/budget.md` — document budget thresholds + footer segment

## Definition of Done
- [x] root `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail (242 tests)
- [x] At ≥80% of `maxCostPerRun`, `budget-warning` event recorded + `⚠ budget NN%` footer segment
- [x] At ≥100%, active run hard-stopped + `budget-exceeded` event recorded
- [x] Idle / below-threshold runs render footer unchanged — no regressions (verified via existing controller tests + budget.test.ts no-budget case)
- [x] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Honest: thresholds read from `config.cost.maxCostPerRun` and real cost-manager totals — no fabricated percentages
- Footer segment is priority-0 (SG-09), shown only when a run is over soft threshold
- Mid-run enforcement pauses *new* spawns; in-flight calls complete (no data loss)
- No new npm dependencies; TypeScript-only

## Non-Goals (follow-up goal candidates)
- Auto-scaling down model tier when approaching budget (that's goal 26 routing + budget interplay)
- Persistent budget across sessions (today per-run, in-memory)

## Estimated Effort
Implementation: ~70 lines + tests. Audit: ~5 min.
