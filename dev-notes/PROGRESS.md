# PROGRESS.md — pi-forgery

## Current State
- **Project:** pi-forgery
- **Started:** 2026-06-15
- **Current Phase:** 3 (Engineer) — complete
- **Status:** v0.4.0 (root) / v0.3.0 (extension)
- **Repo:** https://github.com/Dream-Pixels-Forge/pi-forgery
- **PRs:** https://github.com/Dream-Pixels-Forge/pi-forgery/pull/1, https://github.com/Dream-Pixels-Forge/pi-forgery/pull/2

## Phase Completion
- [x] Phase 0: Bootstrap (GOAL.md written)
- [x] Phase 1: Brainstorm (archived from source study)
- [x] Phase 2: SPEC.md + DECISIONS.md written
- [x] Phase 3: Engineer (implementation complete)

## Active Tasks
- All implementation tasks S1–S10 done, plus v0.2.0 (status line, footer,
  dashboard) via PR #2. 81 unit tests green, typecheck green,
  extension loads in a real `pi` session.
- New: terminal image + video display (Kitty graphics protocol) — `pi.showImage`,
  `pi.showImages`, `pi.showVideo` host calls + `/forgery image <path>`,
  `/forgery video <path>` commands. Video uses ffmpeg frame extraction.
- Fixed: footer not updating — live context/model/effort reads, live snapshot
  clock, no-op writes stay silent, 1s heartbeat ticks elapsed time during a run.
- Fixed: footer `compacts`/`issues`/`PRs`/`CI` segments now have live sources
  (store.compact, GitHubStatsReader via `gh` CLI).
- Fixed: footer/widget restyle on theme switch — `Theme` is now a live getter.
- Fixed: `store.compact(runId)` now auto-triggered when context usage > 85%
  (60s cooldown to prevent refresh loops).
- Improved: `forgery_exec` output renders in a box-drawing border with run ID,
  status, duration, per-call breakdown (ref · status · duration · tokens · cost),
  and result/error sections.
- Improved: version bumped to 0.4.0 (root) / 0.3.0 (extension).
- Improved: terminal image protocol override — `PI_IMAGE_PROTOCOL=kitty|iterm2|none|auto`
  env var + `/forgery image-protocol` command for runtime control.

## Verification
- Typecheck: `npx tsc --noEmit` (strict, no `skipLibCheck`) → exit 0.
- Tests: `npx tsx --test tests/*.test.ts` → 81/81 pass, 0 skipped.
- Build: `npm run build` → clean `dist/` bundle.
- Live `pi -e` smoke: PASS (extension loads and responds inside pi, which already has API keys configured — no separate API key needed).

## Decisions Made
- 2026-06-15: Adopt the local DPF extension layout `extensions/forgery/index.ts`
  + its own `package.json` (`pi.extensions` → `./index.ts`), matching
  pi-songsy/pi-prides rather than a compiled `dist/extension-bootstrap.js`
  compiled-package layout. Rationale: matches sibling repos, no esbuild needed.
- 2026-06-15: TypeScript-only execution kernel. Programs run as an async IIFE
  via `new Function` with a validated `pi`/`agents` host proxy. No QuickJS/Monty.
- 2026-06-15: Footer surface = custom `ctx.ui.setFooter` component PLUS the
  `ctx.ui.setStatus("forgery", …)` slot so the built-in footer also shows it.
- 2026-06-15: Host shell/file calls use `node:child_process` + `node:fs`
  (the public `ExtensionContext` has no `exec` method — confirmed against the
  pi-coding-agent .d.ts).
- 2026-06-29: Terminal image display via Kitty graphics protocol
  (`encodeKitty`/`encodeITerm2` from `@earendil-works/pi-tui`, PNG transcoding
  via `convertToPng` from `@earendil-works/pi-coding-agent`). Writes escape
  sequences to `process.stdout` like claude-show-your-work; text fallback via
  `imageFallback` when the terminal lacks inline image support.
