# SG-14 — Time-based spinner clock

- **Status:** todo
- **Priority:** P0
- **Area:** `src/ui/format.ts`, `src/ui/widget.ts`, `src/ui/footer.ts`, `src/ui/controller.ts`

## Problem
- Spinner frames advance on every render call (widget) and on both `statusString()` and `render()` (footer). The animation speed depends on how often the TUI re-renders: it freezes when idle and spins wildly during bursts.
- Different surfaces show different spinner frames at the same moment.

## Evidence
- `src/ui/widget.ts`: frame++ in render
- `src/ui/footer.ts`: frame++ in two places
- `src/ui/format.ts`: `SPINNER_FRAMES`, `animatedStatusGlyph`

## Proposed design
- Derive the frame from wall-clock time: `frameAt(now) = SPINNER_FRAMES[Math.floor(now / 80) % SPINNER_FRAMES.length]`.
- Every surface uses `snapshot.now`, or one injected `clock()`, so all spinners are in sync and the output is deterministic in tests.
- The controller's `REFRESH_MS` timer only requests renders while something is animating. When idle there are no timers, which saves CPU.
- `prefers-reduced-motion`-style config `ui.animations: false` replaces the spinner with a static `●`.

## Acceptance criteria
- [ ] No mutable frame counters remain in UI components.
- [ ] Rendering the same snapshot twice produces identical output.
- [ ] The refresh timer stops when nothing is running (verified with fake timers).
- [ ] The animations-off config renders static glyphs.

## Tests
- `frameAt` unit test.
- A controller fake-timer test checks that the interval is cleared when idle.

## Notes / out of scope
- Blocks SG-10 and SG-25 (golden determinism).
