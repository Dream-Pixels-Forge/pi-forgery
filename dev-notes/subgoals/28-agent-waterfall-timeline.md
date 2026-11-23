# SG-28 — Visual Timeline / Waterfall View for Parallel Agents

- **Status:** planned
- **Priority:** P2
- **Area:** `src/ui/dashboard.ts`, `src/ui/format.ts`

## Problem
When executing multi-agent workflows (such as `agents.runParallel`, 6-lens brainstorm reviewers, or dev loops), users cannot easily discern concurrency, execution overlap, or bottleneck agents from a flat tree list.

## Evidence
- Dashboard activity view renders agents in a vertical tree/table, showing start times and total durations, but without temporal alignment.

## Proposed design
- Introduce a visual timeline / Gantt chart mode in `ForgeryDashboard` toggled with key `w` (waterfall).
- Compute relative start and duration offsets relative to the run's `startedAt` and `finishedAt` (or `now`).
- Render bar blocks with braille or box block characters (`█`, `░`) representing agent execution windows:
  ```text
  planner      [██████░░░░░░░░░░░░░░░░░░░░░░] 12s  (done)
  researcher        [████████░░░░░░░░░░░░░░░] 18s  (done)
  coder                  [████████████░░░░░░] 34s  (running)
  reviewer                            [░░░░░]  --  (queued)
  ```
- Highlight the critical path / currently active blocking agent.

## Acceptance criteria
- [ ] Pressing `w` in dashboard toggles between table view and timeline waterfall view.
- [ ] Bar positions correspond accurately to relative start times and durations.
- [ ] Works cleanly across runs with 2 to 20+ parallel agents.

## Tests
- `tests/format.test.ts`: Unit test timeline bar generator with varied start/end intervals.
- `tests/render.test.ts`: Dashboard renders timeline without column misalignment or boundary clipping.
