# Goal: Beautiful box-formatted forgery_exec output

## Objective
Improve `forgery_exec` tool result display by rendering output inside a box-drawing border with useful information: run ID, status, duration, per-call breakdown, and result/error.

## Context
Previously `forgery_exec` returned a flat single-line text with just run ID, call count, and result. Users couldn't easily see which calls were made, how long each took, or per-call metrics. The new output renders as a bordered box with structured sections.

## Deliverables
- [ ] `src/ui/format.ts`: add `box()`, `visibleLength()`, `padRight()`, `formatCallSummary()` helpers
- [ ] `src/exec/tool.ts`: import box helpers, replace flat output with boxed result
- [ ] Box includes: header (status + run ID + duration + call count), per-call lines (ref · status · duration · tokens · cost), result or error section
- [ ] Unit tests for `box`, `visibleLength`, `formatCallSummary`

## Definition of Done
- [ ] `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail
- [ ] Box output uses Unicode box-drawing characters (┌─┐ └─┘ │)
- [ ] Each call shows ref, glyph, duration, tokens, cost
- [ ] Success and error both render in a box

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `npm run build` → clean `dist/`

## Anti-Drift Rules
- `box()` handles empty lines, long titles, zero-width content gracefully (no negative `String.repeat`)
- `visibleLength()` strips ANSI and theme color tags for accurate width measurement
- `formatCallSummary()` tolerates missing duration/metrics (renders "—" or omits)
- No new npm dependencies

## Non-Goals
- Colored box borders (would require theme integration)
- Interactive box (the box is static text in the tool result)
- Dashboard widget box rendering (separate improvement)

## Estimated Effort
~1 hour
