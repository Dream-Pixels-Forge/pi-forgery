# pi-forgery — Enhanced Pi Extension

## Description
Improved pi-fabric reimplementation: programmable forgery_exec tool, one-shot agents, activity widget, status-line footer, and /forgery dashboard for Pi

## Features

### Programmable Tool (`forgery_exec`)
- Execute TypeScript programs that compose Pi core tools and one-shot agents
- Independent calls run in parallel via Promise.all
- Each call is recorded in the activity store and visible in live UI components
- Return values are passed back to the calling LLM

### Activity Tracking
- Real-time activity widget (above editor) showing active runs and agent status
- Custom status-line footer with git branch, context progress bar + percent,
  model name + effort level, working directory (basename), compacts count,
  issues/PRs, CI status, and active run status (calls, tokens, cost, duration)
- Full-screen dashboard (/forgery) with activity timeline and settings view
- Detailed logging of all tool calls, agent runs, and phase transitions

### Configuration
- Layered configuration system: defaults ← global (~/.pi/agent/forgery.json) ← project (<cwd>/.pi/forgery.json)
- Runtime validation with automatic fallback to defaults for invalid values
- Budget enforcement (cost/token limits) and guardrails (confirm/block policies)

### Agent Integration
- Spawn one-shot Pi agents for complex tasks
- Monitor agent progress, tool usage, and resource consumption
- Automatic agent lifecycle tracking in activity store

### Workflows (EGM Goldfish Review)
- Goldfish-style document audit pipelines: each phase runs bundled personas
  (zoom-out, comprehension, design-critic, style, implementation-readiness,
  codebase-details) as fresh zero-context `pi --print` subprocesses
- Bundled pipelines:
  - `review` — Zoom Out → Comprehension → Critic → Zoom Out →
    Implementation Readiness (5 phases)
  - `brainstorm` — 6-lens concept swarm (design critic, codebase auditor,
    zoom-out architect, naive reader, tech-lead readiness, plain-English
    editor) that stress-tests a raw concept and dedupes into a concept brief
  - `drift-report` — doc-vs-code consistency scan (scan design docs → locate
    source → verify against code → report drift). Reports only divergences
    — missing features, incomplete models, logic shortcuts, architectural
    divergence — never remediates.
  - `bootstrap` — codebase bootstrap (scan modules → document interface →
    document invariants → document side-effects → upsert sentinel blocks).
    Writes `/// @forgery-bootstrap` sentinel blocks at the top of each module
    so future drift detection can verify docs match code. Read-then-write on
    source files only — never rewrites logic.
- Findings returned as fenced JSON, deduped and triaged (blocker/major/nit)
- Report artifacts written to `.pi/forgery/review/<run-id>/`
- Host calls: `workflow.run`, `workflow.status`, `workflow.stop`
- Command: `/forgery workflow run|status|list|stop|resume`

### Safety Features
- Static schema validation for all host calls before execution
- Guardrail system for destructive operations (write, edit, bash)
- Confirmation prompts for sensitive operations when enabled
- Budget limits to prevent runaway costs

## Usage

### Basic Execution
```typescript
// Simple file read
const content = await pi.read("src/index.ts");

// Shell command
const result = await pi.bash("ls -la");

// Agent task
const agentResult = await agents.run({
  task: "Explain how React hooks work",
  model: "claude-sonnet",
  timeoutMs: 60000
});

// Parallel execution
const [file1, file2] = await Promise.all([
  pi.read("file1.txt"),
  pi.read("file2.txt")
]);
```

### Configuration Example
Create `.pi/forgery.json` in your project:
```json
{
  "agents": {
    "maxConcurrent": 3,
    "timeoutMs": 120000,
    "defaultModel": "claude-sonnet"
  },
  "budget": {
    "maxCostPerRun": 0.50,
    "maxTokensPerRun": 50000
  },
  "guardrails": {
    "writePolicy": "confirm",
    "bashPolicy": "block"
  },
  "ui": {
    "widget": true,
    "footer": true,
    "maxRows": 12,
    "retainMs": 60000
  }
}
```

## Extension Points

### Commands
- `/forgery dashboard` - Open full-screen dashboard
- `/forgery status` - Show compact status summary
- `/forgery agents` - List recorded agents
- `/forgery log <agent-id>` - Show agent transcript
- `/forgery stop <agent-id>` - Stop a running agent
- `/forgery settings` - Show read-only configuration
- `/forgery workflow run <pipeline> <target>` - Run a Goldfish review pipeline
- `/forgery workflow status <run-id>` - Show a workflow run's state
- `/forgery workflow list` - List recent workflow runs
- `/forgery workflow stop <run-id>` - Stop a running workflow
- `/forgery workflow resume <run-id>` - Resume a stopped workflow

### Keyboard Shortcuts
- `ctrl+alt+f` - Open forgery dashboard
- `ctrl+alt+e` - Focus activity widget

## Implementation Notes

### Architecture
- Activity store as single source of truth for all UI layers
- Layered configuration with validation and fallback
- Guardrail policies enforced at execution time
- Metrics accumulation for budget tracking

### Security
- All host calls validated against TypeBox schemas
- Host proxy limits access to registered tools only
- No arbitrary property access or eval capabilities
- Destructive operations require confirmation when guardrails enabled

## Dependencies
- `@earendil-works/pi-coding-agent` - Core Pi agent framework
- `@earendil-works/pi-tui` - Terminal UI components
- `typebox` - Runtime schema validation

## Related Patterns
See `exec-patterns.md` for common programming patterns and recipes.