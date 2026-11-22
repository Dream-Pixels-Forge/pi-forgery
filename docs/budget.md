# Budget Circuit Breaker

pi-forgery enforces cost budgets mid-run so a `forgery_exec` program can't
accidentally burn through credits. Budgets are per-run, configured via the
`cost.budget` host call, and enforced by the UI controller's refresh loop
(every second while something is live).

## Configuring a budget

```ts
cost.budget({
  maxCostPerRun: 1.00,      // hard stop at $1.00
  maxCostPerAgent: 0.20,    // per-agent cap (planned)
  maxCostPerPhase: 0.10,    // per-phase cap (planned)
  maxTokensPerRun: 100_000, // token cap
  warningThreshold: 0.8,    // warn at 80% (default)
})
```

## Thresholds

| Threshold | Behavior |
|-----------|----------|
| < 80% (default warning threshold) | Normal operation — no budget UI |
| ≥ 80% (`overSoft`) | `⚠ budget NN%` appears in the footer (warning color), a `budget-warning` event is recorded on the run |
| ≥ 100% (`overHard`) | Run is hard-stopped with `status: "failed"` and `error: "budget exceeded"`, a `budget-exceeded` event is recorded |

## Footer segment

When a run crosses the soft threshold, `⚠ budget NN%` appears as a **priority-0** segment in the status-line footer — the same priority as CI failure and handoff alerts, so it survives at any terminal width.

- Below 80%: no budget segment
- 80–99%: `⚠ budget NN%` in warning color
- ≥ 100%: `⚠ budget NN%` in error color, run stopped

## Example

```ts
// Set a $0.50 budget with warning at 70%
await cost.budget({
  maxCostPerRun: 0.50,
  warningThreshold: 0.7,
});

// Launch agents — if total cost crosses $0.35, the footer shows
// "⚠ budget 70%". If it crosses $0.50, the run stops.
await agents.run({ task: "refactor the auth module" });
await agents.run({ task: "write integration tests" });
```

## Notes

- Budgets are per-run and in-memory — they reset when Pi restarts.
- Mid-run enforcement pauses **new** agent spawns; in-flight calls complete (no data loss).
- The `cost.report` host call shows budget status per run.
- `cost.optimize` suggests model switches and other savings when a run is over budget.

## Host calls

| Call | Effect |
|------|--------|
| `cost.budget({ maxCostPerRun?, maxCostPerAgent?, maxTokensPerRun?, warningThreshold? })` | Set budget for the current run |
| `cost.report({ runId? })` | Print cost report including budget status |
| `cost.records({ runId?, agentId? })` | List per-agent cost records |
