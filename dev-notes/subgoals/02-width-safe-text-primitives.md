# SG-02 — Width-safe text primitives (ANSI + wide chars)

- **Status:** todo
- **Priority:** P0
- **Area:** `src/ui/format.ts` (+ call sites in widget/dashboard/footer)

## Problem
Several helpers measure or cut strings by **JS character count** instead of **display width**, and some cut *after* ANSI coloring:
- `truncate()` counts `.length`, so emoji (`📁`), CJK and combining chars overflow.
- `#idleLine` (widget) and the dashboard header call `.slice(0, width)` on already-colored strings — this can cut an escape sequence in half and bleed color into the next line.
- `visibleLength` uses a hand-rolled regex that misses OSC/hyperlink sequences.
- `safeText` docs claim it collapses whitespace; it does not, so multi-line tool previews break row layout.
- `box()` exists (square corners) but is unused and not width-aware.

## Evidence
- `src/ui/format.ts` → `truncate`, `safeText`, `visibleLength`, `box`
- `src/ui/widget.ts` → `#idleLine` `.slice(0,width)`
- `src/ui/dashboard.ts` → header `.slice(0,width)`

## Proposed design
Wrap `@earendil-works/pi-tui` primitives and forbid raw slicing:
```ts
export const vw = visibleWidth;                       // from pi-tui
export function fit(text: string, width: number, ellipsis = "…"): string; // truncateToWidth
export function padEnd(text: string, width: number): string;   // pad by visible width
export function padStart(text: string, width: number): string;
export function cols(cells: Array<{ text: string; width: number; align?: "left"|"right" }>, gap = 1): string;
export function oneLine(text: string): string;   // collapse \s+ → " ", strip control chars
```
- `safeText` → actually collapse whitespace (or rename to `oneLine` and fix callers).
- Delete `visibleLength`; use `visibleWidth`.
- Replace `box()` with a rounded, width-aware `panel()` (used by SG-03 / SG-15):
```
╭─ title ───────────────╮
│ content               │
╰───────────────────────╯
```

## Acceptance criteria
- [ ] No `.slice(0, width)` / `.substring` on rendered (ANSI) strings anywhere in `src/ui/`.
- [ ] Every rendered line satisfies `visibleWidth(line) <= width` for widths 20…200.
- [ ] Strings containing emoji, CJK, tabs and newlines render on exactly one row.
- [ ] Escape sequences are never split (no color leak into following line).

## Tests
- Property-style test: random strings × widths → `visibleWidth(fit(s,w)) <= w`.
- Fixtures: `"📁 項目 name\twith\nnewline"`, colored strings, OSC 8 links.
- Lint-ish test: grep `src/ui` for `.slice(0, width)` and fail.

## Notes / out of scope
- Related goal: `goals/16-box-formatted-output`.
