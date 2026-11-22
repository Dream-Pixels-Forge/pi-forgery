# Activity Distill

`activity.distill` mines pi-forgery's activity store for repeated host-call
sequences and proposes them as named presets or reusable skills. It is
read-only — it never mutates the store — and works purely on host-call ref
sequences (e.g. `pi.grep → pi.read → agents.run`), never on LLM output or
task content.

## `activity.distill`

```ts
activity.distill({
  minOccurrences?: number,   // default 2 — min runs a pattern must appear in
  windowMs?: number,         // default 7 days — only runs finished within this window
  n?: number,                // default 3 — call-sequence length to mine
})
```

Returns an array of distilled patterns, sorted by `occurrences` descending:

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | string | Human-readable pattern, e.g. `"pi.grep → pi.read → agents.run"` |
| `suggestedName` | string | Suggested preset/skill name, e.g. `"grep-to-run-3step"` |
| `occurrences` | number | Number of distinct completed runs containing the pattern |
| `avgCost` | number | Average total cost (USD) across runs containing the pattern |
| `avgDuration` | number | Average duration (ms) across runs containing the pattern |
| `firstSeen` | number | Earliest run's `startedAt` (epoch ms) |
| `lastSeen` | number | Latest run's `finishedAt` (epoch ms) |

## How it works

1. Filters completed runs finished within `windowMs` (default 7 days).
2. For each run, extracts all consecutive N-call sequences (n-grams, default N=3).
3. Counts how many distinct runs contain each pattern (deduplicated within a run).
4. Filters to patterns appearing in at least `minOccurrences` runs.
5. Sorts by occurrence count descending.

## Example

```ts
const patterns = await activity.distill({
  minOccurrences: 3,
  windowMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  n: 3,
});

// patterns[0] might be:
// {
//   pattern: "pi.grep → pi.read → agents.run",
//   suggestedName: "grep-to-run-3step",
//   occurrences: 7,
//   avgCost: 0.14,
//   avgDuration: 45000,
//   firstSeen: 1700000000000,
//   lastSeen: 1700100000000,
// }
```

Use the output to manually create a preset or skill — `activity.distill`
proposes, never auto-creates.

## Example forgery_exec program

```ts
const patterns = await activity.distill({ minOccurrences: 2, n: 3 });
for (const p of patterns) {
  console.log(`${p.pattern} · ${p.occurrences}x · $${p.avgCost.toFixed(4)}`);
}
```
