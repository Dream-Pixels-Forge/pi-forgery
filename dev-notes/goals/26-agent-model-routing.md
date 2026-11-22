# Goal: Agent Model Routing Intelligence — `agents.route`

## Objective
Add `agents.route({ task, candidates?: string[] })` host call that returns `{ model, reason, expectedCost, historicalPassRate }` — routing each agent run to the cheapest model that historically completes this kind of task, based on per-model outcome history stored in `activity.store`.

## Context
pi-forgery persists per-agent run outcomes (status, usage, cost, duration) in the activity store — data no other Pi extension surfaces. Today `agents.run({ model, task })` requires the caller to pick a model manually, usually defaulting to the most capable (expensive) one for every task. `agents.route` uses the store's own history to recommend routing: planning/summarization/small edits → small model; architecture/code-gen → large model. Cost reduction is immediate on every multi-agent workflow.

## Deliverables
- [x] `src/agents/router.ts` — `ModelRouter` class: `route(task, candidates)` → `{ model, reason, expectedCost, historicalPassRate }` using store outcome history + cost-manager pricing
- [x] `src/activity/store.ts` — `agentOutcomeFor(model, taskClass)` / `recordOutcome(model, taskClass, status, cost)` methods
- [x] `src/exec/tool.ts` — register `agents.route` in `makeRegistry`
- [x] `extensions/forgery/tests/router.test.ts` — unit tests: picks cheapest model with sufficient pass rate, falls back to default on cold start, respects candidate list
- [x] `extensions/forgery/tests/store.test.ts` — add outcome record/query coverage
- [x] `docs/host-calls.md` — document `agents.route`

## Definition of Done
- [x] root `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail (215 tests)
- [x] `agents.route` returns a model from `candidates`; on cold start returns the first/default candidate
- [x] Recorded outcomes influence subsequent route calls (read-your-writes)
- [x] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs
4. Smoke: route returns a model for `candidates: ["opus", "haiku", "sonnet"]`

## Anti-Drift Rules
- Read-your-writes: outcomes recorded in call N affect call N+1 within the same session
- No new npm dependencies; TypeScript-only; cost-manager used only for expectedCost math
- `agents.route` is advisory (returns a recommendation), not enforced — caller still passes `model` to `agents.run`

## Non-Goals (follow-up goal candidates)
- Automatic re-routing mid-run based on live cost
- Cross-session model history persistence (today in-memory only, exported with snapshot)

## Estimated Effort
Implementation: ~135 lines + tests. Audit: ~5 min.
