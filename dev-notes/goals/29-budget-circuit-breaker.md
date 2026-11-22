# Goal: Budget Circuit Breaker — mid-run cost enforcement

## Objective
Add mid-run budget enforcement to `forgery_exec`: when a run crosses 80% of `maxCostPerRun`, pause spawning new agent/calls, emit a `⚠ budget` event, and surface it as a priority-0 footer segment (SG-09 plumbing already exists). At 100%, hard-stop the run with a summary event.

## Context
pi-forgery's cost manager already tracks `maxCostPerRun` and checks budgets *before* spawning (goal 25-area). But a run can still blow past budget mid-flight because checks are pre-flight only. The controller's refresh loop already ticks every second; adding a budget check there — plus the footer's priority segment system — gives honest, mid-run enforcement with no new data model.

## Deliverables
- [ ] `src/ui/controller.ts` — in the refresh loop, check `cost.budgetStatus()` per active run: ≥80% → emit `budget-warning` event + footer priority segment; ≥100% → hard-stop run + `budget-exceeded` event (+~40 lines)
- [ ] `src/ui/footer.ts` — render `⚠ budget` as priority-0 segment when a run is over threshold (+~10 lines)
- [ ] `src/cost.ts` (or existing cost module) — `budgetStatus()` returning `{ pctUsed, overSoft, overHard }` (+~15 lines, or extend existing)
- [ ] `extensions/forgery/tests/budget.test.ts` — unit tests: 80% triggers warning segment, 100% hard-stops run, no false positives below threshold (+~50 lines)
- [ ] `docs/budget.md` — document budget thresholds + footer segment (+one section)

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] At ≥80% of `maxCostPerRun`, footer shows `⚠ budget` segment and a budget-warning event is recorded
- [ ] At ≥100%, active run is hard-stopped and `budget-exceeded` event recorded
- [ ] Idle / below-threshold runs render footer unchanged — no regressions
- [ ] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

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
