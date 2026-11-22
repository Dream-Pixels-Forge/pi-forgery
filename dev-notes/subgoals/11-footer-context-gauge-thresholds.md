# SG-11 — Footer: context gauge with thresholds

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/footer.ts`, `src/ui/format.ts`

## Problem
- The context bar is a fixed 6-cell, always-muted bar. It shows no percentage and doesn't change colour as it approaches the auto-compact threshold (`COMPACT_THRESHOLD_PCT=85`).
- The compact counter "compacts n/5 handoff!" is a separate segment. It reads as noise, and the `/5` is hardcoded through `compactMax: () => 5` in the controller.

## Evidence
- `src/ui/footer.ts`: context segment and compacts segment
- `src/ui/controller.ts`: `compactMax: () => 5`

## Proposed design
- The gauge `ctx ▰▰▰▰▰▱▱ 72%` uses 1/8-block precision when Unicode is allowed (SG-23).

  | Range | Colour |
  |---|---|
  | < 60% | dim |
  | 60–84% | warning |
  | ≥ 85% (the threshold) | error, bold |

- Add a threshold tick: render a `│` marker at the compact threshold position inside the bar.
- Fold compaction into the gauge: `ctx ▰▰▰▰▱ 72% ↻2/5`. At max compacts, show `⚠ handoff` in the error colour as a priority-0 alert (SG-09).
- Compact forms by width:
  - Full: `ctx ▰▰▰▰▱ 72% ↻2/5`
  - Medium: `ctx 72% ↻2`
  - Tiny: `72%`
- `compactMax` comes from config, or from the same constant the compaction logic uses. Remove the hardcoded 5.

## Acceptance criteria
- [ ] The colour changes at 60% and at the threshold.
- [ ] The threshold tick is positioned correctly for bar widths 4–12.
- [ ] Only one source of truth for compactMax.
- [ ] The handoff alert survives at 40 columns.

## Tests
- `gauge(pct, width)` unit tests at 0, 59, 60, 84, 85 and 100.
- Golden tests for the three compact forms.

## Notes / out of scope
- Depends on SG-01 (tokens) and SG-09.
