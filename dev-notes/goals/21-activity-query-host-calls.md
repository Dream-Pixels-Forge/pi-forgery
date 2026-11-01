# Goal: Activity Query Host Calls — read-side introspection of the activity store

## Objective
Expose `activity.snapshot`, `activity.runs`, `activity.agents`, and `activity.subgoals` as schema-validated host calls so `forgery_exec` programs can read back their own activity store mid-program — closing the read/write loop on the single in-memory activity snapshot.

## Context
pi-forgery's core contract is *one programmable tool* driven by a *single in-memory activity snapshot*. Today the snapshot is write-only from inside a program: a program can record calls/agents/subgoals via host calls but cannot read them back. Adding read-side host calls enables self-monitoring programs that branch on their own call history, cost, duration, or subgoal progress without reaching outside the host proxy.

## Deliverables
- [ ] `src/exec/schemas.ts` — add `ActivitySnapshotSchema`, `ActivityRunsSchema`, `ActivityAgentsSchema`, `ActivitySubgoalsSchema` TypeBox schemas (+~40 lines)
- [ ] `src/exec/tool.ts` — register `activity.snapshot`, `activity.runs`, `activity.agents`, `activity.subgoals` in `makeRegistry` reading from `activity`/`runner` (+~70 lines)
- [ ] `extensions/forgery/tests/activity-hostcalls.test.ts` — unit tests validating each call returns store data + integration test reading back a subgoal just created (+~60 lines)
- [ ] `docs/host-calls.md` — one paragraph documenting the four new host calls
- [ ] `skills/pi-forgery-mastery/` — short example in EXAMPLES.md or REFERENCE.md

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] Each query host call returns data matching a concurrently-written store mutation (read-your-writes)
- [ ] Unknown `activity.*` member still throws via host-proxy whitelist (no surface expansion beyond the 4 registered calls)

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs
4. Smoke: `timeout 60 pi -e ./extensions/forgery --print "hi"` → loads without crash

## Anti-Drift Rules
- Read-side only: host calls read from `ForgeryActivityStore` / `AgentRunner` state, never mutate
- No new npm dependencies; TypeScript-only kernel; TypeBox-validated args only
- Surface is bounded to exactly 4 `activity.*` calls — no arbitrary proxy expansion

## Non-Goals (follow-up goal candidates)
- Subscribing to store changes from inside a program (real-time reactivity)
- Writing activity back out to disk from a program (that's Feature 4: export/replay)
- Querying cost breakdowns per call (that's `cost.report`)

## Estimated Effort
Implementation: ~170 lines + tests. Audit: ~5 min.
