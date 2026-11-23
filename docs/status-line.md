---
title: Status Line / Footer
layout: default
permalink: /status-line.html
---

# Status line / footer

Active and most-recent completed/failed runs show call count, tokens, cost,
duration, and subgoal progress when available. For example, the compact status
for a finished run is:

```
✓ demo completed · 2 calls · 1.2k tok · $0.42 · 3m12s · subgoals 1/2
```

Call labels use `1 call` / `N calls`. Active durations keep ticking; finished
runs freeze at `finishedAt - startedAt`. Zero cost and missing values are
omitted, and subgoals appear only when the run has them. Every value comes from
the live activity store or the host context — no fabricated telemetry.

## Two surfaces

1. **Custom footer component** (`ctx.ui.setFooter`) — shows git branch, live
   context usage (percent + tokens/limit), model, thinking effort, working
   directory, and active/recent run telemetry. Its run segment keeps the
   animated status glyph, bold run name, and recent status text.

2. **Built-in footer slot** (`ctx.ui.setStatus("forgery", …)`) — when another
   extension reclaims the custom footer slot, the compact status string is
   mirrored here so Pi's built-in footer still shows the same run telemetry.

Both surfaces use the same status summary and metric formatter, so call,
token, cost, duration, and subgoal values cannot drift apart.

## Update cadence

The footer reads live state on every render:

- Context usage, model and thinking effort come from the host context
  (`ctx.getContextUsage()`, `ctx.model`, `ctx.thinkingLevel`) and are re-read on
  every frame — Pi recomputes them on each call.
- Run metrics and elapsed time come from the activity store, whose snapshot
  clock keeps advancing even when the store has not mutated.
- A one-second heartbeat asks the TUI for a frame, so elapsed time and context
  usage keep ticking even while nothing else changes.

Activity-store and agent-runner revisions still trigger an immediate refresh
(debounced to ~100 ms).

## Not yet wired

The `compacts`, `issues`, `PRs` and `CI` segments have no host source yet, so
they stay hidden. Wiring them needs a `gh`/CI data source of their own.
