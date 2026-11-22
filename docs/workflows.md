# Workflows

pi-forgery ships a Goldfish-style workflow engine (`workflow.run`) plus three
composition host calls: `workflow.chain` (pipeline pipelines),
`workflow.gate` (pause/abort control), and `workflow.resume` (durable journal
resume). All runs are recorded in the activity store and surface in the
widget/footer/dashboard.

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

## `workflow.resume`

```ts
workflow.resume({ chainId: "<runId from workflow.chain>" })
```

Resumes a paused or interrupted chain from its durable journal. Returns:

- `status: "already-complete"` — all steps finished; `completedSteps` lists them.
- `status: "resumable"` — some steps done; `completedSteps` lists them, `nextStep`
  is the index of the next step to run.
- `status: "not-found"` — no journal exists for that chain id.

Journal files are written to `.pi/forgery/journal/<runId>.json` (write-ahead
before each phase, updated on completion — crash-safe). Resume is idempotent.

## Durable journal

Every `workflow.chain` run writes a journal entry to
`.pi/forgery/journal/<runId>.json` before each step starts and updates it on
completion. If Pi restarts mid-chain, `workflow.resume(runId)` replays
completed steps and continues from the first incomplete one — no lost phase
state.

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
