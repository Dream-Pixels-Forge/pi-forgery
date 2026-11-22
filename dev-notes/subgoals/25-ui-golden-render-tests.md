# SG-25 — Golden render tests for UI surfaces

- **Status:** done
- **Priority:** P0
- **Area:** `extensions/forgery/tests/`, `tests/fixtures/ui/`

## Problem
UI changes (widget, footer, dashboard) have no visual regression safety net. Width overflows and misalignment only show up by eye in a live terminal.

## Evidence
- render.test.ts and format.test.ts check fragments and never assert full-surface output at fixed widths.

## Proposed design
- A harness `tests/helpers/uiGolden.ts`:
  - It uses a fake theme where `fg(token, text) => "[" + token + ":" + text + "]"`. That makes colors visible in the snapshot, while widths are measured with the theme stripped.
  - It uses a fixed clock (`now = 1_700_000_000_000`) and a fixed spinner frame (SG-14).
  - It renders each surface at widths 40, 80 and 120, with the `ascii` icon set (SG-23).
- Fixtures go in `tests/fixtures/ui/<surface>-<scenario>-<width>.txt`.
- `UPDATE_GOLDEN=1 npx tsx --test tests/ui-golden.test.ts` regenerates them.
- Scenarios:
  - idle
  - one running agent
  - five mixed-status agents
  - failed run
  - subgoal tree
  - a very long task name
  - a narrow terminal

## Acceptance criteria
- [ ] Every rendered line satisfies `visibleWidth(stripTheme(line)) <= width` at all widths.
- [ ] Snapshots exist for the widget, footer (one and two lines) and dashboard panels.
- [ ] A mismatch prints a readable line diff.

## Tests
- This subgoal is the test suite. It runs in the normal `npx tsx --test tests/*.test.ts`.

## Notes / out of scope
- Land it early, because every other UI subgoal updates its goldens. True ANSI or color rendering checks are out of scope.
