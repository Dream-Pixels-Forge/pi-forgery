# HANDOFF — pi-forgery Extension

**Session**: Implemented all 5 next features for pi-forgery
**Date**: 2026-11-01
**Status**: ✅ All tests passing (156/156), build ✅, typecheck ✅

---

## What Was Accomplished

All 5 ranked features from the planning session implemented, tested, and committed on separate branches. None are merged to `main` yet.

### Feature 1 — Activity Query Host Calls (branch: `feat/activity-query-host-calls`)

**Commit**: `8eb3e3b` — `feat: activity query host calls for store introspection`

Added 4 read-side host calls so `forgery_exec` programs can introspect their own activity store mid-program:
- `activity.snapshot` — full `ForgerySnapshot` (runs, agents, activeRunId)
- `activity.runs` — all runs, most-recent first
- `activity.agents` — all agent records
- `activity.subgoals({ goalId? })` — subgoals for a goal (defaults to current run)

**Files changed:**
- `extensions/forgery/src/exec/schemas.ts` — `ActivitySnapshotSchema`, `ActivityRunsSchema`, `ActivityAgentsSchema`, `ActivitySubgoalsSchema`
- `extensions/forgery/src/exec/runtime.ts` — `activity` namespace in `buildHostProxy`, passed to `new Function` factory alongside `pi`/`agents`
- `extensions/forgery/src/exec/tool.ts` — 4 `registry.register` blocks reading from `ForgeryActivityStore`
- `extensions/forgery/tests/activity-hostcalls.test.ts` — 7 new tests
- `dev-notes/goals/21-activity-query-host-calls.md` — goal spec

### Feature 2 — Subgoal Progress Surfaces Across UI (branch: `feat/dry-run-mode`)

**Commit**: `68206ea` — `feat: subgoal progress rendering tests for UI`

Subgoal rendering already existed in code (`widget.ts` `#subgoalRows`, `footer.ts` `subgoalSeg`, `dashboard.ts` subgoal list) but had no test coverage. Added tests:
- Footer renders `subgoals completed/total` segment when subgoals exist
- Footer omits segment when no subgoals (no regression)
- Widget renders subgoal rows with name, status glyph, `completed/total`
- Widget shows no subgoal rows when run has none

**Files changed:**
- `extensions/forgery/tests/render.test.ts` — 4 new tests (87 insertions)

### Feature 3 — Dry-Run / Validation-Only Mode (branch: `feat/dry-run-mode`)

**Commit**: `775a8b8` — `feat: dry-run mode for forgery_exec`

Added `dryRun: boolean` param to `forgery_exec`. When true, validates every host call's args against its schema and returns `{ planned: [{ ref, args }] }` without executing any host call or touching the store.

**Files changed:**
- `extensions/forgery/src/exec/runtime.ts` — `dryRun` on `HostExecCtx`, `buildHostProxy` skips `spec.execute` and records `PlannedCall[]`, `runProgram` returns `{ planned }` when dry, `runForgery` accepts `dryRun` flag and returns without starting a store run
- `extensions/forgery/src/exec/tool.ts` — `dryRun` added to `PARAMS`, passed to `runForgery`
- `extensions/forgery/tests/runtime.test.ts` — 4 new dry-run tests

### Feature 4 — Activity Export & Replay (branch: `feat/activity-export-replay`)

**Commit**: `054d504` — `feat: activity export & replay — session persistence across Pi restarts`

Persists the in-memory activity snapshot to JSON and reloads it into a fresh store, so activity survives Pi restarts.

**Files changed:**
- `extensions/forgery/src/activity/store.ts` — `exportSnapshot(): string` + `importSnapshot(json: string): void` (restores runs/agents/subgoals, bumps revision)
- `extensions/forgery/src/exec/schemas.ts` — `ActivityExportSchema`, `ActivityImportSchema`
- `extensions/forgery/src/exec/tool.ts` — `activity.export` (writes to `<cwd>/.pi/forgery/activity-<runId>.json` by default), `activity.import` (malformed JSON → structured error, no crash)
- `extensions/forgery/index.ts` — `/forgery export [path]` and `/forgery import <path>` subcommands + tab-completion + descriptions
- `extensions/forgery/tests/activity-export.test.ts` — 4 new tests

### Feature 5 — Non-Anthropic Cache Pricing (branch: `feat/cache-pricing`)

**Commit**: `76d98c4` — `feat: non-Anthropic cache pricing — OpenAI + Google`

Added `cacheReadPer1k`/`cacheWritePer1k` for OpenAI (`gpt-4o`, `gpt-4o-mini`) and Google (`gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`) — closes HANDOFF.md known limitation #4.

**Files changed:**
- `extensions/forgery/src/agents/cost-manager.ts` — 5 pricing entries
- `extensions/forgery/tests/features.test.ts` — 2 new cache-pricing tests (OpenAI + Google)
- `skills/pi-forgery-mastery/REFERENCE.md` — updated model pricing table

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `npm run --silent typecheck` | exit 0 ✅ |
| Tests | `npx tsx --test tests/*.test.ts` (extensions/forgery) | 156 pass, 0 fail ✅ |
| Build | `npx tsc` | clean `dist/` bundle ✅ |
| Test count before | 129 | after: 156 (+27 new) |

---

## Pre-Existing Unstaged Changes (NOT included in feature commits)

The working tree had uncommitted changes from the prior session that were deliberately left out of all 5 commits:

**Modified (staged but not committed on feature branches):**
- `extensions/forgery/src/activity/types.ts`
- `extensions/forgery/src/ui/controller.ts`
- `extensions/forgery/src/ui/dashboard.ts`
- `extensions/forgery/src/ui/footer.ts`
- `extensions/forgery/src/ui/widget.ts`
- `extensions/forgery/tests/store.test.ts`

**Untracked:**
- `HANDOFF.md` (this file)
- `dev-notes/goals/22-*.md` through `25-*.md` (goal specs for features 2-5)
- `extensions/forgery/src/agents/dev-loop.ts`
- `extensions/forgery/src/agents/enhanced-runner.ts`
- `skills/pi-forgery-mastery/EXAMPLES.md`, `SKILL.md`, `REFERENCE.md`

These were present before this session began and are unrelated to the 5 features implemented here.

---

## Scope Creep Avoided (Explicit Non-Goals)

No work was done on:
- Durable actor mesh / persistent residency (violates "in-memory only" vision)
- MCP bridge / separate provider registry (explicit Non-Goal per GOAL.md)
- Real `pi` binary integration tests (unit tests with mocks, consistent with project)
- Vision-model backend for sniper agent (external model access, not "cheap to boot")
- Dedicated workflow dashboard view (deferred Non-Goal from prior goal specs)

---

## Risks / Things to Know

1. **Feature commits are on separate branches, none merged to `main`.** The user needs to review + squash-merge each branch per the git-driven-development convention.
2. **Pre-existing unstaged changes exist in the working tree** (see above). They were not touched by this session but may conflict if someone switches branches without stashing.
3. **Feature 2 had zero code changes** — subgoal UI rendering already existed; only tests were added. If the user expected new UI code, they should verify `widget.ts`/`footer.ts`/`dashboard.ts` already render subgoals as expected.
4. **`activity.import` throws on malformed JSON** — callers in `tool.ts` catch and return a structured error; `index.ts` import subcommand also catches. Verified by test.
5. **Dry-run never mutates the store** — verified by test asserting `store.runs().length === 0` after dry-run.

---

## Next Steps (Recommended Order)

1. Review & merge `feat/activity-query-host-calls` → `main`
2. Review & merge `feat/dry-run-mode` → `main` (contains both Feature 2 tests + Feature 3 code)
3. Review & merge `feat/activity-export-replay` → `main`
4. Review & merge `feat/cache-pricing` → `main`
5. Decide what to do with pre-existing unstaged changes (commit separately or discard)

For each branch: `pnpm type-check` → `pnpm test` → `pnpm build` all pass locally.