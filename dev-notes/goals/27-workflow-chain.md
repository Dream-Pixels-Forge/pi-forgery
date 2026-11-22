# Goal: Workflow Chain — `workflow.chain`

## Objective
Add `workflow.chain({ steps, target, gates?: ... })` host call that runs a sequence of presets (`bootstrap → implement → drift-report → resolver` etc.) as a single pipeline, passing each phase's artifact paths forward to the next, with gates between stages (proceed / pause / abort).

## Context
pi-forgery's workflow engine already runs individual presets (`workflow.run <preset>`), but presets compose poorly: the caller must manually pass each phase's outputs to the next. `workflow.chain` turns presets into a pipeline — phase 1 writes artifacts, phase 2 reads them, phase 3 reviews, phase 4 self-heals on blockers — all driven by the existing activity store and runner, no new machinery beyond a chain runner + gate host calls.

## Deliverables
- [ ] `src/workflow/chain.ts` — `WorkflowChain` class: runs preset list sequentially, threads artifact paths, honors gates between stages (+~90 lines)
- [ ] `src/exec/tool.ts` — register `workflow.chain` host call (+~20 lines); optional `workflow.gate` (proceed/pause/abort) (+~25 lines)
- [ ] `extensions/forgery/tests/workflow-chain.test.ts` — unit tests: two-step chain passes artifact, gate=pause halts, gate=abort rolls back stage state (+~60 lines)
- [ ] `docs/workflows.md` — document `workflow.chain` and gate semantics (+one section)

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] `workflow.chain({ steps: ["bootstrap","implement"], target })` runs bootstrap then implement, threading artifacts
- [ ] Gate=pause halts between stages and can be resumed via `workflow.resume` (goal 30) or aborted
- [ ] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

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
