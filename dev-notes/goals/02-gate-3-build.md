# Goal: Gate 3 — Production build produces clean dist bundle

## Objective
Make `npm run build` (root) and the extension's own `npx tsc` build produce a clean `dist/` bundle under `extensions/forgery/` that Pi can load, satisfying original acceptance Gate 3.

## Context
pi-forgery's root `package.json` declares `"build": "cd extensions/forgery && npx tsc --noEmit"` — that's typecheck-only, not a real emit. Gate 3 requires a build that emits a `dist/` bundle loadable by Pi. The extension is TypeScript-only with no build step today (Pi's loader transpiles TS via jiti), so "build" means emitting compiled JS to `dist/` while preserving the extension's loadable entry point.

## Deliverables
- [ ] Root `package.json` build script emits to `extensions/forgery/dist/` (`tsc` with `outDir`, `declaration`, or a bundle step)
- [ ] `extensions/forgery/tsconfig.json` configured for emit (module: ESNext, target ES2022, outDir dist)
- [ ] `extensions/forgery/dist/` contains compiled JS for entry `index.ts` and `src/` modules
- [ ] `extensions/forgery/.gitignore` ignores `dist/` (already has it — verify)
- [ ] Root `package.json` `"build"` script updated to `cd extensions/forgery && npx tsc` (emit) — or keep `--noEmit` typecheck as separate script and add real build
- [ ] Verification: `npm run build` exits 0 and `dist/index.js` exists; `tsc --noEmit` still passes separately

## Definition of Done
- [ ] `npm run build` → exit 0
- [ ] `extensions/forgery/dist/index.js` exists after build
- [ ] `npm run --silent typecheck` (root, strict) → exit 0 (separate from build)
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail (build must not break tests)
- [ ] `git status` clean after build (dist/ gitignored) or dist/ committed as build artifact per team convention

## Verification Steps
1. `npm run build` → exit 0, `ls extensions/forgery/dist/index.js`
2. `npm run --silent typecheck` → exit 0
3. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
4. `timeout 60 pi -e ./extensions/forgery --print "hi"` → loads without crash (uses TS entry, not dist — but confirms nothing broke)

## Anti-Drift Rules
- Do not change the extension's loadable entry (`extensions/forgery/index.ts` declared in `pi.extensions`) — Pi's loader transpiles TS directly; dist is a build artifact, not the runtime entry
- Keep `typecheck` script separate from `build` script; both must pass independently
- No new dependencies for the build step (use existing `typescript` devDependency)
- dist/ must be gitignored — do not commit compiled output

## Non-Goals (follow-up goal candidates)
- Bundling with esbuild/rollup (out of scope; raw tsc emit is sufficient)
- Publishing dist to a registry
- CI build pipeline (GitHub Actions)

## Estimated Effort
Implementation: ~30 lines config + script change. Verification: ~10 min.
