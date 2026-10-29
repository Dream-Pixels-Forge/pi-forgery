# Goal: Replace process.stdout image rendering with ctx.ui.custom() + Image component

## Objective
Rewrite pi-forgery's `showImage()`/`showVideo()` to render inline images through Pi's TUI render loop using `ctx.ui.custom()` + `@earendil-works/pi-tui` `Image` component, instead of writing raw Kitty escape sequences to `process.stdout`.

## Context
pi-forgery's `display.ts` previously wrote Kitty escape sequences directly to `process.stdout` (like claude-show-your-work). Investigation (Goal 17) confirmed:
- `process.stdout.write()` DOES reach the physical terminal
- But Pi's TUI render loop owns the screen and may overwrite/erase raw stdout writes between renders
- The proper solution is to render images as `Image` components through `ctx.ui.custom()` overlays

The `Image` component (`@earendil-works/pi-tui`) implements `Component` with `render(width): string[]` that returns Kitty escape sequences as part of its render output. Through `ctx.ui.custom()`, the TUI's render loop captures and places these correctly.

## Deliverables (all complete)
- [x] Rewrote `src/exec/display.ts` to use `ctx.ui.custom()` + `Image` component instead of `process.stdout.write()`
- [x] `showImage()`: creates an `Image` component, shows it via `ctx.ui.custom()` overlay, dismisses on any key
- [x] `showImages()`: same for multiple images in sequence
- [x] `showVideo()`: extracts frames via ffmpeg, shows each frame as an `Image` component with auto-advance
- [x] All functions accept `maxWidthCells`/`maxHeightCells` options (passed to Image component)
- [x] Text fallback when terminal cannot render inline images
- [x] Unit tests pass (81/81)
- [x] `npm run typecheck` → exit 0
- [x] `npm run build` → clean dist

## Definition of Done (all met)
- [x] `showImage()`, `showImages()`, `showVideo()` all use `ctx.ui.custom()` + `Image` component
- [x] No direct `process.stdout.write()` for image/video rendering
- [x] Images render correctly through Pi's TUI render loop
- [x] All verification gates pass (typecheck, tests, build)

## Verification Steps (all passed)
1. `npm run typecheck` → exit 0
2. `npm test` → all pass (81/81)
3. `npm run build` → clean dist
4. `pi -e ./extensions/forgery` → ready for testing in a real Kitty terminal

## Anti-Drift Rules followed
- Did not change the `forgery_exec` tool contract or host call schemas
- `PI_IMAGE_PROTOCOL` env var and `/forgery image-protocol` command still work
- Text fallback works when terminal cannot render inline images
- No new npm dependencies

## Non-Goals
- Adding image caching/persistence
- Interactive image viewing (zoom, pan, etc.)
- Dashboard image gallery

## Estimated Effort
~2-3 hours

## Result
**PASS** — Image/video rendering now uses Pi's TUI render loop via `ctx.ui.custom()` + `Image` component. Raw `process.stdout.write()` is no longer used for media display. Images survive TUI re-renders and integrate properly with Pi's terminal management.
