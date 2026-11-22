# SG-09 — Footer: priority-based responsive segments

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/footer.ts`

## Problem
- The footer concatenates every segment with `"  ·  "` and then truncates the result. On narrow terminals the rightmost segments (often the most useful, such as handoff warnings or CI failures) are cut mid-word.
- The separator alone takes 5 columns per gap.
- The project segment `📁 basename` uses an emoji whose width varies between terminals.

## Evidence
- `src/ui/footer.ts`: segment array, `join("  ·  ")`, then `truncate`

## Proposed design
- Each segment becomes `{ id, priority, render(width): string, minWidth, align: "left"|"right" }`.
- Layout:
  - Left group: branch, project, model/effort.
  - Right group: context gauge, compacts, CI, run, subgoals.
  - Fill from the highest priority down and drop whole segments, never mid-word.
- Separator: a dim `│` with single spaces (3 columns), or a powerline-style chevron when nerd-font icons are on (SG-23).
- Alert segments (handoff required, CI failing, run failed) get priority 0 and an attention colour, so they survive at any width.
```
 ⎇ feat/cache-pricing │ pi-forgery │ opus·high            ctx ▰▰▰▰▱ 72% │ ✓ CI │ ⠹ run 2/5
```
Narrow (60 cols):
```
 ⎇ feat/cache…│ opus·high                    ctx 72% │ ⠹ 2/5
```

## Acceptance criteria
- [ ] No segment is ever cut mid-text. Segments are dropped or swapped for their compact form.
- [ ] Alerts are visible at 40 columns.
- [ ] The left and right groups align to the edges, with a flexible gap between them.
- [ ] Output width is never more than the terminal width.

## Tests
- Golden tests at 40, 60, 80, 120 and 200 columns with an alert present and absent.

## Notes / out of scope
- Depends on SG-02. Feeds SG-10, SG-11, SG-12 and SG-13.
