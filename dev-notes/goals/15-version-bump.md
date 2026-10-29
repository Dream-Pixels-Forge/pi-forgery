# Goal: Bump version to 0.4.0

## Objective
Bump pi-forgery version across both package.json files to reflect the new box-formatted output and feature improvements.

## Context
Previous version was 0.3.0 (root) / 0.2.0 (extension). New features: box-formatted `forgery_exec` output with per-call details and duration, auto-compact trigger, GitHub stats reader, theme restyling.

## Deliverables
- [ ] Root `package.json`: version 0.3.0 → 0.4.0
- [ ] `extensions/forgery/package.json`: version 0.2.0 → 0.3.0

## Definition of Done
- [ ] Both version fields updated
- [ ] `npm run typecheck` → exit 0
- [ ] `npm test` → all pass
- [ ] `npm run build` → clean `dist/`

## Verification Steps
1. `grep '"version"' package.json extensions/forgery/package.json` → 0.4.0 / 0.3.0
2. `npm run typecheck` → exit 0
3. `npm test` → all pass
4. `npm run build` → clean

## Anti-Drift Rules
- Keep both package.json versions in sync with the change significance
- No breaking API changes in this bump (minor version)

## Non-Goals
- Publishing to npm (out of scope)
- Changelog generation

## Estimated Effort
~5 minutes
