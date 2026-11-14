# SG-07 — Widget row budget & change detection

- **Status:** todo
- **Priority:** P0
- **Area:** `src/ui/widget.ts`

## Problem
- `hasChanged()` only compares row counts (1 vs 2), so content changes inside rows can be missed or cause needless re-renders.
- `maxRows - 1 - (this.expandedId ? 0 : 0)` is a no-op: the expanded state never takes budget.
- Subgoals are sliced `slice(0,3)` **outside** the budget, so the widget can exceed `maxRows` and push the editor.
- `#idleLine` calls `.slice` on an ANSI-coloured string and can cut escape sequences, which leaves colours bleeding.

## Evidence
- `src/ui/widget.ts`: `hasChanged`, the budget expression, the subgoal `slice(0,3)` and `#idleLine`

## Proposed design
- A single **layout pass** allocates rows from one budget in this order:
  1. Header/title rule: 1 row (always).
  2. Expanded pane: its content height, capped.
  3. Agents: at least 1 row, then "+N more".
  4. Subgoals: whatever is left, then "+N more".
  5. Hint footer: 1 row when focused.
- `hasChanged()` hashes the *rendered lines* (or a cheap signature: ids, statuses, counts and the spinner frame bucket) and compares it with the last render.
- Replace every `.slice` on styled strings with the SG-02 `fit()`.

## Acceptance criteria
- [ ] `render()` never returns more than `maxRows` lines for any snapshot (property test).
- [ ] Expanded mode reduces agent and subgoal rows accordingly.
- [ ] `hasChanged()` is true when any visible text changes and false when nothing changes.
- [ ] No ANSI string is cut by `.slice` anywhere in `widget.ts`.

## Tests
- A property test over random snapshots × widths 20–200 × maxRows 3–20 asserts `lines.length <= maxRows` and `visibleWidth(line) <= width`.
- A `hasChanged` unit test that uses the same snapshot twice and then one changed agent status.

## Notes / out of scope
- Depends on SG-02.
