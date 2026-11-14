# Goal: Dry-Run / Validation-Only Mode for `forgery_exec`

## Objective
Add a `dryRun: boolean` param to `forgery_exec` that validates every host call's arguments against its schema and reports the planned call sequence without executing any host call — a pre-flight safety check.

## Context
The runtime already statically validates each host call before execution. Dry-run exposes that validation as a user-facing safety feature: an LLM can author a program, run it with `dryRun: true`, inspect the planned calls and predicted previews, then execute for real. Strengthens the "auditable" goal with zero new dependencies.

## Deliverables
- [ ] `src/exec/tool.ts` — add `dryRun: Type.Optional(Type.Boolean())` to `PARAMS`, pass through to `runForgery` (+~15 lines)
- [ ] `src/exec/runtime.ts` — thread `dryRun` through `runProgram`/`buildHostProxy`; when true, validate args but skip `spec.execute`, return `{ planned: [{ref, args}], ok }` (+~35 lines)
- [ ] `extensions/forgery/tests/` — dry-run test: invalid args return errors, good args return planned calls, no store mutations occur (+~30 lines)
- [ ] `docs/usage.md` — dry-run section

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] All tests pass
- [ ] `dryRun: true` with invalid args → structured validation error, no side effects
- [ ] `dryRun: true` with valid args → returns planned call list, store revision unchanged
- [ ] `dryRun: false` (default) → unchanged behavior (all existing tests still pass)

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Dry-run never executes host calls — only validates args and reports planned sequence
- No store mutations, no agent spawns, no shell calls during dry-run
- Default behavior (`dryRun: false` or omitted) is unchanged

## Non-Goals (follow-up goal candidates)
- Predicting token cost per call (that's `cost.estimate`)
- Full program static analyzer beyond arg validation
- Executing calls in a sandboxed "preview" mode

## Estimated Effort
Implementation: ~80 lines + tests. Audit: ~5 min.
