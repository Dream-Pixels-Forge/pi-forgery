# SG-29 — Interactive Agent Controls in Dashboard (`stop`, `retry`, `filter`)

- **Status:** planned
- **Priority:** P1
- **Area:** `src/ui/dashboard.ts`, `src/agents/runner.ts`, `src/exec/runtime.ts`

## Problem
Users currently cannot interact with running or failed agents from the dashboard. If an agent hangs, loops, or fails, the user must wait or abort the entire Pi process.

## Evidence
- `src/ui/dashboard.ts`: Keybindings list has navigation and view switches, but lacks lifecycle operations like `stop` or `retry`.

## Proposed design
- Add keyboard actions to `ForgeryDashboard`:
  - `s` (Stop): Kill the focused agent subprocess via runner `stop(agentId)`.
  - `r` (Retry): Re-enqueue/re-run the focused failed agent using its original parameters.
  - `/` (Search / Filter): Prompt an inline text input to filter agents by name, task, or status.
- Provide clear confirmation hints in the bottom bar when an agent is selected:
  ```text
  s=stop  ·  r=retry  ·  /=filter  ·  ⏎=inspect  ·  ?=help
  ```

## Acceptance criteria
- [ ] Pressing `s` on an active agent requests termination and updates status to `stopped`.
- [ ] Pressing `r` on a failed agent triggers a re-run attempt.
- [ ] Live search filtering reduces the visible list dynamically as characters are entered.

## Tests
- `tests/dashboard.test.ts` (or `render.test.ts`): Verify keybinding `s` invokes runner stop method, and `/` filter limits visible rows.
