# SG-01 — Unified status glyph & color tokens

- **Status:** todo
- **Priority:** P0 (foundation for every other UI subgoal)
- **Area:** `src/ui/format.ts`

## Problem
Status rendering is inconsistent across widget, footer and dashboard:
- `statusGlyph()` only knows `running/completed/failed/cancelled/stopped`; `queued`, `timed_out`, `unavailable`, `blocked`, `pending` fall through to `·`.
- `colorStatus()` has the same gaps, so those states render uncolored.
- Subgoal "blocked" uses `◐`, the same glyph as "running" — two different states look identical.
- Each surface re-implements its own small glyph/color mapping (footer CI map, dashboard `⟳`/`○` for subgoals).

## Evidence
- `src/ui/format.ts` → `statusGlyph`, `colorStatus`, `animatedStatusGlyph`
- `src/ui/widget.ts` → subgoal rows (blocked → `◐`)
- `src/ui/dashboard.ts` → subgoals section (`⟳` running, `○` pending)
- `src/activity/types.ts` → `ForgeryAgentRecord.status` union includes `queued | timed_out | unavailable`

## Proposed design
One exhaustive table, typed against the status unions, used by all surfaces:

| State        | Glyph | Token     | Animated |
|--------------|:-----:|-----------|:--------:|
| queued       | `○`   | `dim`     | no       |
| pending      | `○`   | `muted`   | no       |
| running      | spinner (`⠋⠙⠹…`) | `accent` | yes |
| blocked      | `⊘`   | `warning` | no       |
| completed    | `✓`   | `success` | no       |
| failed       | `✗`   | `error`   | no       |
| timed_out    | `⏱`   | `error`   | no       |
| cancelled    | `■`   | `muted`   | no       |
| stopped      | `■`   | `muted`   | no       |
| unavailable  | `⚠`   | `warning` | no       |

```ts
export type UiStatus = ForgeryAgentRecord["status"] | ForgerySubgoal["status"] | "blocked" | "pending";
export const STATUS_STYLE: Record<UiStatus, { glyph: string; token: ThemeToken; animated?: boolean }>;
export function renderStatus(theme, status, clock): string; // glyph + color in one call
```
- Use `satisfies Record<UiStatus, …>` so adding a new status to the types is a compile error until it is styled.
- Glyphs go through the icon set from SG-23 so ASCII fallback works.

## Acceptance criteria
- [ ] Every value of every status union has a glyph and a color (compile-time exhaustive).
- [ ] No two distinct states share the same glyph + color combination.
- [ ] Widget, footer, dashboard and status string all call `renderStatus` / `STATUS_STYLE`; no local glyph maps remain.
- [ ] Running state uses the time-based spinner from SG-14.

## Tests
- Unit: iterate every status → assert non-empty glyph, valid token.
- Unit: uniqueness test over `(glyph, token)` pairs.
- Snapshot of one row per state (feeds SG-25).

## Notes / out of scope
- Related goals: `goals/12-theme-restyling`, `goals/22-subgoal-progress-ui`.
- Does not change theme palettes themselves — only which tokens are used.
