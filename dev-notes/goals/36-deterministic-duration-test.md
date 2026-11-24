## Goal: Make the active-run duration test deterministic

### Objective
Derive the active-run duration test clock from the run's actual start timestamp so snapshot creation timing cannot change the expected result.

### Context
Issue #24: the full suite fails with `5001 !== 5000` because the test assumes `snap.now` and `run.startedAt` are identical separate `Date.now()` reads.

### Deliverables
- [x] One-line test-clock correction.
- [x] Repeated full-suite verification.
- [x] Verification evidence recorded in this goal.

### Definition of Done
- [x] Expected elapsed time is computed from `run.startedAt`.
- [x] No production source changes.
- [x] Two consecutive full-suite runs pass with no skips.
- [x] Typecheck and production build exit 0.

### Verification Steps
1. Use the existing full-suite RED failures as the baseline.
2. Run the corrected test repeatedly.
3. Run `pnpm test` twice, then typecheck and build.

### Verification Evidence
- RED: two full-suite runs failed with `5001 !== 5000` at `tests/format.test.ts:227`.
- Targeted: corrected test passed 20/20 runs.
- Full suite: two consecutive runs → 286 pass, 0 fail, 0 skipped each.
- Typecheck: `tsc --noEmit` → exit 0.
- Build: `tsc` → exit 0, 5.10s, max RSS 795,756 KB.
- `git diff --check` → no whitespace errors.

### Anti-Drift Rules
- Change only the flaky assertion, this goal, and review metadata.
- Do not change formatter behavior or unrelated tests.

### Estimated Effort
Minimal: one test-line change and verification.
