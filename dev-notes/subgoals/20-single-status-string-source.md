# SG-20 — Single source for the status string

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/controller.ts`, `src/ui/footer.ts`, `src/ui/format.ts`

## Problem
- `footer.statusString()` and the controller's `#statusString` both build the `setStatus("forgery", …)` text. They have drifted, so the status bar and footer can disagree.
- `#tick` (the heartbeat) only calls `setStatus` and doesn't refresh the widget or footer, so elapsed times can go stale between store events.

## Evidence
- `src/ui/footer.ts`: `statusString()`
- `src/ui/controller.ts`: `#statusString`, `#tick`

## Proposed design
- One pure `summarizeStatus(snapshot): StatusSummary` in `format.ts` that returns `{ glyph, label, counts, elapsed, cost }`.
- Every surface renders from that summary: the status uses its compact form, the footer the run segment, and the widget the title.
- Status string format: `⠹ forgery 2/5 · 1m12s`, or `✓ forgery done · $0.42`. When idle it is cleared (`setStatus("forgery", undefined)`).
- The heartbeat invalidates all surfaces through one `#requestRender()`, throttled to `REFRESH_MS`.

## Acceptance criteria
- [ ] Only one function builds status text.
- [ ] Status, footer and widget title agree for every fixture snapshot.
- [ ] Elapsed times update every second while a run is active.

## Tests
- A consistency test renders all three surfaces and compares counts and elapsed time.

## Notes / out of scope
- Depends on SG-14.
