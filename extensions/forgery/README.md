# pi-forgery

Enhanced Pi extension with programmable execution, activity tracking, and improved developer experience.

## Overview

pi-forgery is a reimplementation and enhancement of pi-fabric that provides:
- A programmable `forgery_exec` tool for composing Pi core tools and agents
- Real-time activity tracking with widget, footer, and dashboard UI
- Layered configuration system with validation and fallbacks
- Budget enforcement and guardrail policies for safe execution
- Comprehensive observability of all extension activities

## Features

### Programmable Execution
The `forgery_exec` tool lets you write TypeScript programs that:
- Compose Pi core tools (read, write, bash, etc.) and one-shot agents
- Run independent operations in parallel via `Promise.all`
- Return values directly to the calling LLM
- Record all activity for monitoring and debugging

### Activity Tracking & Observability
- **Activity Widget**: Always-visible status above the editor
- **Status Line Footer**: Git branch, context usage, and runtime metrics
- **Dashboard**: Full-screen interface (`/forgery dashboard`) with:
  - Activity timeline and phase tracking
  - Agent monitoring and logs
  - Settings view (configuration and host calls)
- **Workflows (EGM Goldfish review)**: Goldfish-style document audit pipelines — `workflow.run` / `workflow.status` / `workflow.stop` host calls plus `/forgery workflow run|status|list|stop|resume`. Bundled pipelines:
  - `review`: Zoom Out → Comprehension → Critic → Zoom Out → Implementation Readiness (5 phases).
  - `brainstorm`: 6-lens concept swarm (design critic, codebase auditor, zoom-out, comprehension, tech-lead readiness, plain-English editor) that stress-tests a raw concept and dedupes into `concepts_brief.md`.
  Each phase runs as fresh zero-context agents; findings deduped/triaged to report artifacts under `.pi/forgery/review/`.
- **Commands**: `/forgery status`, `/forgery agents`, `/forgery log`, etc.

### Configuration
Layered configuration system:
```
defaults ← global (~/.pi/agent/forgery.json) ← project (<cwd>/.pi/forgery.json)
```
- Runtime validation with automatic fallback to defaults
- Budget limits (cost/token) per execution
- Guardrail policies (confirm/block) for destructive operations
- UI customization options

### Safety & Security
- Static schema validation for all host calls before execution
- Host proxy that only exposes registered, validated tools
- Guardrail system requiring confirmation for sensitive operations
- No arbitrary code execution or unsafe API access

## Installation

The extension is automatically available in Pi agent environments. No manual installation required.

## Usage

### Basic Examples

#### File Operations
```typescript
// Read a file
const content = await pi.read("src/config.ts");

// Write a file
await pi.write("output.txt", "Hello, World!");

// Edit a file
await pi.edit({
  path: "src/main.ts",
  old_string: "console.log('hello');",
  new_string: "console.log('world');",
  replace_all: true
});
```

#### Shell Commands
```typescript
// Run a shell command
const result = await pi.bash("ls -la | head -10");

// Execute a custom command
const output = await pi.exec({
  command: "git",
  args: ["status", "--short"]
});
```

#### Agent Execution
```typescript
// Spawn a research agent
const research = await agents.run({
  task: "Research the latest developments in AI agents",
  model: "claude-sonnet-3",
  timeoutMs: 120000
});

// Use the results
console.log(research.value.text);
```

#### Parallel Execution
```typescript
// Load multiple files concurrently
const [packageJson, tsconfig, readme] = await Promise.all([
  pi.read("package.json"),
  pi.read("tsconfig.json"),
  pi.read("README.md")
]);
```

### Configuration

Create `.pi/forgery.json` in your project root:
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

### Commands

| Command | Description |
|---------|-------------|
| `/forgery dashboard` | Open full-screen dashboard |
| `/forgery status` | Show compact status summary |
| `/forgery agents` | List recorded agents |
| `/forgery log <agent-id>` | Show agent transcript |
| `/forgery stop <agent-id>` | Stop a running agent |
| `/forgery settings` | Show read-only configuration |
| `/forgery workflow run <pipeline> <target>` | Run a Goldfish review pipeline against a document |
| `/forgery workflow status <run-id>` | Show a workflow run's state |
| `/forgery workflow list` | List recent workflow runs |
| `/forgery workflow stop <run-id>` | Stop a running workflow |
| `/forgery workflow resume <run-id>` | Resume a stopped workflow |
| `/forgery workflow run brainstorm <target>` | 6-lens concept brainstorm against a document |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `ctrl+alt+f` | Open forgery dashboard |
| `ctrl+alt+e` | Focus activity widget |

## Extension Architecture

### Activity Store
Centralized state management tracking:
- Runs (forgery_exec invocations)
- Phases within runs
- Tool and agent calls
- Events and metrics

### UI Layers
Dumb presenters that read from the activity store:
- **Widget**: Compact status above editor
- **Footer**: Status line with key metrics
- **Dashboard**: Full-screen interactive interface

### Security Model
1. **Static Validation**: All calls validated against TypeBox schemas before execution
2. **Host Proxy**: Only exposes registered, validated tool methods
3. **Guardrails**: Policies enforced at execution time (confirm/block/off)
4. **No Eval**: Programs run via `new Function` with restricted scope

## Development

### Testing
```bash
# Run all tests
npm test

# Type checking
npm run typecheck

# Build
npm run build
```

### Project Structure
```
src/
├── activity/       # Activity store and types
├── agents/         # Agent runner
├── config/         # Configuration loading
├── exec/           # Tool implementation and schemas
├── ui/             # Widget, footer, dashboard, controller
├── git.ts          # Git branch reader
└── index.ts        # Extension factory
```

## Related Documents
- [SKILL.md](SKILL.md) - Extension capability description
- [exec-patterns.md](exec-patterns.md) - Common programming patterns and recipes

## Versioning
See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License
MIT