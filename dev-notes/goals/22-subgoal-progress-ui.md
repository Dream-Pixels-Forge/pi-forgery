# Goal: Subgoal Progress Surfaces Across All UI

## Objective
Render per-run subgoal progress (completed/total, current step, status) in the activity widget, dashboard activity view, and footer — today subgoals exist in the store (`subgoals.create/update/finish` host calls, `ForgerySubgoal` type, `subgoalTotals` in the snapshot) but are only visible as an aggregate footer count.

## Context
Subgoal data already exists in the store and snapshot. Surfacing it in the widget/dashboard is purely a presenter change over existing data — cheap to boot, honest (Gate 5), high value for anyone decomposing work into subgoals.

## Deliverables
- [ ] `src/ui/widget.ts` — render subgoal rows under the active run; expanded participant view shows subgoal current/total (+~30 lines)
- [ ] `src/ui/dashboard.ts` — activity view shows a subgoal mini-panel per focused run (name, status, completed/total) (+~40 lines)
- [ ] `src/ui/footer.ts` — optionally show active subgoal name alongside aggregate `subgoals c/t` (+~5 lines)
- [ ] `extensions/forgery/tests/widget.test.ts` / `dashboard.test.ts` — render tests with stub subgoals (+~40 lines)
- [ ] `docs/usage.md` — one line documenting subgoal progress display

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] All UI tests pass
- [ ] A run with 2 subgoals (one completed, one running) renders `1/2` and the running subgoal's name in widget + dashboard
- [ ] Idle runs (no subgoals) render unchanged — no regressions

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Presenter-only: no new data model, reads existing `subgoalTotals` / `run.subgoals`
- Honest: values come from `ForgerySnapshot` only, no fabricated counts
- Idle runs must not regress — no subgoals renders as before

## Non-Goals (follow-up goal candidates)
- Subgoal creation UI inside dashboard (that's a dedicated dashboard view — deferred Non-Goal)
- Subgoal status transitions triggered from UI (host calls already handle this)

## Estimated Effort
Implementation: ~115 lines. Audit: ~5 min.
