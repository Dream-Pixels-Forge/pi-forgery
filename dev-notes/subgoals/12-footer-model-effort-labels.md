# SG-12 — Footer: model & effort labels

- **Status:** todo
- **Priority:** P2
- **Area:** `src/ui/footer.ts`

## Problem
- Effort labels `{low:"lw", medium:"med", high:"hgh"}` are cryptic abbreviations, and unknown values pass through raw.
- Model ids are shown verbatim (`claude-opus-5-5-20261001`), which wastes space.

## Evidence
- `src/ui/footer.ts`: effort map and model segment

## Proposed design
- `shortModel(id)` strips the vendor prefix and the date suffix and keeps family plus version: `opus 5.5`, `sonnet 5.5`, `gpt-5`, `gemini 3 pro`. Unknown ids fall back to the last path segment, truncated.
- Effort as a 3-dot meter: `●○○` low, `●●○` medium, `●●●` high. With ASCII fallback the labels are `lo`, `med`, `hi`. Unknown effort values are hidden.
- Combined segment: `opus 5.5 ●●○`. Compact form: `opus ●●○`.
- Colour: the model name in accent and the meter in dim.

## Acceptance criteria
- [ ] A table-driven test covers at least 10 real model ids across providers.
- [ ] No 2–3 letter cryptic abbreviations.
- [ ] An unknown effort value renders nothing rather than garbage.

## Tests
- `shortModel` and `effortMeter` unit tests.

## Notes / out of scope
- Depends on SG-23 for the glyph fallback.
