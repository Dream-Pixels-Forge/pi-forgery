# SG-10 — Footer: fix two-line layout

- **Status:** done
- **Priority:** P1
- **Area:** `src/ui/footer.ts`

## Problem
- The two-line footer branch is dead code: `fitted` is truncated to one line **before** the overflow check, so the check never fires.
- The animation frame is incremented in both `statusString()` and `render()`, which makes the spinner run at double speed and depend on how often each is called.

## Evidence
- `src/ui/footer.ts`: `fitted = truncate(...)` before `if (visibleWidth(full) > width)`, and the two `frame++` sites

## Proposed design
- Decide the layout mode from the *untruncated* segment widths:
  - Fits in one line → one line.
  - Does not fit, and the terminal height allows it → two lines. Line 1 is the session (branch, project, model); line 2 is the activity (context, compacts, CI, run, subgoals).
  - Still does not fit → per-line priority dropping (SG-09).
- Make the two-line mode configurable: `footer.lines: "auto" | 1 | 2`.
- Remove frame mutation from both functions and use the shared clock (SG-14).

## Acceptance criteria
- [ ] At 80 columns with every segment active, the footer switches to two lines when `auto` is set.
- [ ] Neither `statusString()` nor `render()` mutates animation state.
- [ ] The spinner speed is independent of how often render is called.

## Tests
- A unit test that calls `render()` 10× in the same ms and asserts the frame is unchanged.
- Golden tests for one-line and two-line output.

## Notes / out of scope
- Depends on SG-09 and SG-14.
