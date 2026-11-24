## Goal: Connect budget configuration, accounting, and execution abort

### Objective
Use one cost manager across agent paths, record real usage, and abort execution at the hard budget while preventing later spawns.

### Context
Issue #27: `createForgeryExecTool` drops the singleton, enhanced/dev-loop runners create independent managers, basic agents do not record their costs there, and hard-stop changes only UI status.

### Deliverables
- [x] Shared-manager injection through basic, enhanced, dev-loop, routing, and UI paths.
- [x] Provider-total-aware cost accounting for basic and enhanced agents.
- [x] Hard-budget abort callback and pre-spawn checks.
- [x] End-to-end `forgery_exec` regression test.
- [x] Verification evidence recorded in this goal.

### Definition of Done
- [x] New manager, provider-total, and end-to-end tests fail on the old code for the expected reasons.
- [x] A $0.20 agent against a $0.10 budget aborts the run and prevents a second spawn.
- [x] Existing tests remain green with no skips.
- [x] Typecheck and production build exit 0.

### Verification Steps
1. Run the new budget tests before implementation and capture RED.
2. Run them after implementation and confirm shared identity, actual total, abort, and spawn prevention.
3. Run `pnpm test`, `tsc --noEmit`, and `tsc`.
4. Inspect the diff for manager instances and scope.

### Verification Evidence
- RED: all four new budget tests failed (provider-total ignored, callback missing, shared manager rejected, end-to-end `cost` undefined).
- GREEN: 4/4 new tests pass; full suite → 291 pass, 0 fail, 0 skipped.
- Typecheck: `tsc --noEmit` → exit 0.
- Build: `tsc` → exit 0, 4.96s, max RSS 795,832 KB.
- `git diff --check` → no whitespace errors.

### Anti-Drift Rules
- Change only budget/accounting wiring, agent result accounting, tests, and this goal.
- Preserve in-flight completion semantics and existing public result shapes.
- Do not change parser, concurrency, dry-run, or workflow-resume behavior.

### Estimated Effort
Medium: constructor injection, one abort callback, two pre-spawn checks, and integration tests.
