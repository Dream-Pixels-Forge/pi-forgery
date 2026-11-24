## Goal: Make agent timeout, stop, and abort terminate children reliably

### Objective
Ensure agent subprocesses end promptly with correct `timed_out`/`stopped` status and host aborts stop active `agents.run` calls.

### Context
Issue #21: timeout currently sends only SIGTERM and waits indefinitely; close handling can overwrite terminal status; the `agents.run` host call discards its abort signal.

### Deliverables
- [x] SIGTERM-resistant fake-child regression tests for timeout and explicit stop.
- [x] Host-signal abort integration test.
- [x] Escalating termination and terminal-status preservation in `AgentRunner`.
- [x] Abort-signal propagation through `agents.run`.
- [x] Verification evidence recorded in this goal.

### Definition of Done
- [x] All three cancellation tests fail safely on the old code and pass on the fixed code.
- [x] A SIGTERM-resistant timeout child settles as `timed_out` within one second.
- [x] Explicit stop and host abort settle as `stopped` within one second.
- [x] Existing tests remain green with no skips.
- [x] Typecheck and production build exit 0.

### Verification Steps
1. Run the three new cancellation tests before implementation and capture watchdog RED failures.
2. Run them after implementation and confirm correct status and bounded elapsed time.
3. Run `pnpm test`, `tsc --noEmit`, and `tsc`.
4. Inspect for leftover fake processes and review the diff for scope.

### Verification Evidence
- RED: timeout and host abort exceeded 1,000ms watchdogs; explicit stop returned `failed` instead of `stopped`.
- GREEN: all three cancellation cases pass; runner file → 9/9 pass.
- Measured: SIGTERM-resistant timeout ≈160ms; explicit stop ≈23ms; host abort ≈25ms.
- Full suite: `pnpm test` → 286 pass, 0 fail, 0 skipped.
- Typecheck: `tsc --noEmit` → exit 0.
- Build: `tsc` → exit 0, 5.06s, max RSS 794,460 KB.
- Leftover fake processes: none.
- `git diff --check` → no whitespace errors.

### Anti-Drift Rules
- Change only agent cancellation/termination, abort propagation, tests, and this goal.
- Do not change output parsing, concurrency limits, budgets, or workflow resume in this branch.
- Keep the existing public result shapes and `AgentRunner.run` call compatibility.

### Estimated Effort
Small-to-medium: shared kill escalation, abort listener cleanup, and three fake-child tests.
