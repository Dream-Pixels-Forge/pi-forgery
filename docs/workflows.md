# Workflows

pi-forgery ships a Goldfish-style workflow engine (`workflow.run`) plus two
composition host calls: `workflow.chain` (pipeline pipelines) and
`workflow.gate` (pause/abort/resume control). All runs are recorded in the
activity store and surface in the widget/footer/dashboard.

## Bundled pipelines

| Pipeline | Description |
|----------|-------------|
| `review` | Five-phase document audit: Zoom Out → Comprehension → Critic → Zoom Out → Implementation Readiness. |
| `brainstorm` | Six-lens concept swarm: design critic, codebase auditor, zoom-out architect, naive reader, tech-lead readiness, plain-English editor. |
| `drift-report` | Doc-vs-code consistency scan: reports only divergences between design docs and live code. |
| `bootstrap` | Bottom-up codebase documentation: interface/invariants/side-effects per module + `@forgery-bootstrap` sentinel blocks. |

Use `workflow.pipelines` (via `workflow.run` with an unknown pipeline id) to
list available pipelines, or call `workflow.run` directly with a pipeline id.

## `workflow.run`

```ts
workflow.run({ pipeline: "review", target: "DESIGN.md", context: ["spec.md"], mode: "REVIEW" })
```

Runs a single pipeline against a target document. Returns the run id, status,
per-phase findings, and the consolidated artifact path.

## `workflow.chain`

```ts
workflow.chain({
  steps: [
    { pipeline: "bootstrap", target: "src/index.ts" },
    { pipeline: "drift-report" },                       // target threads from step 1's artifact
    { pipeline: "review", target: "DESIGN.md", gate: "pause" },
    { pipeline: "brainstorm" },
  ],
})
```

Runs pipelines sequentially, threading each step's consolidated artifact into
the next step's `target` when omitted.

| Step field | Description |
|------------|-------------|
| `pipeline` | Pipeline id (`review`, `brainstorm`, `drift-report`, `bootstrap`). |
| `target?` | Target file path. Defaults to previous step's consolidated artifact. |
| `context?` | GoldfishContext reading list for the pipeline. |
| `mode?` | `BRAINSTORM` \| `REVIEW` (default `REVIEW`). |
| `gate?` | `proceed` \| `pause` \| `abort` after this step completes (default `proceed`). |

Returns `{ runId, status, steps[], currentStep, gate?, error? }`.

## `workflow.gate`

```ts
workflow.gate({ chainId: "<runId from workflow.chain>", gate: "proceed" })
```

Overrides the gate state for a paused chain run. Valid gates: `proceed`,
`pause`, `abort`. Gate state is stored in the activity store, so a pause
survives across `forgery_exec` calls and can be resumed later.

## Activity surface

Every chain and step creates an activity run recorded in the store:

- Chain run: `workflow chain: N step(s)` — surfaces in the widget and footer.
- Step runs: one per pipeline, created by the engine — visible in the
  dashboard activity view and events timeline.

Gate state (`chain-gate:<runId>`) is stored as an activity item on the chain
run, readable via `activity.runs()` / `activity.snapshot()`.

## Example

```ts
// Bootstrap a module, then check for drift, then review the design doc
const result = await workflow.chain({
  steps: [
    { pipeline: "bootstrap", target: "src/lib/auth.ts" },
    { pipeline: "drift-report" },           // target = bootstrap artifact
    { pipeline: "review", target: "DESIGN.md", gate: "pause" },
  ],
});

// If paused, resume later:
if (result.status === "paused") {
  await workflow.gate({ chainId: result.runId, gate: "proceed" });
  // Re-run the chain — step 2 will reuse step 1's artifact
}
```
