# SG-05 — Subgoal tree with connectors & progress bars

- **Status:** todo
- **Priority:** P1
- **Area:** `src/ui/widget.ts`, `src/ui/dashboard.ts`

## Problem
- Subgoals are flat lists capped at `slice(0,3)` (widget) / 10 (dashboard); `parentSubgoalId` hierarchy is ignored.
- Widget subgoal rows don't count against the row budget → widget can grow past `maxRows`.
- `total/completed` and `acceptanceCriteria` are available but no progress bar is shown.
- Glyph conflicts (blocked `◐` vs running `◐`) — fixed by SG-01.

## Evidence
- `src/ui/widget.ts` → subgoals block (`slice(0,3)`)
- `src/ui/dashboard.ts` → subgoals section (≤10, `⟳`/`○`)
- `src/activity/types.ts` → `ForgerySubgoal { parentSubgoalId, acceptanceCriteria, total, completed, usage }`

## Proposed design
```
subgoals 3/7 ▰▰▰▰▱▱▱▱▱▱
├─ ✓ 1. schema migration
├─ ⠹ 2. login route                ▰▰▰▱▱ 3/5
│  ├─ ✓ 2.1 handler
│  └─ ○ 2.2 rate-limit
└─ ⊘ 3. e2e tests  blocked: needs 2
```
- Build tree from `parentSubgoalId`; render with `├─ └─ │` connectors (ASCII fallback `|- \- |` via SG-23).
- Per-node mini bar when `total > 0` (5 cells widget, 10 cells dashboard).
- Widget: show active branch + next pending only (collapse completed siblings into `✓ 4 done`).
- Dashboard: full tree, scrollable (SG-17).

## Acceptance criteria
- [ ] Nested subgoals render indented under their parent with correct connectors.
- [ ] Orphans (missing parent) render at root, not dropped.
- [ ] Widget subgoal rows are accounted in the row budget (SG-07).
- [ ] Progress bar matches `completed/total`, clamps to [0,1], hidden when `total` is 0/undefined.

## Tests
- Unit: tree builder (nesting, orphans, cycles guarded).
- Unit: bar renderer 0%, 50%, 100%, >100%.
- Golden render (SG-25).

## Notes / out of scope
- Related goal: `goals/22-subgoal-progress-ui`.
