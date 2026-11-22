# Goal: Workflow Chain — `workflow.chain`

## Objective
Add `workflow.chain({ steps, target, gates?: ... })` host call that runs a sequence of presets (`bootstrap → implement → drift-report → resolver` etc.) as a single pipeline, passing each phase's artifact paths forward to the next, with gates between stages (proceed / pause / abort).

## Context
pi-forgery's workflow engine already runs individual presets (`workflow.run <preset>`), but presets compose poorly: the caller must manually pass each phase's outputs to the next. `workflow.chain` turns presets into a pipeline — phase 1 writes artifacts, phase 2 reads them, phase 3 reviews, phase 4 self-heals on blockers — all driven by the existing activity store and runner, no new machinery beyond a chain runner + gate host calls.

## Deliverables
- [x] `src/workflow/chain.ts` — `WorkflowChain` class: runs preset list sequentially, threads artifact paths, honors gates between stages
- [x] `src/exec/tool.ts` — register `workflow.chain` host call; `workflow.gate` (proceed/pause/abort)
- [x] `extensions/forgery/tests/workflow-chain.test.ts` — unit tests: two-step chain passes artifact, gate=pause halts, gate=abort stops
- [x] `docs/workflows.md` — document `workflow.chain` and gate semantics

## Definition of Done
- [x] root `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail (223 tests)
- [x] `workflow.chain({ steps: ["bootstrap","drift-report"], target })` runs bootstrap then drift-report, threading artifacts
- [x] Gate=pause halts between stages and can be resumed via `workflow.resume` (goal 30) or aborted
- [x] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Composition only: `workflow.chain` calls the same `workflow.run` engine paths as individual presets — no duplicate preset logic
- Gate state is stored in `activity.store` so pause/resume survives the tick loop
- No new npm dependencies; TypeScript-only

## Non-Goals (follow-up goal candidates)
- Dynamic step generation (steps list is static per call)
- Parallel step execution (chain is sequential by design)

## Estimated Effort
Implementation: ~135 lines + tests. Audit: ~5 min.
