# Gate 5 — Honesty audit of UI-rendered values (pi-forgery)

Audit of every string/number rendered by `widget.ts`, `footer.ts`, `dashboard.ts`, and `controller.ts`.
Each value is traced to `ForgeryActivityStore.snapshot()` (store) or `ExtensionContext`/`ForgeryFooterContext` (ctx). Verdict: **honest** (real store/ctx field) or **fabricated** (hardcoded/random/computed-from-nothing telemetry).

## Result

**Zero fabricated values found.** Every rendered value maps 1:1 to a store snapshot field or a ctx field. No code changes were required — audit only.

## widget.ts — `ForgeryWidget` (above-editor activity widget)

| Rendered value | Source | Verdict |
|---|---|---|
| Idle line: `recent.name`, `recent.status`, `recent.error` | `snap.runs[0]` (store: `ForgeryRun.name` / `.status` / `.error`) | honest |
| Idle line: `"forgery · idle"` | static label, no data claim | honest |
| Header: `formatTokens(totals.tokens)` + `" tok"` | `snap.activeTotals.tokens` (store) | honest |
| Header: `formatCost(totals.cost)` | `snap.activeTotals.cost` (store) | honest |
| Header: `${totals.calls} calls` | `snap.activeTotals.calls` (store) | honest |
| Header: `formatDuration(snap.now - active.startedAt)` | `snap.now` + `active.startedAt` (store) | honest |
| Header glyph: `colorStatus(theme, "running")` | literal status for the active run found in `snap.runs` | honest |
| Participant row: `agent.name`, `agent.status`, `agent.current` | `snap.agents[]` (store: `ForgeryAgentRecord`) | honest |
| `shouldShow()` visibility: active run, `finishedAt` vs `retentionMs`, running agents | `snap.runs[]`, `snap.agents[]` (store) + real clock | honest |
| Row count math (`active ? 2 : 1`, `maxRows` from `process.stdout.rows * WIDGET_TERMINAL_ROW_SHARE`) | invalidation + layout sizing, not presented as data | honest (layout) |

## footer.ts — `ForgeryFooter` (status-line footer)

| Rendered value | Source | Verdict |
|---|---|---|
| Git branch segment (`⎇ <branch>` / `no-repo`) | `footerCtx.gitBranch()` (ctx) | honest |
| Context segment (`ctx <pct>% · <tokens> tok` / `ctx —`) | `footerCtx.contextPercent()`, `footerCtx.contextTokens()` (ctx) | honest |
| Model segment | `footerCtx.modelId()` (ctx) | honest |
| Active run: name, calls, tokens, cost, duration | `snap.activeTotals` + `active.startedAt`, `snap.now` (store) | honest |
| Recent run fallback: name/status/error | `snap.runs[0]` (store) | honest |
| `statusString()` mirror into `setStatus("forgery", …)` | same store fields as render | honest |
| `"forgery · idle"` | static label | honest |

## dashboard.ts — `ForgeryDashboard` (`/forgery` modal)

| Rendered value | Source | Verdict |
|---|---|---|
| Activity header / help hint / `"no runs yet"` | static labels | honest |
| Phase panels: name/status/current/total/duration | `focus.phases[]` (store: `ForgeryPhase`) + `snap.now` | honest |
| Call list: ref/label/preview/error/status, `calls (n)` count | `focus.calls[]` (store: `ForgeryCall`) | honest |
| Agent list: name/status/current/cost/duration, `agents (n)` count | `snap.agents[]` (store: `ForgeryAgentRecord`, `usage.cost`) + `snap.now` | honest |
| Filter label `filter: <n>` | component state (UI filter, not telemetry) | honest |
| Settings view: host calls list, pi binary, concurrency | `opts.hostCalls` (registry via controller) + `opts.agentConfig` (runner config) | honest |
| Host-calls/agents counts in empty-state line | `opts.hostCalls.length`, `snap.agents.length` | honest |

## controller.ts — `ForgeryUiController`

| Rendered value | Source | Verdict |
|---|---|---|
| Built-in footer status string via `#statusString()` | `snap.runs`, `snap.activeTotals`, `snap.now` (store) | honest |
| Dashboard opts: `hostCalls`, `agentConfig.maxConcurrent`/`piBinary` | `this.hostCalls` (registry) + `this.runner` config | honest |
| Footer ctx wiring (`gitBranch`, `contextPercent`, `contextTokens`, `modelId`) | `ExtensionContext` methods (ctx) | honest |

## Notes

- `widget.ts` line 33 (`WIDGET_TERMINAL_ROW_SHARE = 0.5`) and the `process.stdout.rows ?? 40` term are layout sizing (half the terminal), not rendered telemetry. Verdict: honest (layout constant, never shown as data).
- Dashboard agent row shows `formatDuration(snap.now - agent.startedAt)` when `agent.finishedAt` is set — a real computed duration from store fields, not a fabricated number. Left unchanged (audit-only goal; no UI changes beyond fabrication fixes).
- Spec's fake-number grep (`Math.random`, hardcoded `0.`/`100.` telemetry, `fixed`) over `extensions/forgery/src/ui/` returned only the layout constant above, a formatting threshold in `format.ts` (`cost < 0.01`), and retention-window clock math on real store timestamps — none are rendered values.

## Confirmation: `ForgerySnapshot` ↔ rendered text

All `ForgerySnapshot` fields read by the UI map 1:1 to rendered text:

| `ForgerySnapshot` field | Used by | Rendered as |
|---|---|---|
| `now` | widget header duration, footer duration, dashboard phase/agent durations | `formatDuration(snap.now - startedAt)` |
| `runs[]` | widget idle/header, footer active+recent, dashboard activity focus | run name/status/error/duration |
| `activeTotals.tokens` | widget header, footer | `formatTokens(...)` + `" tok"` |
| `activeTotals.cost` | widget header, footer | `formatCost(...)` |
| `activeTotals.calls` | widget header, footer | `"<n> calls"` |
| `activeTotals.startedAt` | widget/footer duration base | `formatDuration(now - startedAt)` |
| `agents[]` | widget participant rows, dashboard agent list | name/status/current/cost/duration |

No computed or fake numbers appear in any rendered line.
