## Goal: Isolate workflow test state from real `.pi/` data

### Objective
Make every workflow-related test write only to temporary directories so the standard test command cannot delete or overwrite a user's durable workflow state.

### Context
Issue #17: `tests/journal.test.ts` deletes every JSON file in the real `.pi/forgery/journal/` directory, while workflow and resolver tests write artifacts into the real `.pi/forgery/` tree. Production defaults must remain unchanged.

### Deliverables
- [x] Regression tests proving journal, engine, and resolver output-directory options are honored.
- [x] `WorkflowChain`, `WorkflowEngine`, and `WorkflowResolver` accept optional output paths with existing production defaults.
- [x] Existing journal, chain, workflow, bootstrap, and resolver tests use temporary directories.
- [x] Verification evidence recorded in this goal.

### Definition of Done
- [x] New regression tests fail on the old implementation for the expected missing-path reason.
- [x] A sentinel outside test output directories survives the full suite unchanged.
- [x] No test writes to the repository's real `.pi/forgery/` tree.
- [x] `./node_modules/.bin/tsc --noEmit --pretty false` exits 0.
- [x] `pnpm test` exits 0 with no skipped or failed tests.
- [x] `./node_modules/.bin/tsc --pretty false` exits 0 and emits `dist/`.

### Verification Steps
1. Run `npx tsx --test tests/test-state-isolation.test.ts` before implementation and capture RED failures.
2. Run the same command after implementation and confirm all isolation tests pass.
3. Create a temporary sentinel outside the test output roots, run `pnpm test`, and verify its contents are unchanged.
4. Run typecheck and inspect `git diff` for scope.

### Verification Evidence
- RED: `tsx --test tests/test-state-isolation.test.ts` → 3 failures, all because injected paths were ignored.
- GREEN: same command → 3/3 pass; affected workflow files → 42/42 pass.
- Full suite: `pnpm test` → 277 pass, 0 fail, 0 skipped.
- Sentinel SHA-256 before/after full suite: `290ac20c6bbff6447681779b2344df56c69961bf405783fb566c7db9bfd65676` (unchanged).
- Typecheck: `./node_modules/.bin/tsc --noEmit --pretty false` → exit 0.
- Build: `./node_modules/.bin/tsc --pretty false` → exit 0, 4.97s, max RSS 761,588 KB.
- `git diff --check` → no whitespace errors.

### Anti-Drift Rules
- Change only workflow output-path injection and affected tests/documentation.
- Preserve existing production `.pi/forgery/` defaults and public result shapes.
- Do not fix unrelated audit findings in this branch.
- Do not claim completion without fresh RED/GREEN and full-suite evidence.

### Estimated Effort
Small: three optional constructor parameters and mechanical test-path migration.
