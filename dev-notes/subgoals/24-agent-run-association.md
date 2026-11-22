# SG-24 — Associate agents with their run (`runId`)

- **Status:** done
- **Priority:** P1
- **Area:** `extensions/forgery/src/activity/types.ts`, store, widget, dashboard

## Problem
`ForgeryAgentRecord` has no `runId`. When several runs happen in one session, the widget and dashboard show every agent together and can't group, filter or summarize per run.

## Evidence
- `types.ts`: `ForgeryAgentRecord { id, name, task, status, …, startedAt, updatedAt, finishedAt? }` has no run reference.

## Proposed design
- Add `runId?: string` to `ForgeryAgentRecord` and set it where agents are spawned (the runner/workflow).
- Add a store selector `agentsForRun(runId)`, plus `unassignedAgents()` for legacy records.
- The widget shows only agents of the active (or latest) run. The dashboard run tabs (SG-15) filter by `runId`.
- Exported and replayed sessions from goal 24 have no `runId`, so they still load and appear under "Unassigned".

## Acceptance criteria
- [ ] Newly spawned agents always carry `runId`.
- [ ] The widget shows only current-run agents, and the counts match.
- [ ] Old exports replay without errors.

## Tests
- store.test.ts: `agentsForRun` filters correctly, and legacy records without `runId` go to unassigned.
- activity-export.test.ts: an export round-trip preserves `runId`, and an old fixture without it still imports.

## Notes / out of scope
- `types.ts` currently has uncommitted user changes, so coordinate before editing. This feeds SG-08, SG-15 and SG-19.
