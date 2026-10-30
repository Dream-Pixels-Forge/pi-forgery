# Goal: Fix pi-forgery launch freeze and footer double context-percentage

## Context
pi-forgery extension: (1) freezes on launch; (2) footer shows two context
percentages ("ctx [████░░] 42% 42%") instead of one.

## Root causes (investigated)
- Footer: `src/ui/footer.ts` `ctxSeg` appended `formatPercent(pct)` after
  `#progressBar(pct)` already appends the `%`.
- Launch: `src/ui/controller.ts` `#maybeCompact` read the host
  `getContextUsage()` getter *before* checking for an active run. On
  `session_start` the store is reset (nothing to compact), so this
  potentially-blocking host context read fired on every launch.

## Definition of Done (binary)
1. Footer renders exactly one context percentage — regression test added in
   `tests/render.test.ts` ("renders a single context percentage, not duplicated")
   passes.
2. Idle/session-start refresh does not read `getContextUsage()` when no active
   run exists — regression test added in
   `tests/controller.test.ts` ("idle refresh does not read host context usage")
   passes.

## Verification (fresh, re-run not recalled)
- Full test suite: 83 pass / 0 fail (81 baseline + 2 new regression tests).
- `tsc --noEmit`: clean, exit 0.
- Negative space: all 81 pre-existing tests still present, invoked, no skip/
  xfail markers, none weakened.
- Absence claims re-confirmed: zero warnings/failures in full run.

## Changes (committed)
- `extensions/forgery/src/ui/footer.ts` — removed duplicate `formatPercent(pct)`
- `extensions/forgery/src/ui/controller.ts` — `#maybeCompact` checks
  `store.activeRunId()` before calling `getContextUsage()`
- `tests/render.test.ts`, `tests/controller.test.ts` — new regression tests

Branch: `bug/fix-launch-freeze-footer-double-ctx-pct`, pushed to origin, PR #12 open vs main.
