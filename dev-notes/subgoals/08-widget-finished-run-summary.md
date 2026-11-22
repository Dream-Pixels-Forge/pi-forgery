# SG-08 — Finished-run summary card

- **Status:** done
- **Priority:** P2
- **Area:** `src/ui/widget.ts`

## Problem
- After a run ends, the retention window shows only the generic idle line. The user loses the outcome (success or failure, cost, duration, what failed) the moment the run completes.

## Evidence
- `src/ui/widget.ts`: the retention branch renders `#idleLine` only

## Proposed design
During the retention window, render a compact one- or two-row summary instead of the idle line:
```
╭─ ✓ forgery run completed ───────────────── 3m12s · $0.42 ─╮
│ 5 agents · 4✓ 1✗ · subgoals 6/7 · 41.2k tok · ⏎ details    │
╰────────────────────────────────────────────────────────────╯
```
- The title glyph and colour come from the run status (SG-01).
- On failure, show the first failing agent or subgoal and a short error: `✗ tester — exit 1: 2 failing`.
- The summary fades to the idle line when retention expires. It disappears immediately when a new run starts.
- Enter opens the dashboard on that run.

## Acceptance criteria
- [ ] Completed, failed and cancelled runs each show a distinct summary.
- [ ] Duration uses `finishedAt - startedAt`, not `now - startedAt`.
- [ ] Below 40 columns it collapses to a single unbordered line.

## Tests
- Golden render tests (SG-25) for a completed run, a failed run and a narrow width.

## Notes / out of scope
- Depends on SG-01, SG-02 and SG-03.
