# SG-30 — Multi-Phase Pipeline Progress Stepper Ribbon

- **Status:** planned
- **Priority:** P2
- **Area:** `src/ui/widget.ts`, `src/ui/dashboard.ts`, `src/ui/format.ts`

## Problem
In chained workflows (`workflow.chain`) or multi-phase developer loops (`research` → `plan` → `test` → `code` → `review` → `gate`), phase progression is buried inside nested subgoals or event logs. Users cannot see high-level stage progress at a glance.

## Evidence
- Runs display a textual goal name and subgoal fraction (`2/5 subgoals`), but no visual phase stepper representing sequential pipeline gates.

## Proposed design
- Implement a `pipelineStepper(phases, activePhaseId, width)` component:
  ```text
  [✓ Research] ─── [✓ Plan] ─── [⠹ Code (2)] ─── [○ Review] ─── [⏸ Gate]
  ```
- Colors and icons:
  - Green `✓`: Completed stage
  - Accent `⠹`: Active stage with number of active agents
  - Dim `○`: Upcoming stage
  - Warning/Amber `⏸`: Paused gate waiting for user action (`workflow.resume`)
- Embed at the top of `ForgeryDashboard` and in `ForgeryWidget` during phased workflow executions.

## Acceptance criteria
- [ ] Phased runs render a compact pipeline stepper ribbon.
- [ ] Step states accurately reflect phase status (`completed`, `running`, `pending`, `paused`).
- [ ] On narrow terminals (< 60 cols), automatically truncates to `Stage 2/5: Code ⠹`.

## Tests
- `tests/format.test.ts`: Verify ribbon formatting across full-width and compact viewports.
- `tests/render.test.ts`: Ensure ribbon renders seamlessly in dashboard and widget headers.
