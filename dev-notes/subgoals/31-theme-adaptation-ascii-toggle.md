# SG-31 — Terminal Theme Auto-Adaptation & ASCII-Only Mode Toggle

- **Status:** planned
- **Priority:** P3
- **Area:** `src/ui/format.ts`, `src/ui/dashboard.ts`, `src/config.ts`

## Problem
Some user terminal environments lack full Unicode/Nerd font support or have palette issues (e.g., light backgrounds where `dim` gray text becomes unreadable, or terminals that render ambiguous-width glyphs with visual tearing).

## Evidence
- `src/ui/format.ts` provides `ICONS.ascii`, but switching requires manual config file modification (`.pi/forgery.json`), with no live keybinding toggle in the dashboard.
- Certain status tokens rely on fixed ANSI assumptions that may lack contrast on white/light terminal themes.

## Proposed design
- Add live ASCII-mode toggle in `ForgeryDashboard` via key `a`:
  - Instantly toggles between Unicode icons (`●`, `✓`, `✗`, `⠋`, `▌`) and pure ASCII (`*`, `+`, `x`, `|`, `>`).
- Add contrast safety check in text styling helpers (`format.ts`):
  - Ensure minimum contrast against light terminal themes by adapting dim/muted styles to darker shades when detected.
- Persist toggle preference back to user config if desired.

## Acceptance criteria
- [ ] Pressing `a` in dashboard switches all icons and borders between Unicode and ASCII modes without restarting.
- [ ] ASCII mode renders cleanly on minimal terminals without glyph truncation.
- [ ] Golden tests pass in both Unicode and ASCII modes.

## Tests
- `tests/render.test.ts`: Test toggling ASCII mode via dashboard input and verifying rendered characters.
