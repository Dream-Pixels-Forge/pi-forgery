# Status line / footer

When a run is active the footer shows:

```
⎇ main · ctx 42% · 21.3k tok · claude-sonnet · ◐ demo · 12 calls · 1.2k tok · $0.42 · 3m12s
```

Every value comes from the live activity store or the host context — no
fabricated telemetry.

## Two surfaces

1. **Custom footer component** (`ctx.ui.setFooter`) — shows git branch, context
   tokens/percent, model, working directory, compacts, issues, PRs, CI status,
   and active run status (calls, tokens, cost, duration).

2. **Built-in footer slot** (`ctx.ui.setStatus("forgery", …)`) — when another
   extension reclaims the custom footer slot, the compact status string is
   mirrored here so Pi's built-in footer still shows live forgery state.

The footer updates on every activity-store and agent-runner revision change
(debounced to ~100 ms).
