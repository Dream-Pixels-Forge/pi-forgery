# SPEC.md — pi-forgery Architecture

## System Architecture

```
            ┌──────────────────────────────────────────────┐
   LLM ──▶  │  forgery_exec tool                           │
            │   (ToolDefinition, params: code, display, …) │
            └───────────────┬──────────────────────────────┘
                            │ runs TS program
            ┌───────────────▼──────────────────────┐
            │  ExecutionRuntime                     │
            │  - buildHost(pi, ctx) → validated proxy│
            │  - run(code) → { value, calls }       │
            │  - each host call → activity.call()   │
            └───────────────┬──────────────────────┘
                            │ feeds
            ┌───────────────▼──────────────────────┐
            │  ActivityStore (single source of      │
            │  truth, in-memory, revision-subscribable)
            │  runs / phases / calls / items / events
            └───────────────┬──────────────────────┘
                            │ createSnapshot()
            ┌───────────────▼──────────────────────┐
            │  DashboardSnapshot                     │
            │  { runs, agents, now, activeRunId }    │
            └──────┬───────────────┬────────────────┘
                   │               │
            ┌──────▼─────┐   ┌────▼───────────────────┐
            │ FooterComp │   │ ForgeryWidget / Dashboard
            │ (setFooter)│   │ (setWidget / ui.custom) │
            └────────────┘   └──────────────────────────┘
```

## Module Specifications

### `activity/types.ts`
- **Responsibility:** shape of the activity data model (runs, phases, calls,
  items, events, snapshot, status kinds).
- **Interface:** plain exported types, no behavior.

### `activity/store.ts`
- **Responsibility:** in-memory, revision-subscribable activity store.
- **Interface:**
  - `start(id, display?, nameHint?): ForgeryRun`
  - `phase(runId, input): ForgeryPhase`
  - `beginCall(runId, {callId, ref, args})`, `updateCall(...)`, `finishCall(...)`
  - `item(runId, input)`, `event(runId, input)`
  - `finish(runId, success, error?)`
  - `subscribe(fn): unsub`, `revision(): number`, `runs()`, `activeRunId()`
- **Dependencies:** `node:crypto` for ids only. No host.
- **Tests:** store.test.ts — lifecycle, cascades, bounds, revision bump.

### `activity/snapshot.ts`
- **Responsibility:** build a frozen `DashboardSnapshot` from store + agents.
- **Interface:** `createSnapshot(store, agents): DashboardSnapshot`.
- **Tests:** snapshot.test.ts.

### `exec/runtime.ts`
- **Responsibility:** execute a TypeScript program against a validated host
  proxy. Each host call is validated against the call registry and bridged
  into the activity store.
- **Interface:**
  - `class ExecutionRuntime { run(code, ctx, activity): Promise<{value, ok, error?}> }`
  - `buildHostProxy(pi, ctx, runtime, activity)` — returns a Proxy whose
    allowed members (`read/bash/edit/write/find/grep/ls/agents/exec`) are
    callable; unknown members throw `NoHostError`.
- **Security:** program body is `new Function("pi","__host","__activity",
  code)`; `pi` is a read-only Proxy whitelist, not a god object. No `eval`,
  no `process`, no `import`.
- **Tests:** runtime.test.ts (validation, parallel calls, error bridging).

### `agents/runner.ts`
- **Responsibility:** one-shot agent runs via the Pi subprocess CLI.
- **Interface:**
  - `class AgentRunner { run(req, signal): Promise<AgentRunResult>;
    stop(id); listForUi(); subscribeUi(fn) }`
  - Spawns `pi --print "<task>"` (or `pi -p`) in `req.cwd`, captures stdout
    (JSONL stream), parses usage/text, enforces `timeoutMs` + concurrency cap.
- **Data honesty:** status only reflects observed child state; a missing
  child binary reports `agent_unavailable`, not a success.
- **Tests:** runner.test.ts (mock spawn, status mapping).

### `ui/format.ts`
- **Responsibility:** pure text presenters — token counts, durations, status
  glyphs, safeText, oneLine, truncation.
- **Tests:** format.test.ts.

### `ui/footer.ts`
- **Responsibility:** custom footer component (`Component`) rendering git
  branch, context usage bar, active-run status, and `setStatus` slot text.
- **Interface:** `class ForgeryFooter implements Component` with
  `render(width)`, `invalidate()`, `dispose()`; takes
  `(snapshot, footerData, ctx, agentRunner)`.
- **Tests:** footer.test.ts (render with stub theme).

### `ui/widget.ts`
- **Responsibility:** above-editor activity widget. Header + participant rows
  + expandable 12-row transcript pane.
- **Interface:** `class ForgeryWidget implements Component, Focusable`.
- **Tests:** widget.test.ts.

### `ui/dashboard.ts`
- **Responsibility:** full-screen modal (Activity + Settings views), paged
  transcript, status filter, step between runs.
- **Interface:** `class ForgeryDashboard implements Component, Focusable`.
- **Tests:** dashboard.test.ts.

### `ui/controller.ts`
- **Responsibility:** mount/unmount widget + footer, open dashboard overlay,
  refresh on subscription (100 ms debounce), `setStatus` slot updates.
- **Interface:** `class ForgeryUiController { start(ctx); stop();
  openDashboard(ctx); focusWidget(ctx); refresh() }`.

### `extension.ts`
- **Responsibility:** the extension factory — registers tool, command,
  shortcuts, lifecycle hooks, and the UI controller.
- **Interface:** `export default function forgery(pi: ExtensionAPI, opts?)`.
- **Tests:** extension.test.ts (registration smoke).

## API Specifications

### `forgery_exec` tool params
| param | type | required | description |
|-------|------|----------|-------------|
| code | string | yes | TS program body calling `pi.*` and `agents.run` |
| display | object? | no | `{name, description}` shown in the widget header |
| timeoutMs | number? | no | program-level deadline |
| runId | string? | no | id to reuse for a resumed run |

## Security (non-goals enforced)
- No arbitrary filesystem in the program body: host proxy whitelist only.
- Child agents spawn a real Pi process; that process runs with the user's
  normal tool permissions — no elevated scope.
- No secrets are logged; agent `stderr` is truncated and sanitized.
