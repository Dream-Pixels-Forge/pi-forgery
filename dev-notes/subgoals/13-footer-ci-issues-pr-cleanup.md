# SG-13 — Footer: CI / issues / PR segment cleanup

- **Status:** done
- **Priority:** P2
- **Area:** `src/ui/footer.ts`

## Problem
- The CI colour map mixes severity names (`error`, `warning`) with CI states (`failure`, `pending`), so some states fall through uncoloured.
- The issues and PR segments render `?` placeholders when the data is unknown. That looks broken.
- These segments render even when the repo has no remote or `gh` is unavailable.

## Evidence
- `src/ui/footer.ts`: CI map and the issue/PR segments

## Proposed design
- Normalise CI to `"passing" | "failing" | "running" | "none"` before rendering, then map it through SG-01:
  - `✓ CI` success
  - `✗ CI` error
  - `⠹ CI` warning (animated)
  - none: the segment is hidden
- Issues and PRs: render only when the count is known, as `⊙ 3  ⇅ 1`. Unknown means hidden, never `?`.
- When CI is failing, promote it to a priority-0 alert (SG-09).
- Cache the `gh` lookups with a TTL so the footer never blocks rendering.

## Acceptance criteria
- [ ] No `?` ever appears in footer output.
- [ ] Every CI state has a defined glyph and colour.
- [ ] With no remote or no `gh`, the segments are hidden and nothing is logged on each render.

## Tests
- A CI normalisation table test.
- A golden test with unknown counts asserts the segment is absent.

## Notes / out of scope
- Fetching CI and issue data is unchanged; this subgoal is presentation only.
