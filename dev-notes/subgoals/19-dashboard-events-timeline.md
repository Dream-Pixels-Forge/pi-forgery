# SG-19 — Dashboard: events timeline & items

- **Status:** todo
- **Priority:** P2
- **Area:** `src/ui/dashboard.ts`

## Problem
- `run.events` and `run.items` exist in `ForgeryRun` but are never rendered. The user can't see what happened when, such as phase transitions, compactions, errors or tool calls.

## Evidence
- `src/activity/types.ts`: `ForgeryRun.events`, `ForgeryRun.items`
- `src/ui/dashboard.ts`: no reference to either

## Proposed design
- An **Events** pane: a reverse-chronological, scrollable timeline built on SG-17's `ScrollView`.
```
 12:04:52  ✓ coder        completed · 31 calls · 1m03s
 12:04:40  ↻ compaction   ctx 86% → 41%
 12:04:11  ⠹ planner      started
 12:04:10  ▸ phase        plan → execute
```
- Event kinds map to SG-01 glyphs and colours. Errors are red, and Enter expands them to the full message.
- `f` filter cycles: all → errors → agents → phases.
- Relative-time option: `+42s` instead of a clock time (toggle `t`).
- Items, meaning the run's deliverables or artifacts, go in a separate small section or sub-tab with a list of produced files and outputs.

## Acceptance criteria
- [ ] Every event kind in the types has a glyph and colour.
- [ ] The timeline scrolls and filters.
- [ ] Items are listed when present and the section is hidden when empty.

## Tests
- Golden test with a mixed-event fixture.
- Filter unit test.

## Notes / out of scope
- Depends on SG-15, SG-16 and SG-17. Activity export/replay data (goal 24) can feed the same view.
