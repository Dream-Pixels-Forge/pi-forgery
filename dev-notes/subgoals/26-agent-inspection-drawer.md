# SG-26 — Interactive Agent Inspection Drawer / Drill-Down Modal

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/dashboard.ts`, `src/ui/widget.ts`, `src/ui/format.ts`

## Problem
In `ForgeryDashboard`, pressing `Enter` on an agent is currently a no-op placeholder (`toggleDetails(): void`). Users cannot see full agent task prompts, live execution thoughts, tool arguments, cost/token metrics, retry attempts, or error traces without reading log files outside the TUI.

## Evidence
- `src/ui/dashboard.ts`: `toggleDetails()` is empty:
  ```ts
  toggleDetails(): void {
    // details pane is deferred to a later subgoal; keep the binding stable.
  }
  ```

## Proposed design
- When pressing `Enter` on a focused agent in `ForgeryDashboard`, toggle an agent inspection drawer / overlay:
  - Header: Agent name, status glyph, elapsed duration, model ID, retry attempts, and total tokens/cost.
  - Section 1 (Task & Context): Complete prompt task and template type (e.g., `coder`, `reviewer`).
  - Section 2 (Live / Last Action): Detailed view of current tool name, arguments preview, and execution duration.
  - Section 3 (Output / Error Trace): Scrollable transcript of agent thoughts, structured JSON outputs, or full error message if failed.
- Keyboard bindings inside drawer:
  - `Esc` / `Enter`: Close drawer and return to agent list.
  - `j` / `k` / `Up` / `Down`: Scroll through long task and output text.
  - `y`: Copy agent text/output to clipboard (or emit preview).

## Acceptance criteria
- [x] Pressing `Enter` on an agent toggles the inspection drawer.
- [x] Shows full prompt, status, model, tokens, tool arguments, and error traces.
- [x] Long content scrolls cleanly without breaking panel borders or width bounds.
- [x] Esc cleanly returns focus back to the entity table.

## Tests
- `tests/render.test.ts`: Test toggling details drawer, verifying prompt, metrics, and error content are rendered within terminal boundaries.
- `tests/ui-golden.test.ts`: Capture golden renders of open inspection drawer at 80 and 120 columns.
