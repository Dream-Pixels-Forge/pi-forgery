# SG-03 — Widget "card" layout with clear hierarchy

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/widget.ts`

## Problem
The above-editor widget is a flat run of text lines. The header
`" {spinner} forgery {name} ·{calls}{tokens}{cost}{dur}"` packs everything into one line with ad-hoc separators, no visual grouping between header, participants and subgoals, and no affordance hints. It reads as debug output rather than a modern status card.

## Evidence
- `src/ui/widget.ts` → `render()`, header builder, participants block, subgoals block

## Proposed design
A compact card with a title rule, aligned body and a subtle hint line:
```
╭─ ⠹ forgery · implement-auth ─────────────── 2m14s · $0.42 ─╮
│ ⠹ planner     reading src/auth/*.ts          12 calls  8.1k │
│ ✓ coder       wrote 3 files                  31 calls 22.4k │
│ ○ reviewer    queued                                         │
│ ├─ ✓ 1. schema migration                                     │
│ └─ ⠹ 2. login route            ▰▰▰▱▱ 3/5                     │
╰─ ↑↓ select · ⏎ expand · esc close ─────────────────────────╯
```
- Title rule: spinner + `forgery` (accent, bold) + run name (text); right-aligned duration & cost (muted).
- Body rows rendered by SG-04 (agents) and SG-05 (subgoals).
- Footer hint rule only when the widget has focus (SG-06); otherwise plain bottom border.
- Borders use `border` token; degrade to no-border mode when `width < 40`.
- Uses `panel()` from SG-02.

## Acceptance criteria
- [ ] Header shows: state glyph, product name, run name, elapsed, cost — elapsed/cost right-aligned.
- [ ] Tokens/calls moved out of the header into per-agent rows (header stays scannable).
- [ ] Card never exceeds `width`; at `< 40` cols, borders drop and content still fits.
- [ ] Respects theme tokens only (no hardcoded ANSI).

## Tests
- Golden renders at widths 40, 80, 120 (SG-25).
- Narrow-width test: 30 cols → no border characters, no overflow.

## Notes / out of scope
- Depends on SG-01, SG-02. Row budget handled in SG-07.
- Related goals: `goals/12-theme-restyling`, `goals/16-box-formatted-output`.
