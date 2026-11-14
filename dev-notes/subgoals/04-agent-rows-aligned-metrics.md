# SG-04 — Agent rows with aligned columns & metrics

- **Status:** todo
- **Priority:** P1
- **Area:** `src/ui/widget.ts`, `src/ui/dashboard.ts`

## Problem
- Participants are hard-capped with `agents.slice(0, 3)` and filtered by `a.status !== "completed" || a.current`, so finished agents vanish and there's no "+N more" indicator.
- Row content (name, activity, metrics) is concatenated freely — columns don't line up between rows, making it hard to scan.
- Per-agent `usage`, `turns`, `toolCalls` exist in `ForgeryAgentRecord` but are barely surfaced.

## Evidence
- `src/ui/widget.ts` → participants block (`slice(0,3)`, completed filter)
- `src/activity/types.ts` → `ForgeryAgentRecord { usage, turns, toolCalls, status }`

## Proposed design
Fixed column grid computed once per render:
```
 glyph  name(≤12)   activity (flex)                 calls   tokens   time
 ⠹      planner     reading src/auth/session.ts        12     8.1k    41s
 ✓      coder       wrote 3 files                      31    22.4k  1m32s
 ✗      tester      exit 1: 2 failing                   9     4.0k    18s
        … +2 more (⏎ dashboard)
```
- Name column width = `min(12, max(name widths))`; activity column flexes; metric columns right-aligned, fixed width.
- Drop metric columns progressively as width shrinks (time → tokens → calls).
- Ordering: running → blocked/queued → failed → completed (most recent first).
- Show completed agents dimmed instead of hiding them when budget allows.
- Overflow row `… +N more` (muted).
- Same row renderer shared with the dashboard agents table (SG-18).

## Acceptance criteria
- [ ] Columns align across all rows at any width ≥ 40.
- [ ] No agent silently disappears: hidden agents are counted in `+N more`.
- [ ] Failed agents are always shown (priority over completed).
- [ ] Token counts use compact format (`8.1k`, `1.2M`), durations `41s / 1m32s / 1h04m`.

## Tests
- Unit: column layout function with 1, 3, 8 agents and widths 40/80/120.
- Unit: sort order fixture.
- Golden render (SG-25).

## Notes / out of scope
- Depends on SG-01, SG-02, SG-07. Agent↔run linking in SG-24.
