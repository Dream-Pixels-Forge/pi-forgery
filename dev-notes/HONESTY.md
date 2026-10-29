# Honesty Audit — Gate 5

**Project:** pi-forgery  
**Audited files:** `src/ui/widget.ts`, `src/ui/footer.ts`, `src/ui/dashboard.ts`, `src/ui/controller.ts`, `src/ui/format.ts`, `src/git/git.ts`, `src/git/githubStats.ts`  
**Verdict:** ✅ All rendered values are honest — zero fabricated telemetry

## Method

Traced every rendered string/number in widget/footer/dashboard/controller back to its source: either `ForgeryActivityStore` (`store.snapshot()`), `ExtensionContext` (live `ctx`), or a CLI (`git` / `gh`). UI-only state (filter, runIndex, entityIndex, theme) is not telemetry and is excluded.

## Per-value source mapping

### `src/ui/footer.ts` — `ForgeryFooter.render()`

| Rendered value | Source | Honest? |
|---|---|---|
| git branch | `footerCtx.gitBranch()` → `GitBranchReader.getBranch()` (git CLI) | ✅ |
| context percent/bar | `footerCtx.contextUsage()` → `ctx.getContextUsage()` | ✅ |
| tokens/max | `footerCtx.contextUsage()` → `ctx.getContextUsage()` | ✅ |
| model name | `footerCtx.modelId()` → `ctx.model?.id` | ✅ |
| effort | `footerCtx.effort()` → `ctx.thinkingLevel` | ✅ |
| working dir | `footerCtx.cwd()` → `ctx.cwd` | ✅ |
| compact count | `footerCtx.compactCount()` → `store.activeRunId()` + `store.get().compacts` | ✅ |
| compact max | `footerCtx.compactMax()` → constant `5` | ✅ config threshold, not telemetry |
| issues open/closed | `footerCtx.issuesOpen/Closed()` → `GitHubStatsReader` (gh CLI) | ✅ |
| PRs open/closed | `footerCtx.prsOpen/Closed()` → `GitHubStatsReader` (gh CLI) | ✅ |
| CI status | `footerCtx.ciStatus()` → `GitHubStatsReader.ciStatus()` (gh CLI) | ✅ |
| active run name/status | `snap.runs.find()` (store) | ✅ |
| active call/token/cost totals | `snap.activeTotals` (computed from store call metrics) | ✅ |
| elapsed duration | `snap.now - active.startedAt` (live clock + store) | ✅ |

### `src/ui/footer.ts` — `ForgeryFooter.statusString()`

| Rendered value | Source | Honest? |
|---|---|---|
| active/recent run name + status | `snap.runs` (store) | ✅ |
| call count | `snap.activeTotals.calls` (store) | ✅ |
| tokens | `snap.activeTotals.tokens` (store) | ✅ |
| cost | `snap.activeTotals.cost` (store) | ✅ |
| elapsed duration | `snap.now - active.startedAt` (live clock + store) | ✅ |

### `src/ui/widget.ts` — `ForgeryWidget.render()`

| Rendered value | Source | Honest? |
|---|---|---|
| active run name | `snap.runs.find()` (store) | ✅ |
| call/token/cost totals | `snap.activeTotals` (store) | ✅ |
| elapsed duration | `snap.now - active.startedAt` (live clock + store) | ✅ |
| agent name/status/current | `snap.agents` (store) | ✅ |
| spinner frame | `this.#frame` (UI animation counter, not telemetry) | ✅ UI state |

### `src/ui/controller.ts` — `ForgeryUiController.#statusString()`

| Rendered value | Source | Honest? |
|---|---|---|
| active run name | `snap.runs.find()` (store) | ✅ |
| call count | `snap.activeTotals.calls` (store) | ✅ |
| tokens | `snap.activeTotals.tokens` (store) | ✅ |
| cost | `snap.activeTotals.cost` (store) | ✅ |
| elapsed duration | `snap.now - active.startedAt` (live clock + store) | ✅ |

### `src/ui/dashboard.ts` — `ForgeryDashboard.render()`

| Rendered value | Source | Honest? |
|---|---|---|
| snapshot / runs / phases / calls | `this.opts.snapshot()` → `store.snapshot()` | ✅ |
| host calls list/count | `this.opts.hostCalls` (registry) | ✅ |
| agent runner config | `this.opts.agentConfig` (config) | ✅ |
| filter / runIndex / entityIndex | UI component state | ✅ UI state, not telemetry |
| phase name/status/total/current/times | `focus.phases` (store) | ✅ |
| call ref/status/label/preview/error | `focus.calls` (store) | ✅ |
| agent status/name/current/cost/duration | `snap.agents` (store) | ✅ |

### `src/git/git.ts` — `GitBranchReader`

| Value | Source | Honest? |
|---|---|---|
| branch name | `git rev-parse --abbrev-ref HEAD` (git CLI) | ✅ returns `null` on failure, never fabricates |

### `src/git/githubStats.ts` — `GitHubStatsReader`

| Value | Source | Honest? |
|---|---|---|
| issues open/closed | `gh issue list --state ... --json number --jq 'length'` | ✅ returns `null` on failure |
| PRs open/closed | `gh pr list --state ... --json number --jq 'length'` | ✅ returns `null` on failure |
| CI status | `gh run list --limit 1 --json status --jq '.[0].status'` | ✅ returns `null` on failure |

### `src/ui/format.ts`

All functions are pure presenters — they take input values and format them. No data generation. ✅

## Fabricated values found

**None.** Every rendered value traces to `ForgeryActivityStore`, `ExtensionContext`, `git` CLI, `gh` CLI, or agent runner config. No `Math.random()`, no hardcoded metrics, no fake telemetry.

## Notes

- `compactMax: () => 5` is a configuration threshold (maximum compacts before handoff recommended), not a measured telemetry value. It is documented as a default and never presented as observed data.
- `snapshot.now` is a live clock (`Date.now()`) used only for elapsed-duration calculations, not as a data value.
- UI state (filter, runIndex, entityIndex, spinner frame, theme) is component state, not telemetry — excluded from audit scope.

## Conclusion

Gate 5 (honesty) is satisfied. No changes required to UI components.
