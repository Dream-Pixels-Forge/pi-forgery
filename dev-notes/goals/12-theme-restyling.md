# Goal: Fix theme restyling on theme switch

## Objective
Make `ForgeryFooter` and `ForgeryWidget` re-read the `Theme` on every render so a theme switch takes effect immediately without requiring extension remount.

## Context
Both components captured `Theme` at construction time, and `invalidate()` was a no-op. When Pi switches themes (dark/light or custom), the footer and widget kept the old colors until the extension was remounted.

## Deliverables
- [ ] `ForgeryFooter` constructor takes `theme: () => Theme` getter instead of captured `Theme`
- [ ] `ForgeryFooter.render()` calls `this.theme()` on every call
- [ ] `ForgeryWidget` constructor takes `theme: () => Theme` getter instead of captured `Theme`
- [ ] `ForgeryWidget.render()` calls `this.theme()` on every call
- [ ] Controller passes `() => this.ui!.theme` and `() => ui.theme`
- [ ] Render tests updated to pass theme getters

## Definition of Done
- [ ] `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail
- [ ] Existing render tests still pass with theme getter stubs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass

## Anti-Drift Rules
- `Theme` read lazily on every render — never cached
- `invalidate()` remains a no-op (no cached rendering state to discard)
- No new npm dependencies

## Non-Goals
- Adding new theme colors or segments
- Theme persistence across sessions

## Estimated Effort
~30 minutes
