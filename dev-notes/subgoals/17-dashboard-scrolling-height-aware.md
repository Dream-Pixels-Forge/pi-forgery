# SG-17 — Dashboard: height-aware layout & scrolling

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/dashboard.ts`

## Problem
- `#pad(lines, width, 24)` fixes the content at 24 rows whatever the terminal height. Small terminals clip the content and large ones waste space.
- No list scrolls, so anything past row 24 is unreachable.

## Evidence
- `src/ui/dashboard.ts`: `#pad(lines,width,24)`, overlay `maxHeight: 90%`

## Proposed design
- Read the available rows from the overlay or the TUI (`tui.rows * 0.9`) and allocate them as follows:
  - Header and summary: fixed.
  - Footer and help: 1 row.
  - The remaining rows are split between panes. Favour the focused pane, with a minimum of 3 rows each.
- A reusable `ScrollView { offset, height, items }` that keeps the selection visible: scrolling follows the cursor.
- Scroll indicators in the pane border: `↑ 4 more` / `↓ 12 more`, plus a thin scrollbar `┃` in the right border when the content overflows.
- PgUp/PgDn and Home/End inside the focused pane.

## Acceptance criteria
- [ ] The overlay fills the available height from 20 up to 80 rows without overflow.
- [ ] The selection is always visible after any movement.
- [ ] Scroll indicators show accurate counts.
- [ ] No fixed 24-row padding remains.

## Tests
- `ScrollView` unit tests: follow cursor, clamping, page moves.
- Golden tests at 20 and 50 rows.

## Notes / out of scope
- Depends on SG-15 and SG-16. Reused by SG-22 (transcript).
