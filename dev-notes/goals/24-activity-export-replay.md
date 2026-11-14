# Goal: Activity Export & Replay — session persistence across Pi restarts

## Objective
Persist the activity snapshot to disk (`<cwd>/.pi/forgery/activity-<runId>.json`) on run finish and on demand via `activity.export`/`activity.import` host calls, so a session's activity survives a Pi restart and can be replayed into a fresh store.

## Context
The store is the *single source of truth* but it's in-memory only — Pi restarts wipe it. Export/replay serializes that single source of truth to JSON and reloads it, honoring "auditable" and "cheap to boot": no database, no durable actor mesh, just `JSON.stringify`/`structuredClone` round-trips.

## Deliverables
- [ ] `src/activity/store.ts` — `exportSnapshot(): string` and `importSnapshot(json: string): void` methods using existing `snapshot()` + `structuredClone`, with optional runId filtering (+~45 lines)
- [ ] `src/exec/schemas.ts` — `ActivityExportSchema`, `ActivityImportSchema` (+~20 lines)
- [ ] `src/exec/tool.ts` — register `activity.export`, `activity.import` (+~45 lines)
- [ ] `index.ts` — `/forgery export <path>` and `/forgery import <path>` subcommands (+~30 lines)
- [ ] `extensions/forgery/tests/activity-export.test.ts` — round-trip test using `os.tmpdir()` (+~50 lines)

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] All tests pass including new round-trip test
- [ ] Export produces valid JSON matching `ForgerySnapshot` shape
- [ ] Import into a fresh store restores runs/agents/subgoals and bumps revision (subscribers notified)
- [ ] Import of malformed JSON returns a structured error, never throws the extension down

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- JSON round-trip only: `JSON.stringify`/`structuredClone`, no database, no durable mesh
- Import of malformed JSON must not crash the extension — structured error only
- No auto-sync on every mutation (too chatty); export/import are explicit operations only

## Non-Goals (follow-up goal candidates)
- Auto-sync on every store mutation
- Cloud sync or remote storage
- Dedicated "replay timeline" dashboard view (deferred Non-Goal — workflows surface through existing activity views)

## Estimated Effort
Implementation: ~190 lines + tests. Audit: ~5 min.
