# Goal: Durable Run Journal — `workflow.resume(runId)`

## Objective
Persist workflow phase state + artifacts so a long `workflow.chain` (or multi-preset run) survives a Pi restart: `workflow.resume(runId)` replays completed phases from the journal and continues from the first incomplete phase.

## Context
Goal 24 (activity export/replay) gives snapshot export/import, but workflows have no mid-chain resume. A long chain (`bootstrap → implement → drift-report → resolver`) interrupted by a Pi restart loses all phase state. The durable journal stores phase status + artifact paths in `.pi/forgery/journal/` keyed by runId; on restart, `workflow.resume(runId)` replays completed phases and continues.

## Deliverables
- [ ] `src/workflow/journal.ts` — `WorkflowJournal` class: `write(runId, phase, status, artifacts)` / `read(runId)` / `list()` backed by JSON files in `.pi/forgery/journal/` (+~70 lines)
- [ ] `src/workflow/chain.ts` (or new `workflow.ts`) — integrate journal writes at phase boundaries in `workflow.chain` (+~20 lines)
- [ ] `src/exec/tool.ts` — register `workflow.resume(runId)` host call (+~15 lines)
- [ ] `extensions/forgery/tests/journal.test.ts` — unit tests: write/read/list JSON, resume skips completed phases (+~50 lines)
- [ ] `docs/workflows.md` — document `workflow.resume` + journal location (+one section)

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] `workflow.resume(runId)` returns completed phases + next phase to run
- [ ] Journal files are valid JSON in `.pi/forgery/journal/<runId>.json`
- [ ] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Write-ahead: journal entry written *before* a phase starts; updated on completion — crash-safe, no lost phase state
- Resume is idempotent: resuming an already-completed run returns "already complete" without re-running
- Journal path respects Pi's project-scoped `.pi/` directory (no global writes)
- No new npm dependencies; TypeScript-only; fs promises API

## Non-Goals (follow-up goal candidates)
- Journal compaction / TTL cleanup (deferred)
- Resuming across Pi versions with changed preset schemas (deferred — schema check on read)

## Estimated Effort
Implementation: ~105 lines + tests. Audit: ~5 min.
