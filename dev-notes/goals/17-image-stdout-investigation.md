# Goal: Investigate whether process.stdout escape sequences reach the terminal in Pi extensions

## Objective
Determine if Kitty/iTerm2 escape sequences written to `process.stdout` from `showImage()`/`showVideo()` actually appear in the user's terminal when pi-forgery runs as a Pi extension, or whether Pi's TUI intercepts/blocks raw stdout output.

## Context
pi-forgery's `display.ts` writes Kitty graphics protocol escape sequences directly to `process.stdout` (same approach as claude-show-your-work). However, Pi's TUI owns the terminal screen and renders through its own component system. Raw `process.stdout.write()` calls from an extension may be:
- Intercepted by Pi's terminal renderer and never reach the terminal
- Mixed with TUI output in a way that corrupts the screen
- Completely invisible to the user

If `process.stdout` doesn't work, we need an alternative — either Pi exposes a terminal-output API, or we render images through Pi's TUI `Image` component (which `@earendil-works/pi-tui` provides and integrates with the TUI's render loop).

## Deliverables
- [ ] Test: write a minimal extension that calls `process.stdout.write(kittySequence)` and check if the image appears
- [ ] Test: same but via Pi's TUI `Image` component (if accessible from extension context)
- [ ] Document findings: does `process.stdout` work, partially work, or not work at all?
- [ ] If not working: identify the correct Pi API for terminal output or file an issue/PR to Pi for one

## Definition of Done
- [ ] Clear yes/no answer on whether `process.stdout` Kitty sequences reach the terminal in Pi extensions
- [ ] If working: no code change needed, just document the requirement
- [ ] If not working: plan for alternative approach (Pi TUI Image component or new Pi API)

## Verification Steps
1. Create test extension with `process.stdout.write(encodeKitty(...))`
2. Run `pi -e ./test-ext` in a Kitty-compatible terminal (Ghostty, Kitty, Warp, WezTerm, iTerm2)
3. Observe whether an inline image appears
4. Record result in `dev-notes/IMAGE-STDOUT-TEST.md`

## Anti-Drift Rules
- Test in a real Kitty-compatible terminal, not xterm-256color
- Do not modify pi-forgery source until test results are known
- Do not add new dependencies

## Non-Goals
- Fixing the issue if `process.stdout` doesn't work (separate goal)
- Supporting terminals without Kitty graphics protocol

## Estimated Effort
~1 hour (test + document)
