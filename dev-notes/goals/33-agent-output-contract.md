## Goal: Parse real Pi agent output and reject false-success empty results

### Objective
Make one-shot agents return their actual assistant text, structured value, and usage from documented Pi JSON events, and fail when no assistant result exists.

### Context
Issue #19: the runner invokes text-mode `pi --print` but parses incompatible invented JSONL fields. Real agents can exit 0 with empty text while being reported as completed.

### Deliverables
- [x] Documented Pi JSON fixtures and fake-CLI integration tests.
- [x] JSON-mode spawn and parser for final assistant content and usage/cost.
- [x] `agents.run` preserves structured values and rejects missing assistant results.
- [x] Verification evidence recorded in this goal.

### Definition of Done
- [x] New parser, fake-CLI, and structured-value tests fail on the old code for the expected reasons.
- [x] Final assistant text and real usage/cost are returned.
- [x] Exit code 0 without an assistant result returns `failed`, not `completed`.
- [x] Existing tests remain green with no skips.
- [x] Typecheck and production build exit 0.

### Verification Steps
1. Run `tsx --test tests/runner.test.ts` before implementation and capture RED failures.
2. Run the same tests after implementation and confirm GREEN.
3. Run `pnpm test`, `tsc --noEmit`, and `tsc` and inspect exit codes.
4. Inspect the diff for scope and unintended behavior changes.

### Verification Evidence
- RED: `tsx --test tests/runner.test.ts` → 5 failures covering nested content, usage, JSON mode, missing results, and dropped structured value.
- GREEN: same command → 5/5 pass.
- Full suite: `pnpm test` → 282 pass, 0 fail, 0 skipped.
- Typecheck: `tsc --noEmit` → exit 0.
- Build: `tsc` → exit 0, 5.17s, max RSS 796,108 KB.
- Real Pi smoke: `AgentRunner({ piBinary: "pi" })` returned `{ status: "completed", text: "AGENT_SMOKE_OK", usage: { input: 4159, output: 34, cost: 0 } }`.
- `git diff --check` → no whitespace errors.

### Anti-Drift Rules
- Change only agent output parsing, spawn mode, the `agents.run` result shape, tests, and this goal.
- Preserve backward-compatible parsing for already-supported simple `text`/`value` records.
- Do not change timeout, concurrency, budget, or workflow-resume behavior in this branch.

### Estimated Effort
Small-to-medium: one parser, one spawn argument list, one result field, and focused tests.
