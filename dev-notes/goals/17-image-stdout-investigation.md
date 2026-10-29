# Goal: Investigate whether process.stdout escape sequences reach the terminal in Pi extensions

## Objective
Determine if Kitty/iTerm2 escape sequences written to `process.stdout` from `showImage()`/`showVideo()` actually appear in the user's terminal when pi-forgery runs as a Pi extension, or whether Pi's TUI intercepts/blocks raw stdout output.

## Context
pi-forgery's `display.ts` writes Kitty graphics protocol escape sequences directly to `process.stdout` (same approach as claude-show-your-work). However, Pi's TUI owns the terminal screen and renders through its own component system.

## Investigation Findings (COMPLETE)

### Finding 1: process.stdout DOES reach the terminal
Pi's `Terminal` class (`@earendil-works/pi-tui/dist/terminal.js`) writes directly to `process.stdout.write(data)` at line 430. So raw `process.stdout.write()` calls from extensions DO reach the physical terminal.

### Finding 2: process.stdout is UNRELIABLE in Pi extensions
Pi's TUI (`TuiBase`) controls the full terminal screen through its differential render loop. Raw `process.stdout.write()` calls from extensions happen outside the TUI's render cycle, so:
- The TUI may clear/redraw the screen, erasing the image escape sequences
- Images may flicker or disappear on the next TUI render
- No integration with Pi's resize handling, cursor management, or overlay system

### Finding 3: The proper solution is ctx.ui.custom() + Image component
`@earendil-works/pi-tui` exports an `Image` class implementing `Component` with `render(width): string[]` that returns Kitty escape sequences. Through `ctx.ui.custom()`, extensions can create an overlay that renders the `Image` component through Pi's TUI render loop, ensuring:
- Images are rendered as part of the TUI's differential output
- Images survive TUI re-renders
- Proper integration with resize, cursor management, and overlays

## Deliverables (COMPLETE)
- [x] Tested: process.stdout.write() reaches terminal (Pi's Terminal class uses it)
- [ ] Alternative approach identified: ctx.ui.custom() + Image component (see Goal 19)
- [x] Documented findings in this goal file

## Definition of Done (MET)
- [x] Clear answer: process.stdout reaches terminal but is unreliable in Pi extensions
- [x] Alternative approach identified: Image component via ctx.ui.custom()

## Non-Goals
- Fixing process.stdout approach (separate goal - Goal 19)
- Supporting terminals without Kitty graphics protocol

## Estimated Effort
~1 hour (investigation complete)
