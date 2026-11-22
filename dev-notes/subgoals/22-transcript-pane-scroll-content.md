# SG-22 — Wrapped, scrollable agent transcript pane

- **Status:** done
- **Priority:** P2
- **Area:** `extensions/forgery/src/ui/controller.ts`, `extensions/forgery/src/ui/dashboard.ts`

## Problem
The activity interaction shows agent output with a hard `agent.text.slice(0, 120)`, which has no wrapping, no scrolling and no way to read the full output. The footer's `compactMax` is also hardcoded to 5.

## Evidence
- `controller.ts` ~305: ``lines.push(`    ${agent.text.slice(0, 120)}`)``, with an inline `✗` glyph.
- `controller.ts` ~354: `compactMax: () => 5`.

## Proposed design
```
╭─ reviewer · ● running · 3 turns · 12 tools ─────────────╮
│ Reviewing src/ui/footer.ts …                             │
│ Found 2 issues: width overflow at line 88, and the       │
│ spinner frame advancing per call rather than per time.   │
│                                              ↓ 14 more   │
╰─ ↑/↓ scroll · PgUp/PgDn · Esc back ─────────────────────╯
```
- Wrap with `wrapTextWithAnsi(text, innerWidth)` and show the result in `ScrollView` (SG-17).
- Strip control sequences except SGR, so the output stays width-safe (SG-02).
- `compactMax` comes from config (`ui.footer.compactMax`, default 5).

## Acceptance criteria
- [ ] The full agent text is reachable by scrolling, and no line exceeds the width.
- [ ] Status glyphs use the shared tokens (SG-01), not inline `✗`.
- [ ] `compactMax` is configurable and validated (an integer from 1 to 20).

## Tests
- render.test.ts: a 2,000-char text at width 60 wraps, scrolling moves the window, and `visibleWidth(line) <= width` holds for every line.
- config.test.ts: `compactMax` defaults to 5 and invalid values are rejected.

## Notes / out of scope
- Depends on SG-02 and SG-17. Syntax highlighting of code blocks is out of scope.
