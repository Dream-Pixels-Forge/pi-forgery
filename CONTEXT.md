# CONTEXT.md — pi-forgery shared language

Ubiquitous language for the pi-forgery extension. Use these terms precisely
so code, tests, commits, and reviews stay aligned.

## Core concepts

| Term | Meaning |
|------|---------|
| **forgery_exec** | The single programmable execution tool. Runs a TypeScript program composing `pi.*` host calls and `agents.run`. One tool, not a kitchen sink. |
| **program** | The TypeScript body passed to `forgery_exec`. Runs as an async IIFE behind a validated host proxy (`pi`/`agents`/`cost`/`activity`/`workflow`). |
| **ActivityStore** | Single in-memory source of truth. Holds runs / phases / calls / items / events; revision-subscribable; bumped on every mutation. |
| **run** | A top-level execution recorded in the store (`id`, `status`, `metrics`, `events`). Status: `running` \| `completed` \| `failed` \| `cancelled`. |
| **phase** | A named step within a run. |
| **call / host call** | A validated `pi.*` / `agents.*` / `cost.*` / `activity.*` / `workflow.*` invocation, recorded as a call in the active run. |
| **item** | A named artifact produced during a run. |
| **event** | A timestamped log entry attached to a run. |
| **DashboardSnapshot** | Frozen snapshot `{ runs, agents, now, activeRunId }` fed to the UI. One source of truth for every rendered value — no fabricated telemetry. |
| **subgoal** | A named unit of work within a run; status glyph + `completed/total`. Surfaces in footer segment + widget rows. |

## UI surface

| Term | Meaning |
|------|---------|
| **Footer** | Custom status-line component: git branch, context gauge (bar + one percent), active-run status, budget alerts (`⚠ budget NN%` at 80%, hard-stop at 100%), `setStatus` slot mirrored into Pi's built-in footer. Renders exactly one context percentage — never duplicated. |
| **Widget** | Above-editor activity box. Auto-hides when idle. Header with aggregate metrics; participant rows (active agents first); focus + expand = inline 12-row transcript of the focused participant. |
| **Dashboard** | Full-screen `/forgery` modal: Activity view + Settings view. Subcommands: `dashboard`, `status`, `agents`, `log <id>`, `stop <id>`. |
| **controller** | Mounts/unmounts widget + footer, opens dashboard, refreshes on store subscription (~100 ms debounce), updates the `setStatus` slot. |
| **ctx / ExtensionContext** | The Pi host API surface: `read/bash/edit/write/find/grep/ls`, `getContextUsage()`, `setStatus()`, `setFooter()`, `setWidget()`. |

## Agents & cost

| Term | Meaning |
|------|---------|
| **AgentRunner** | Spawns one-shot Pi subprocesses (`pi --print <task>`); returns `text` + `value` + `usage`; bounded concurrency + timeout. Runs appear in the snapshot as agents with status/turns/toolCalls. |
| **CostManager** | Shared cost accounting injected into basic/enhanced/dev-loop/routing/UI paths. Provider-total-aware. `setBudget` + `budgetStatus` ("within" \| "warning" \| "exceeded"). Warns at 80% of `maxCostPerRun`, hard-stops at 100%, aborts the run and prevents the next spawn. |
| **dry-run mode** | `dryRun: true` on `forgery_exec`. Validates every host call's args against its schema and returns `{ planned: [{ ref, args }] }` without executing any host call or touching the store. |

## Workflow & persistence

| Term | Meaning |
|------|---------|
| **workflow engine** | Phase-gated pipelines (`workflow.run`/`status`/`stop`/`resume`). Each step's artifact threads into the next step's target; pause/abort gates between stages. |
| **pipeline** | A registered preset (e.g. `review`, `bootstrap`, `brainstorm`, `drift-report`) with phases, personas, and a standard. |
| **journal** | Durable replay of completed phases under `.pi/forgery/journal/`; survives a Pi restart via `workflow.resume`. |
| **export / import** | `activity.export` writes the snapshot to JSON (`.pi/forgery/activity-<runId>.json`); `activity.import` reloads into a fresh store (bumps revision; malformed JSON → structured error, no crash). |

## Non-goals (deliberately out of scope)

Durable-residency actors / mesh / councils; separate provider registry or MCP bridge; Python/Monty kernel; CI publishing pipeline; vision-model backend; dedicated workflow dashboard view beyond the existing Activity view.

## File layout (repo root = extension root)

- `index.ts` — extension entry (`pi.extensions: ["./index.ts"]`)
- `src/activity/{store.ts,types.ts,distill.ts}` — activity model + store + pattern mining
- `src/agents/{runner.ts,enhanced-runner.ts,dev-loop.ts,cost-manager.ts,router.ts}` — agent spawning + cost
- `src/exec/{runtime.ts,schemas.ts,tool.ts,display.ts}` — forgery_exec runtime + validation
- `src/ui/{controller.ts,footer.ts,widget.ts,dashboard.ts,format.ts,contextUsageReader.ts}` — UI surface
- `src/workflow/{engine.ts,chain.ts,resolver.ts,journal.ts,pipelines.ts,types.ts}` + `pipelines/` presets + `personas/` + `standards/`
- `tests/*.test.ts` — unit suite
- `dev-notes/goals/NN-*.md` — goal specs + audit verdicts (goal-writer / goal-met)
- `docs/` — published to GitHub Pages

## Version

v0.4.0 (root) / v0.3.0 (extension). Before any release, verify code version, git tag, and registry match (never reuse a published version).
