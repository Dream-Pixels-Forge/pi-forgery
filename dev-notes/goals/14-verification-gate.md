# Goal: Run verification gate

## Objective
Confirm all subgoal changes pass the full verification gate: typecheck, tests, and build.

## Context
All code changes are complete. Need final confirmation that nothing is broken before considering the work done.

## Deliverables
- [ ] `npm run typecheck` → exit 0
- [ ] `npm test` → all tests pass, 0 fail
- [ ] `npm run build` → clean `dist/` bundle

## Definition of Done
- [ ] All three commands exit 0
- [ ] Test count: 76/76 pass (was 59, +17 new tests)

## Verification Steps
1. `npm run typecheck` → exit 0
2. `npm test` → all pass
3. `npm run build` → clean `dist/`

## Anti-Drift Rules
- No code changes in this goal — verification only
- If any gate fails, fix the code and re-run

## Non-Goals
- Live `pi -e` smoke test (requires API key, expected 401)
- PR review or merge

## Estimated Effort
~5 minutes
