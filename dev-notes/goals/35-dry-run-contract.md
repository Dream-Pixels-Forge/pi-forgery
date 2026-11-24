## Goal: Make the trusted-code dry-run contract explicit

### Objective
Tell callers clearly that dry-run executes program code and only suppresses registered host calls, removing false process/global isolation claims.

### Context
Issue #23: `new Function` permits Node globals and dynamic imports during dry-run. The architecture intentionally uses trusted code rather than a sandbox, but runtime/spec documentation currently implies isolation and the API gives no warning.

### Deliverables
- [x] Dry-run result warning exposed through the existing result value.
- [x] Corrected tool parameter text, runtime comments, SPEC, and usage/non-goal documentation.
- [x] Regression test for the warning.
- [x] Verification evidence recorded in this goal.

### Definition of Done
- [x] The warning test fails on the old result and passes on the new result.
- [x] Dry-run still skips registered host calls and does not mutate the activity store.
- [x] Documentation no longer claims `new Function` blocks process/globals/imports.
- [x] Existing tests remain green with no skips.
- [x] Typecheck and production build exit 0.

### Verification Steps
1. Add and run the warning test before implementation; capture RED.
2. Add the result warning and documentation changes; confirm GREEN.
3. Run `pnpm test`, `tsc --noEmit`, and `tsc`.
4. Grep changed runtime/spec/docs for stale isolation claims and inspect the diff.

### Verification Evidence
- RED: warning test failed because `result.value.warning` was undefined.
- GREEN: runtime tests → 13/13 pass, including host-call suppression and unchanged store behavior.
- Full suite: `pnpm test` → 287 pass, 0 fail, 0 skipped.
- Typecheck: `tsc --noEmit` → exit 0.
- Build: `tsc` → exit 0, 5.00s, max RSS 792,488 KB.
- Documentation grep: only explicit trusted-code/non-sandbox warnings remain.
- `git diff --check` → no whitespace errors.

### Anti-Drift Rules
- Preserve the trusted `new Function` architecture and existing host-call dry-run behavior.
- Do not add a sandbox, dependency, timeout, parser, or concurrency change.
- Do not claim the side-effect capability itself was removed.

### Estimated Effort
Small: one API-visible warning, documentation corrections, and one regression test.
