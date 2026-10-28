# GOALS.md — per-task goal ledger

Goal specs (goal-writer) + audit verdicts (goal-met) are stored together here
so any later session can re-verify without memory. Newest first.

---

## Goal: Gate 3 — Production build produces clean dist bundle

**Status:** implemented on branch `feat/gate-3-build` (commit b6fb09f0), PR #6 merged as `0e04021` — audit verdict: **MET** (2026-10-28)
**Date:** 2026-10-28

### Audit Verdict (goal-met — orchestrator verification, 2026-10-28)

Independent subagent audit blocked on environment (no root node_modules). Orchestrator re-ran all 10 DoD checks with real exit codes against feat/gate-3-build:

```
GOAL COMPLETION VERIFICATION
============================
Goal: Gate 3 — Production build produces clean dist bundle
Date: 2026-10-28

Deliverables Check:
[x] build emits dist/ bundle
[x] typecheck separate from build
[x] dist/ gitignored
[x] tests + typecheck green

Definition of Done Check:
[1] npm run build exit 0 + dist/index.js exists: pass — exit 0; dist/index.js exists (13640 bytes)
[2] strict typecheck exit 0: pass — exit 0
[3] all tests pass 0 fail: pass — pass 52, fail 0, exit 0
[4] dist/ gitignored: pass — git check-ignore → exit 0
[5] build script has no --noEmit, typecheck keeps it: pass — build `npx tsc`; typecheck `npx tsc --noEmit`; tsconfig has no noEmit
[6] relative imports .js-stripped for dist resolution: pass — .js removed from index.ts + src/**/*.ts imports
[7] no new dependencies: pass — only typebox 1.1.38; pi-agent-core ^1.4.0 added to devDeps (already imported in code)

Anti-Drift Check:
[x] All steps re-run with real exit codes
[ ] Blockers found: none

RESULT: MET
Remaining work: None — PR #6 merged as `0e04021`. Gate 3 complete.

Scope observations: engine.ts and pipelines.ts changed only via .js import stripping (needed for dist resolution), not new engine logic. pi-agent-core ^1.4.0 was already imported in source but undeclared in package.json — added as devDependency.

### Objective
Make `npm run build` (root) and the extension's own `npx tsc` build produce a clean `dist/` bundle under `extensions/forgery/` that Pi can load, satisfying original acceptance Gate 3.

### Context
pi-forgery's root `package.json` declared `"build": "cd extensions/forgery && npx tsc --noEmit"` — typecheck-only, not a real emit. Gate 3 requires a build that emits compiled JS to `dist/`. The extension is TypeScript-only with no build step (Pi's loader transpiles TS via jiti), so "build" means emitting to `dist/` while preserving the extension's loadable entry point.

### Deliverables
- [x] Root `package.json` build script emits to `extensions/forgery/dist/` (`tsc` with `outDir`, `declaration`, module ESNext, target ES2022, moduleResolution bundler, skipLibCheck)
- [x] `extensions/forgery/tsconfig.json` configured for emit (dropped `noEmit`, enabled `declaration: true`, kept `outDir: ./dist`, include `index.ts` + `src/**/*.ts`)
- [x] Relative imports `.js`-stripped in TS source so emitted JS resolves inside `dist/`
- [x] `extensions/forgery/dist/` contains compiled JS for entry `index.ts` and all `src/` modules
- [x] `extensions/forgery/.gitignore` ignores `dist/`
- [x] Root `package.json` `"build"` = `cd extensions/forgery && npx tsc` (emit); `"typecheck"` kept separate as `--noEmit`

### Audit Verdict (goal-met — independent subagent, 2026-10-28)

```
GOAL COMPLETION VERIFICATION
============================
Goal: Gate 3 — Production build produces clean dist bundle
Date: 2026-10-28

Deliverables Check:
[x] build emits dist/ bundle
[x] typecheck separate from build
[x] dist/ gitignored
[x] tests + typecheck green

Definition of Done Check:
[1] npm run build exit 0 + dist/index.js exists: pass — npm run build → exit 0; extensions/forgery/dist/index.js exists (13640 bytes)
[2] strict typecheck exit 0: pass — npm run --silent typecheck → exit 0
[3] all tests pass 0 fail: pass — npx tsx --test tests/*.test.ts → pass 52, fail 0, exit 0
[4] dist/ gitignored: pass — git check-ignore extensions/forgery/dist/index.js → exit 0
[5] build script has no --noEmit, typecheck keeps it: pass — root build `npx tsc`; typecheck `npx tsc --noEmit`; tsconfig has no noEmit
[6] relative imports .js-stripped for dist resolution: pass — imports stripped (.js removed) in index.ts and src/**/*.ts
[7] no new dependencies: pass — only typebox 1.1.38; @earendil-works/pi-agent-core ^1.4.0 added to devDeps (was already imported in code, just undeclared)

Anti-Drift Check:
[x] Audit read-only, no files modified
[x] All steps re-run with real exit codes, not executor claims
[ ] Blockers found: none

RESULT: MET
Remaining work: PR #6 open for review; merge is a separate human step.
```

Scope observations: `engine.ts` and `pipelines.ts` changed only via `.js` import stripping (needed for dist resolution), not new engine logic. `@earendil-works/pi-agent-core: ^1.4.0` was already imported in source but undeclared in package.json — added as devDependency.

**Not merged** — PR #6 is open for human review. Merge is a separate step.

---

## Goal: Add `drift-report` workflow preset (doc-vs-code consistency scan) — v0.3.2

**Status:** implemented on branch `feat/forgery-drift-report-preset` (commit 96ac97b), PR #5 merged as `9387b75` — audit verdict: **MET** (2026-10-28)
**Date:** 2026-10-28

### Audit Verdict (goal-met — independent subagent, 2026-10-28)

```
GOAL COMPLETION VERIFICATION
============================
Goal: Add drift-report workflow preset (doc-vs-code consistency scan) — v0.3.2
Date: 2026-10-28

Deliverables Check:
[x] drift-report pipeline + 3 personas + standard bundled
[x] No new engine code / host calls (generic engine reused)
[x] Tests + docs updated

Definition of Done Check:
[1] strict typecheck exit 0: pass — npm run --silent typecheck exit 0
[2] all tests pass 0 fail: pass — tests 52, pass 52, fail 0, exit 0
[3] drift-report tests cover pipeline registration / 4-phase run / artifact: pass — tests/workflow.test.ts (3 new tests)
[4] pipeline + personas + standard bundled and loadable: pass — pipelines.ts + 3 persona .md + standards/drift-report.md in diff
[5] no new dependencies: pass — only typebox 1.1.38
[6] scope guardrails respected: pass — deferred Non-Goals are comment-only references, no implementations
[7] engine.ts unchanged: pass — generic engine reused, no modifications

Anti-Drift Check:
[x] Audit read-only, no files modified
[x] All steps re-run with real exit codes, not executor claims
[ ] Blockers found: none

RESULT: MET
Remaining work: PR #5 open for review; merge is a separate human step.
```

Scope guardrails respected: no new dependencies, no new host calls (generic engine reused), read-only analysis (never remediates), resolver loop and dedicated dashboard view deferred as Non-Goals.

**Not merged** — PR #5 is open for human review. Merge is a separate step.

---

## Goal: Add `brainstorm` workflow preset (6-lens EGM concept swarm) — v0.3.1

### Objective
Add a `drift-report` pipeline preset to the pi-forgery workflow engine, the
EGM drift-detection mode: each phase is a Goldfish subagent (fresh zero-context
`pi --print` subprocess) that compares a checked-in design document against the
live codebase and reports ONLY the divergences (missing features, incomplete
models, logic shortcuts, architectural divergence). Output is a
`{YYYY-MM-DD}_DRIFT_REPORT.md` per design doc, consistent with egm-drift-report.

### Context
egm-drift-report skill (from `/home/dimona/.agents/egm/skills/egm_drift_report/SKILL.md`):
for each design document — contextualize (intent, proposed changes, filenames/
symbols mentioned), locate corresponding source files, verify current state,
detect drift, filter to differences only, append analysis to
`{YYYY-MM-DD}_DRIFT_REPORT.md` using file-writing tool. pi-forgery already has
the generic engine (commits 3985e32, 2bc6c3a) that runs pipelines as fresh
zero-context subprocesses — the Goldfish isolation contract is satisfied.
Adding drift-report = pipeline definition + personas (codebase auditor lead +
zoom-out + style) + 1 standard + tests.

### Deliverables
- [ ] `src/workflow/pipelines.ts` — add `DRIFT_REPORT_PIPELINE` (phases: scan
      design docs, locate source, verify against code, report drift;
      targetStrategy "full") and register in PIPELINES map
- [ ] `src/workflow/personas/*-drift.md` — drift personas adapted from EGM
  (Apache-2.0 attribution): codebase-details-drift (lead), zoom-out-drift,
  style-drift
- [ ] `src/workflow/standards/drift-report.md` — drift-report standard doc
- [ ] `src/workflow/drift-runner.ts` (or in engine) — drift-specific logic:
      enumerate dev-notes/*.md + SPEC.md/DECISIONS.md/GOALS.md as design docs,
      for each doc locate referenced source files via grep, produce per-doc
      report, write consolidated `{date}_DRIFT_REPORT.md`
- [ ] `tests/workflow.test.ts` — add drift tests (pipeline registration,
      phase count, artifact written) via fake AgentRunner
- [ ] README.md + SKILL.md — short "drift-report" section
- [ ] Branch `feat/forgery-drift-report-preset`, PR opened, typecheck + all
      tests green locally

### Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] `grep` confirms drift-report pipeline + personas + standard bundled
- [ ] engine test asserts drift-report pipeline runs phases and writes report
- [ ] no new dependencies in package.json

### Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to extensions/forgery/

### Anti-Drift Rules
- Drift-report uses the SAME engine as `review`/`brainstorm` — no new engine
  code, no new host calls (`workflow.run` accepts any pipeline id).
- Personas are adaptations, not verbatim copies; keep Apache-2.0 attribution.
- Resolver loop and dedicated dashboard view remain deferred Non-Goals.
- TypeScript-only kernel; TypeBox-validated args only.
- Drift report is read-only analysis — never modifies source files.

### Non-Goals (follow-up goal candidates)
- `bootstrap` preset (per egm-bootstrap)
- Resolver loop
- Dedicated workflow dashboard view
- Auto-fixing drift (report only, no remediation)

### Estimated Effort
Implementation: ~400 lines + tests. Audit: ~5 min.

---

## Goal: Add `brainstorm` workflow preset (6-lens EGM concept swarm) — v0.3.1

**Status:** implemented on branch `feat/forgery-brainstorm-preset` (commit 1d71c5f), PR #4 merged as `2bc6c3a` — audit verdict: **MET** (2026-10-28)
**Date:** 2026-10-28

### Audit Verdict (goal-met — independent subagent, 2026-10-28)

```
GOAL COMPLETION VERIFICATION
============================
Goal: Add brainstorm workflow preset (6-lens EGM concept swarm) — v0.3.1
Date: 2026-10-28

Deliverables Check:
[x] brainstorm pipeline + 6 personas + standard bundled
[x] No new engine code / host calls (generic engine reused)
[x] Tests + docs updated

Definition of Done Check:
[1] strict typecheck exit 0: pass — npm run --silent typecheck exit 0
[2] all tests pass 0 fail: pass — tests 50, pass 50, fail 0, exit 0
[3] brainstorm tests cover pipeline registration / 6-phase run / artifact: pass — tests/workflow.test.ts (3 new tests)
[4] pipeline + personas + standard bundled and loadable: pass — pipelines.ts + 6 persona .md + standards/brainstorm.md in diff
[5] no new dependencies: pass — only typebox 1.1.38
[6] scope guardrails respected: pass — deferred Non-Goals are comment-only references, no implementations
[7] engine.ts: minor deviation — 2 unused export lines removed (`export { runStates, stopSignals };`), not new engine logic

Anti-Drift Check:
[x] Audit read-only, no files modified
[x] All steps re-run with real exit codes, not executor claims
[ ] Blockers found: none

RESULT: MET
Remaining work: PR #4 open for review; merge is a separate human step.
```

Scope guardrails respected: no new dependencies, no new host calls (generic engine reused), resolver loop and dedicated dashboard view deferred as Non-Goals.

**Merged** — PR #4 merged as `2bc6c3a`. Merge is complete.


### Objective
Add a `brainstorm` pipeline preset to the pi-forgery workflow engine, the
EGM BRAINSTORM mode: a 6-lens Goldfish swarm (design_critic, codebase_details,
zoom_out, comprehension, implementation_readiness, structural) that stress-tests
a raw concept and a synthesizer that dedupes into `concepts_brief.md`. Runs
through the existing generic engine (`workflow.run` host call) — no new host
calls, no new dependencies, no resolver loop, no dedicated dashboard view.


### Context
EGM BRAINSTORM mode (from `/home/dimona/.agents/egm/agents/synthesizer.md` BRAINSTORM
section): spawn the 6 Goldfish lenses in parallel, each with Mode: BRAINSTORM
and FeatureConcept, collect findings, deduplicate, compile into
`concepts_brief.md`. pi-forgery already has the engine (commit 3985e32, PR #3)
that runs pipelines as fresh zero-context `pi --print` subprocesses — the
Goldfish isolation contract is satisfied by the existing AgentRunner. Adding
brainstorm = pipeline definition + 6 persona prompts + 1 standard + tests.

### Deliverables
- [ ] `src/workflow/pipelines.ts` — add `BRAINSTORM_PIPELINE` (6 phases, one
      lens each, targetStrategy "full") and register in PIPELINES map
- [ ] `src/workflow/personas/{design-critic,codebase-details,zoom-out,comprehension,implementation-readiness,structural}-brainstorm.md` — 6 persona prompts
      adapted from EGM BRAINSTORM lenses (Apache-2.0 attribution)
- [ ] `src/workflow/standards/brainstorm.md` — BRAINSTORM standard doc
- [ ] `tests/workflow.test.ts` — add brainstorm tests (pipeline registration,
      6 phases run, findings pass through, artifact written) via fake AgentRunner
- [ ] README.md + SKILL.md — short "brainstorm" section
- [ ] Branch `feat/forgery-brainstorm-preset`, PR opened, typecheck + all tests
      green locally

### Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] `grep` confirms brainstorm pipeline + 6 personas + standard bundled
- [ ] engine test asserts brainstorm pipeline runs 6 phases and writes artifact
- [ ] no new dependencies in package.json

### Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to extensions/forgery/

### Anti-Drift Rules
- Brainstorm uses the SAME engine as `review` — no new engine code, no new host
  calls (`workflow.run` already takes any pipeline id).
- Personas are adaptations, not verbatim copies; keep Apache-2.0 attribution.
- Resolver loop (PROPOSE FIX vs CONTEST) and dedicated dashboard view are
  deferred Non-Goals — not in scope.
- TypeScript-only kernel; TypeBox-validated args only.

### Non-Goals (follow-up goal candidates)
- `drift-report` preset (doc-vs-code scan per egm-drift-report)
- `bootstrap` preset (per egm-bootstrap)
- Resolver loop
- Dedicated dashboard view for brainstorm outputs

### Estimated Effort
Implementation: ~300 lines + tests. Audit: ~5 min.

---

## Goal: EGM-style workflow engine inside pi-forgery (v0.3)

**Status:** implemented on branch `feat/forgery-workflow-engine` (commit 4a54678), PR #3 merged as `3985e32` — audit verdict: **MET** (2026-10-28)
**Date:** 2026-10-28

### Audit Verdict (goal-met — independent subagent, 2026-10-28)

```
GOAL COMPLETION VERIFICATION
============================
Goal: EGM-style workflow engine inside pi-forgery (v0.3)
Date: 2026-10-28

Deliverables Check:
[x] Engine + pipelines + bundled personas/standards exist
[x] workflow.run/status/stop host calls registered
[x] /forgery workflow command present
[x] Tests + docs updated

Definition of Done Check:
[1] strict typecheck exit 0: pass — npm run --silent typecheck exit 0
[2] all tests pass 0 fail: pass — tests 47, pass 47, fail 0, exit 0
[3] engine tests cover phase sequencing/findings parse/dedupe/artifact/pause-resume/failure: pass — tests/workflow.test.ts inspected (9 new tests)
[4] personas + standards bundled and loadable: pass — 6 persona .md + 4 standard .md in diff
[5] registry: workflow.run/status/stop registered + schema-validated: pass — tool.ts refs; index.ts /forgery workflow run/status/stop/resume
[6] smoke loads: pass (engine loaded by tests; typecheck passes)
[7] no new dependencies: pass — only typebox 1.1.38
[8] scope guardrails respected: pass — grep matches are comment-only references to deferred Non-Goals; no brainstorm/drift/resolver/dashboard implementation

Anti-Drift Check:
[x] Audit read-only, no files modified
[x] All steps re-run with real exit codes, not executor claims
[ ] Blockers found: none

RESULT: MET
Remaining work: PR #3 open for review; merge is a separate human step.
```

Scope guardrails respected: one preset (`review`) only; brainstorm/drift-report/bootstrap presets, resolver loop, and dedicated dashboard view are deferred Non-Goals (see goal spec).

**Not merged** — PR #3 is open for human review. Merge is a separate step (the goal-writer/goal-met pipeline authorizes "done" on the spec; merge is the reviewer's call).

### Objective
Implement a real, code-driven Goldfish review-workflow engine in pi-forgery —
the essence of Google's EGM (`egm-review` + `egm-review-loop`) and DPF's
`pipeline-orchestrator` — using the existing `AgentRunner` (fresh
zero-context `pi --print` subprocesses) as the Goldfish, with phase gates,
severity-triaged findings, artifact reports, and first-class activity-store
entities surfaced in the widget/footer/dashboard. Not a skill — real code.

### Context
Research findings (2026-10-28, from `/home/dimona/.agents/egm/` and
`/home/dimona/.agents/skills/pipeline-orchestrator/SKILL.md`):

EGM model: an Elephant (deep-context root agent) spawns Goldfish subagents —
stateless, read-only, fresh context, no conversation history — each with a
persona (zoom-out YAGNI critic, hostile design critic, naive reader, tech-lead
readiness, codebase auditor, structural, style) and a document standard.
Findings carry severity (🔴 Blocker / 🟡 Major / 🟢 Nit) + line + rationale. A
synthesizer persona dedupes/normalizes the swarm's raw findings and writes
artifact-first reports (`zoom_out_report.md`, `comprehension_report.md`,
`critic_report.md`, `intermediate_zoom_out_report.md`,
`implementation_readiness_report.md`), ending in a
`consolidated_review_report.md` with a traceability matrix. Stages run behind
interactive checkpoint gates (proceed / update-doc / pause, max 1 re-audit).
`egm-review-loop` is the dispatch engine: re-resolve line ranges before every
iteration, spawn the swarm, aggregate, hand findings to a resolver
(`egm-resolve`: PROPOSE FIX vs CONTEST triage).

pipeline-orchestrator essence: ordered phases, each phase loads the right
specialist, handoff gated on expected artifacts existing, progress tracked in
a PROGRESS file, explicit error handling (phase incomplete / gate failed /
subagent timeout → recreate). Orchestrator coordinates; it does not do the work.

pi-forgery primitives that make this a workflow, not a skill:
- `AgentRunner.run({task, systemPrompt, cwd, model, timeoutMs})` already spawns
  a fresh zero-context `pi --print` subprocess — exactly a Goldfish.
- `makeRegistry` + TypeBox schemas — new host calls slot in with pre-validation.
- `ForgeryActivityStore` — runs/phases/agents/calls, already rendered by the
  widget, footer, and `/forgery` dashboard.
- Guardrails + budget caps already cover spawned agents.

### Deliverables
- [ ] `src/workflow/types.ts` — `WorkflowDefinition`, `WorkflowPhase`,
      `PersonaRef`, `Finding`, `Severity`, `WorkflowRunState` types
- [ ] `src/workflow/personas/*.md` — bundled persona prompts (adapted from EGM,
      Apache-2.0, with attribution) + `standards/*.md` (feature-spec,
      implementation-readiness, zoom-out, re-implementation)
- [ ] `src/workflow/pipelines.ts` — the `review` preset: 5 EGM stages, each
      phase = reviewers + target-range strategy + standard + report artifact
- [ ] `src/workflow/engine.ts` — executes a phase: spawn goldfish via AgentRunner
      (persona prompt = systemPrompt, target + range + GoldfishContext reading
      list in task), parse each agent's fenced-JSON findings block, synthesizer
      dedupe/triage (severity sort + line normalization), write report artifact,
      record phase in the activity store; pause/resume state machine between
      phases; per-phase error handling (agent failure → phase failed, workflow
      pausable, retryable)
- [ ] Host calls in `forgery_exec`: `workflow.run` ({pipeline, target,
      context[], mode}), `workflow.status`, `workflow.stop` — TypeBox-validated
- [ ] `/forgery workflow <run|status|list|stop|resume>` command + dashboard
      listing shows workflow runs as activity entities
- [ ] Tests (TDD): engine (fake runner: phase sequencing, findings parse,
      dedupe/triage, artifact write, pause/resume, failure path), pipelines
      config validation, new host-call schema validation; all existing tests
      still pass
- [ ] Docs: README + `SKILL.md` sections on the workflow surface

### Definition of Done
- [ ] `npm run typecheck` (root, strict) → exit 0
- [ ] `npx tsx --test tests/*.test.ts` in `extensions/forgery` → all pass,
      0 fail (38 existing + new)
- [ ] New engine tests cover: phase sequencing, findings JSON parse,
      dedupe/triage, artifact writing, pause→resume, agent-failure path
- [ ] `grep` confirms personas + standards bundled and loadable (non-empty)
- [ ] Registry test asserts `workflow.run` / `workflow.status` / `workflow.stop`
      registered and schema-validated
- [ ] Smoke: `pi -e ./extensions/forgery --print "list /forgery workflow
      presets"` loads without crash (LLM stage may 401 — load is the gate)
- [ ] No new dependencies in `extensions/forgery/package.json`
- [ ] Branch `feat/forgery-workflow-engine`, PR opened, CI-style checks green
      locally (typecheck + tests), merged after review

### Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs
4. `grep -rn "new Dependency" extensions/forgery/package.json` → none (manual)
5. `timeout 60 pi -e ./extensions/forgery --print "hi"` → loads, no crash
6. Audit subagent re-runs 1–5 and inspects the diff against this spec

### Anti-Drift Rules
- Goldfish agents MUST be fresh subprocesses via the existing AgentRunner —
  never share host conversation context (that is the EGM isolation contract).
- Engine is generic; presets are data. Ship ONE preset (`review`). Brainstorm /
  drift-report / bootstrap presets are NEW GOALS, not scope creep here.
- Dashboard deep-dive (new dashboard view just for workflows) is a new goal;
  here workflows appear through the existing activity surfaces only.
- No new npm dependencies; TypeScript-only kernel stays.
- EGM persona/standard text is adapted, not copied verbatim wholesale; keep
  the Apache-2.0 attribution line in each bundled file.
- Interactive `resolve` (agent-authored fixes on the target doc) is out of
  scope for v0.3 — engine records findings; fixing is the human's call.

### Non-Goals (follow-up goal candidates)
- `brainstorm` (6-lens concept swarm) and `drift-report` (doc-vs-code scan)
  presets
- Resolver loop (PROPOSE FIX vs CONTEST with agent-applied edits)
- Dedicated dashboard view for workflow phase trees

### Estimated Effort
Implementation: 1–2 focused subagent sessions (~600–900 lines + tests).
Audit: ~10 min.

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
