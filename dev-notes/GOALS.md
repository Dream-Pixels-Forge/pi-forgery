# GOALS.md — per-task goal ledger

Goal specs (goal-writer) + audit verdicts (goal-met) are stored together here
so any later session can re-verify without memory. Newest first.

---

## Goal: EGM-style workflow engine inside pi-forgery (v0.3)

**Status:** in progress — spec written, implementation delegated to a subagent on `feat/forgery-workflow-engine`
**Date:** 2026-10-28

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
