# Goal: Expose terminal image protocol override for pi-forgery

## Objective
Make pi-forgery's terminal image/video display respect the `PI_IMAGE_PROTOCOL` environment variable (already supported by `@earendil-works/pi-tui`) and add a runtime `/forgery image-protocol` command so users can force Kitty/iTerm2 mode when auto-detection fails (e.g., `xterm-256color` in a terminal that actually supports Kitty graphics).

## Context
`@earendil-works/pi-tui`'s `detectCapabilities()` already reads `process.env.PI_IMAGE_PROTOCOL` and overrides auto-detection. But:
- pi-forgery didn't document `PI_IMAGE_PROTOCOL`
- pi-forgery had no runtime way to change the protocol without restarting Pi
- Users on `xterm-256color` get `images: null` even if their terminal supports Kitty graphics

## Deliverables (all complete)
- [x] `PI_IMAGE_PROTOCOL=kitty|iterm2|none|auto` documented in `docs/host-calls.md` and `docs/usage.md`
- [x] `/forgery image-protocol <kitty|iterm2|none|auto>` command added to `index.ts`
- [x] `/forgery image-protocol` (no args) shows current protocol and source
- [x] `image-protocol` added to `/forgery` command completions
- [x] `npm run typecheck` → exit 0
- [x] `npm test` → all pass (81/81)
- [x] `npm run build` → clean dist

## Definition of Done (all met)
- [x] `PI_IMAGE_PROTOCOL` documented in both docs files
- [x] `/forgery image-protocol <kitty|iterm2|auto>` works at runtime
- [x] `/forgery image-protocol` (no args) shows current protocol
- [x] All verification gates pass

## Verification Steps (all passed)
1. `PI_IMAGE_PROTOCOL=kitty pi -e ./extensions/forgery` → forces Kitty mode
2. `/forgery image-protocol kitty` → sets protocol at runtime
3. `/forgery image-protocol` → prints current protocol and source
4. `npm run typecheck && npm test && npm run build` → all green

## Anti-Drift Rules followed
- Did not change image rendering logic, only protocol detection/override
- `auto` is the default (existing behavior)
- `resetCapabilitiesCache()` called after override so next `showImage`/`showVideo` picks up the new protocol
- `setCapabilities(detectCapabilities())` clears all overrides for `auto` mode

## Non-Goals
- Making images work in terminals that truly don't support Kitty graphics (impossible)
- Adding image display to the dashboard/settings view

## Estimated Effort
~1 hour

## Result
**PASS** — Users can now force the image protocol via `PI_IMAGE_PROTOCOL` env var or `/forgery image-protocol` command at runtime.
