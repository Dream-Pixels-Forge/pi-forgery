# SG-18 — Dashboard: correct agent durations & aligned table

- **Status:** todo
- **Priority:** P0
- **Area:** `src/ui/dashboard.ts`

## Problem
- Agent duration is computed as `snap.now - startedAt` even for finished agents. Completed agents' times keep growing forever.
- Agent rows in the dashboard are ad-hoc strings with no column alignment, and they duplicate the widget's row logic.

## Evidence
- `src/ui/dashboard.ts`: agent duration expression and agent row formatting

## Proposed design
- `agentElapsed(a, now) = (a.finishedAt ?? now) - (a.startedAt ?? now)`. Shared in `format.ts` and used by the widget, the footer and the dashboard.
- Reuse the SG-04 column-grid row renderer in a "wide" mode with extra columns:

| col | width | content |
|---|---|---|
| status | 2 | SG-01 glyph |
| name | ≤16 | agent name |
| activity | flex | last tool / text, one line |
| turns | 4 | `t12` |
| calls | 4 | tool calls |
| tokens | 6 | `22.4k` |
| cost | 6 | `$0.12` |
| time | 6 | `1m32s` |

- A header row in dim with right-aligned numeric columns.
- A totals row at the bottom of the table, separated by a `─` rule.

## Acceptance criteria
- [ ] Completed agents show a frozen duration (test with an advancing `now`).
- [ ] Widget and dashboard use the same row renderer.
- [ ] Numeric columns are right-aligned, and columns drop by priority when narrow.

## Tests
- An `agentElapsed` unit test.
- A golden table test at 100 and 160 columns.

## Notes / out of scope
- Depends on SG-02 and SG-04.
