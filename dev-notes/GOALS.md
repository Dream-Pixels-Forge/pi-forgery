# GOALS.md — per-task goal ledger

Goal specs (goal-writer) + audit verdicts (goal-met) are stored together here
so any later session can re-verify without memory. Newest first.

---

## Goal: Eliminate doc/version drift in pi-forgery after PR #2

**Status:** executed in commits 9f9b2a9 (deps) + a1eb0df (docs) — audit verdict: **MET** (2026-10-28)
**Date:** 2026-10-27

### Objective
Make every manifest, lockfile, and progress note match the actual post-PR-#2
state: v0.2.0, 38 tests, both PRs merged, dependencies reproducibly installable.

### Context
A state check on 2026-10-27 found `npm ci` broken (lockfile pinned
`pi-tui@0.81.0` vs `*` ranges resolving to 1.4.0; `typescript` missing from
devDependencies despite the typecheck script calling `tsc`), plus three doc-drift
items left behind by PR #2: root `package.json` stuck at 0.1.0, `PROGRESS.md`
still describing PR #1 with "28 tests", and `extensions/forgery/dev-notes/DEV-NOTES.md`
carrying three unchecked boxes for work PR #2 had already completed.

### Deliverables
- [x] root `package.json` version 0.1.0 → 0.2.0 (align with `extensions/forgery`)
- [x] root typecheck script strict (drop stale `--skipLibCheck`)
- [x] `package-lock.json` in sync; `typescript` in devDependencies (9f9b2a9)
- [x] `PROGRESS.md`: PR #1 + #2 + dep-sync commit, 38/38 tests
- [x] `DEV-NOTES.md` v0.2.0 checklist fully checked
- [x] All committed and pushed to `origin/main`

### Definition of Done
- [ ] `grep '"version"' package.json` → 0.2.0
- [ ] `grep skipLibCheck package.json` → no match
- [ ] No "28/" test-count claims under `dev-notes/` or `extensions/forgery/dev-notes/`
- [ ] No unchecked `[ ]` items in `extensions/forgery/dev-notes/DEV-NOTES.md`
- [ ] `npm run typecheck` (root) → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (in `extensions/forgery`) → 38 pass, 0 fail
- [ ] `cd extensions/forgery && npm ci` → exit 0 (regression test for 9f9b2a9)
- [ ] `git status` clean; `main` == `origin/main`

### Verification Steps
1. `grep -n '"version"' package.json` — expect 0.2.0
2. `grep -n skipLibCheck package.json || echo CLEAN`
3. `grep -rn "28/" dev-notes/ extensions/forgery/dev-notes/ || echo CLEAN`
4. `grep -n "\[ \]" extensions/forgery/dev-notes/DEV-NOTES.md || echo CLEAN`
5. `npm run --silent typecheck && echo EXIT_OK`
6. `cd extensions/forgery && npx tsx --test tests/*.test.ts`
7. `cd extensions/forgery && npm ci`
8. `git status --short` (expect empty) and `git rev-parse main origin/main` (equal)

### Anti-Drift Rules
- Audit scope only: re-run the steps above; do not modify files, do not fix anything.
- `GOAL.md` acceptance-criteria checkboxes are the original project spec, not
  progress tracking — untouched by design.
- Report a blocker if the environment fails; do not paper over.

### Estimated Effort
Execution: done. Audit: ~2 min.

### Audit Verdict (goal-met — independent subagent, 2026-10-28)

Auditor: fresh read-only `worker` subagent (did not do the work; re-ran every
step with real exit codes; run revived once after a 30-min timeout).

```
GOAL COMPLETION VERIFICATION — Goal: Eliminate doc/version drift after PR #2
RESULT: MET  (all 8 DoD criteria pass; no blockers; audit stayed read-only)

[1] version 0.2.0 — PASS      grep → 3: "version": "0.2.0"
[2] no skipLibCheck — PASS    grep → CLEAN
[3] no stale 28-test claims — PASS  (only self-quotes in this ledger)
[4] no unchecked DEV-NOTES boxes — PASS  grep → CLEAN
[5] root typecheck — PASS     → EXIT_OK
[6] tests — PASS              38/38, 0 fail, exit=0
[7] npm ci lockfile regression — PASS  129 pkgs from lockfile, exit=0
[8] git state — PASS         main == origin/main == a1eb0df; both fix
                             commits verified on main (9f9b2a9, a1eb0df)
```

Auditor notes (outside goal scope, recorded for follow-up):
- `npm ci` reports 2 pre-existing dependency advisories (1 moderate, 1 high) —
  from the `@earendil-works/pi-coding-agent` dep tree, unrelated to this goal.
- This ledger was untracked at audit time; committed together with the verdict
  (sibling dev-notes files are tracked, so commit is the right disposition).
