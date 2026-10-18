# PROGRESS.md — pi-forgery

## Current State
- **Project:** pi-forgery
- **Started:** 2026-06-15
- **Current Phase:** 3 (Engineer) — complete
- **Status:** merged (PR #1 → main, squash eb56976)
- **Repo:** https://github.com/Dream-Pixels-Forge/pi-forgery
- **PR:** https://github.com/Dream-Pixels-Forge/pi-forgery/pull/1

## Phase Completion
- [x] Phase 0: Bootstrap (GOAL.md written)
- [x] Phase 1: Brainstorm (archived from pi-fabric source study)
- [x] Phase 2: SPEC.md + DECISIONS.md written
- [x] Phase 3: Engineer (implementation complete)

## Active Tasks
- All implementation tasks S1–S10 done. 28 unit tests green, typecheck green,
  extension loads in a real `pi` session.

## Blockers
- None.

## Verification
- Typecheck: `npx tsc --noEmit` (strict, no `skipLibCheck`) → exit 0.
- Tests: `npx tsx --test tests/*.test.ts` → 28/28 pass, 0 skipped.
- Smoke: `pi -e ./extensions/forgery --print …` loads the extension without
  crashing (reaches the LLM stage; a 401 without an API key is expected).
- Hygiene audit at merge: no debug leftovers, no TODO/FIXME/console.log,
  no secrets, sane dependency tree.
- Merged main re-verified post-merge: typecheck PASS, 28/28 tests PASS.

## Decisions Made
- 2026-06-15: Adopt the local DPF extension layout `extensions/forgery/index.ts`
  + its own `package.json` (`pi.extensions` → `./index.ts`), matching
  pi-songsy/pi-prides rather than pi-fabric's `dist/extension-bootstrap.js`
  compiled-package layout. Rationale: matches sibling repos, no esbuild needed.
- 2026-06-15: TypeScript-only execution kernel. Programs run as an async IIFE
  via `new Function` with a validated `pi`/`agents` host proxy. No QuickJS/Monty.
- 2026-06-15: Footer surface = custom `ctx.ui.setFooter` component PLUS the
  `ctx.ui.setStatus("forgery", …)` slot so the built-in footer also shows it.
- 2026-06-15: Host shell/file calls use `node:child_process` + `node:fs`
  (the public `ExtensionContext` has no `exec` method — confirmed against the
  pi-coding-agent .d.ts).
