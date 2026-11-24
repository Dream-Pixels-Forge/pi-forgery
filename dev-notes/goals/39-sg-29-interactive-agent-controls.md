# Goal: SG-29 — Interactive Agent Controls in Dashboard (stop, retry, filter)

## Objective
Add interactive lifecycle controls to the `/forgery` dashboard so users can stop a running agent, retry a failed agent, and filter the agent list by name/task/status — all from the keyboard while the dashboard is open.

## Context
SG-29 is a planned UI subgoal (P1). The dashboard already renders agent rows with focused entity selection (`entityIndex`) and an inspector drawer (`inspectingAgentId`), but lacks lifecycle operations. `AgentRunner.stop(agentId)` already exists; there is no `retry` method, no text-input filter state, and no `s`/`r`/`/` keybindings.

## Deliverables
- [ ] `AgentRunner.retry(agentId)` method — re-spawns a failed/stopped agent using its stored original run parameters (cwd, model, systemPrompt, timeoutMs)
- [ ] Store original agent run parameters on `ForgeryAgentRecord` (cwd, model, systemPrompt, timeoutMs) so retry can reproduce them
- [ ] Dashboard keybindings: `s`=stop focused agent, `r`=retry focused failed/stopped agent, `/`=enter filter text input
- [ ] Dashboard filter state: text input that filters visible agents by name/task/status (live as characters are entered)
- [ ] Help bar updated to show `s=stop · r=retry · /=filter` alongside existing keys
- [ ] Tests covering: stop via `s`, retry via `r`, filter via `/`
- [ ] All existing tests still pass (no regressions)

## Definition of Done
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail, 0 skip
- [ ] `npm run build` → exit 0
- [ ] `s` key on a focused running agent calls `runner.stop()` and status becomes `stopped`
- [ ] `r` key on a focused failed/stopped agent calls `runner.retry()` and re-spawns the agent
- [ ] `/` key enters filter mode; typing reduces visible agent rows dynamically
- [ ] Filter clears on Esc or when no matches

## Verification Steps
1. Add `retry` to AgentRunner + store run params on ForgeryAgentRecord
2. Add `s`/`r`/`/` keybindings + filter state to ForgeryDashboard
3. Update help bar
4. Write tests (stop, retry, filter)
5. `npx tsc --noEmit` → exit 0
6. `npx tsx --test tests/*.test.ts` → all pass
7. `npm run build` → exit 0

## Anti-Drift Rules
- Only add SG-29 controls; do not refactor existing keybindings or render paths.
- Do not change the `stop` method behavior — reuse it as-is.
- Retry only re-spawns agents whose status is `failed`, `stopped`, `timed_out`, or `unavailable` (not `running`/`completed`/`queued`).
- Filter is case-insensitive substring match on name, task, or status.
- No new dependencies.

## Estimated Effort
Medium: ~2-3 hours.
