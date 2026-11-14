# SG-15 — Dashboard: panels, run tabs & run summary

- **Status:** todo
- **Priority:** P1
- **Area:** `src/ui/dashboard.ts`

## Problem
- The `/forgery` overlay is a flat list of lines with no visual structure. There is no tab bar for switching runs (only an undocumented `[`/`]`), no run summary header, and no grouping of agents, subgoals and events.

## Evidence
- `src/ui/dashboard.ts`: render builds a single line array, and the header is ANSI-sliced

## Proposed design
```
╭─ forgery ─────────────────────────────────────────────────────────────╮
│  ‹ run 3 ›  run 2   run 1                          ⠹ running · 2m14s  │
├───────────────────────────────────────────────────────────────────────┤
│  goal  Add OpenAI cache pricing                                       │
│  ▰▰▰▰▰▰▱▱▱▱ 6/10 subgoals · 5 agents (2⠹ 3✓) · 48.1k tok · $0.37     │
├─ Agents ──────────────────────────────┬─ Subgoals ────────────────────┤
│ ▌⠹ planner  reading types.ts  12 41s  │ ├─ ✓ pricing table            │
│   ✓ coder   wrote 3 files     31 1m3s │ ├─ ⠹ openai adapter  ▰▰▱ 2/3  │
│   ✓ tester  14 passed          8 22s  │ └─ ○ google adapter           │
├─ Events ──────────────────────────────┴───────────────────────────────┤
│ 12:04:11 ⠹ planner started   12:04:52 ✓ coder done   …                │
╰─ tab panes · ←→ runs · ↑↓ select · ⏎ details · ? help · esc close ────╯
```
- Tab bar: the active run is bold accent with `‹ ›`. Others are dim. The status glyph sits per tab. It overflows with `…+3`.
- Summary block: goal (one line), a progress bar, agent status counts, tokens and cost.
- Two-column body when width ≥ 100. Stacked panels below that.
- Focusable panes: tab cycles focus, and the focused pane gets an accent border title.

## Acceptance criteria
- [ ] The tab bar renders every run and highlights the active one.
- [ ] The summary block is always visible at the top.
- [ ] Layout switches between two-column and stacked at the breakpoint.
- [ ] Borders use the SG-02 `panel()` primitive and are width-safe.

## Tests
- Golden tests at 80 and 140 columns with one run and with three runs.

## Notes / out of scope
- Depends on SG-02, SG-04, SG-05 and SG-16. Scrolling is in SG-17; events are in SG-19.
