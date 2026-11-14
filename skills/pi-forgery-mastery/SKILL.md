---
name: pi-forgery-mastery
description: "Comprehensive guide for using pi-forgery extension: specialist agents (coder, researcher, reviewer, planner, tester, debugger, architect, security, design, git, sniper, teammate, general), dev loop orchestration, cost management, quality gates, and parallel/pipeline execution. Use when working with pi-forgery, forgery_exec tool, or needing high-accuracy one-shot agents."
---

# Pi-Forgery Mastery

Complete guide for leveraging the pi-forgery extension to achieve production-ready results with specialist agents, cost control, and self-correcting workflows.

## Quick Start

```typescript
// Run a single specialist agent
await agents.coder({ 
  task: "Add OAuth2 PKCE to auth module", 
  outputSchema: { 
    type: "object", 
    properties: { 
      filesChanged: { type: "array", items: { type: "object" } },
      testsPassed: { type: "boolean" },
      buildPassed: { type: "boolean" }
    },
    required: ["filesChanged", "testsPassed", "buildPassed"]
  }
});

// Full dev loop with cost control
await devloop.run("Ship payment feature", {
  budget: { maxCostPerRun: 2.00, warningThreshold: 0.85 },
  phaseOrder: ["teammate", "planner", "tester", "coder", "sniper", "reviewer", "git"]
});
```

## Specialist Agents Reference

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| `agents.coder` | Production code, refactoring, bug fixes | Writing/modifying code; must pass type-check/lint/build |
| `agents.researcher` | Codebase investigation | Finding patterns, tracing dependencies, synthesizing findings |
| `agents.reviewer` | Rigorous code review | Security, correctness, performance, maintainability audit |
| `agents.planner` | Technical planning | Breaking down features, creating specs, risk assessment |
| `agents.tester` | Test architecture | Unit/integration/e2e strategy, coverage gates |
| `agents.debugger` | Root cause analysis | Systematic debugging with falsifiable hypotheses |
| `agents.architect` | Technical decisions | 3+ alternatives with trade-off matrix, ADR output |
| `agents.security` | AppSec audits | OWASP Top 10, CWE mapping, STRIDE threat modeling |
| `agents.design` | UI/UX, design systems | Tokens, components, patterns, accessibility, handoff |
| `agents.git` | Git lifecycle | Issues, PRs, CI/CD, releases, worktree isolation |
| `agents.sniper` | Vision analysis | Visual regression, WCAG audit, design token extraction |
| `agents.teammate` | Deep exploration | 10 parallel analysts → `dev-notes/teammate-analysis/` |
| `agents.general` | Fallback | Any task not covered above |

## Core Workflows

### 1. Single Agent with Structured Output

```typescript
const result = await agents.runEnhanced({
  task: "Refactor user service to use repository pattern",
  template: "coder",
  outputSchema: {
    type: "object",
    properties: {
      filesChanged: { type: "array", items: { 
        type: "object",
        properties: { path: { type: "string" }, action: { type: "string" }, description: { type: "string" } },
        required: ["path", "action", "description"]
      }},
      summary: { type: "string" },
      testsPassed: { type: "boolean" },
      buildPassed: { type: "boolean" }
    },
    required: ["filesChanged", "summary", "testsPassed", "buildPassed"]
  },
  maxRetries: 2,
  parentRunId: hctx.runId
});
```

### 2. Parallel Agent Execution

```typescript
await agents.runParallel({
  agents: [
    { ref: "agents.coder", task: "Implement feature X" },
    { ref: "agents.tester", task: "Write tests for feature X" },
    { ref: "agents.documenter", task: "Document feature X" },
  ]
});
```

### 3. Sequential Pipeline (Context Passes Forward)

```typescript
await agents.runPipeline({
  steps: [
    { ref: "agents.researcher", task: "Analyze current auth system" },
    { ref: "agents.planner", task: "Plan OAuth2 migration" },
    { ref: "agents.coder", task: "Implement OAuth2" },
    { ref: "agents.security", task: "Audit implementation" },
    { ref: "agents.tester", task: "Write security tests" },
  ]
});
```

### 4. Full Dev Loop with Budget

```typescript
const result = await devloop.run("Ship payment integration", {
  budget: { maxCostPerRun: 2.00, maxTokensPerRun: 100000, warningThreshold: 0.85 },
  maxLoopIterations: 3,
  qualityThreshold: 0.85,
  enableLearning: true,
  phaseOrder: ["teammate", "planner", "tester", "coder", "sniper", "reviewer", "git"]
});
```

### 5. Cost Management

```typescript
// Estimate before running
const estimate = await cost.estimate({
  model: "claude-sonnet-4",
  template: "coder",
  taskDescription: "Add rate limiting to API",
  contextTokens: 3000
});

// Set budget for current run
await cost.budget({
  maxCostPerRun: 1.00,
  maxCostPerAgent: 0.25,
  warningThreshold: 0.8
});

// Get real-time report
const report = await cost.report({ runId: "abc123" });

// Get optimization recommendations
const optimizations = await cost.optimize({ runId: "abc123" });
```

## Quality Gates (Auto-Applied)

Every agent output passes through these gates:

1. **nonEmptyGate** — Rejects empty/trivial output
2. **noHallucinationGate** — Catches TODO/FIXME/placeholder markers
3. **schemaValidationGate** — Validates JSON against provided schema
4. **specificityGate** — Requires file:line references for code tasks
5. **completenessGate** — Ensures required arrays are non-empty

**Self-Correction**: Failed gates trigger up to 2 retries (configurable) with detailed feedback.

## Best Practices

### ✅ Do
- Always provide `outputSchema` for structured, validated results
- Use `parentRunId` to enable context injection and cost tracking
- Set `maxRetries` ≥ 1 for critical tasks
- Use `devloop.run` for multi-phase features with budget control
- Run `cost.estimate` before expensive operations
- Use `agents.teammate` for deep codebase exploration before planning

### ❌ Don't
- Skip `outputSchema` — unstructured output fails quality gates
- Run agents without `parentRunId` — loses context and cost tracking
- Use `agents.general` when a specialist exists
- Ignore budget warnings — they prevent runaway costs

## Cost Optimization Tips

1. **Use cheaper models for research**: `claude-3.5-haiku` or `gpt-4o-mini`
2. **Enable caching**: Anthropic prompt caching saves 90% on repeated context
3. **Batch small tasks**: `agents.runParallel` reduces per-agent overhead
4. **Limit teammate domains**: Only request needed analysts
5. **Set budgets**: `cost.budget({ maxCostPerRun: 1.00 })` prevents surprises

## File Outputs

| Agent | Output Location |
|-------|-----------------|
| `agents.teammate` | `dev-notes/teammate-analysis/{frontend,backend,db,security,design,ui-ux,infra,api,testing,dependencies}.md` + `INDEX.md` |
| `devloop.run` | Activity store + `dev-notes/` artifacts |
| Cost reports | Terminal output + activity store metrics |
| Subgoals | Activity store + widget/footer/dashboard TUI surfaces |

## Subgoals — Decompose Tasks into Trackable Units

Subgoals break an agent's task into named, trackable units with their own status and progress. They appear live in the activity widget, footer, and `/forgery` dashboard.

### Host Calls

```typescript
// Create a subgoal (deduped by goalId + name — same name returns existing)
subgoals.create({
  goalId: string,              // parent forgery_exec run id (defaults to hctx.runId)
  parentSubgoalId?: string,    // optional nesting under another subgoal
  name: string,
  description?: string,
  acceptanceCriteria?: string[],
  status?: "pending"|"running"|"completed"|"failed"|"blocked",
  current?: string,            // headline of current tool/step
  total?: number,              // expected steps/items
  completed?: number,          // steps done so far
})

// Update progress
subgoals.update({
  subgoalId: string,           // returned by subgoals.create
  status?: "pending"|"running"|"completed"|"failed"|"blocked",
  current?: string,
  total?: number,
  completed?: number,
  output?: unknown,
  error?: string,
  usage?: { input?: number, output?: number, cost?: number },
})

// List subgoals for a goal
subgoals.list({ goalId?: string })  // defaults to hctx.runId

// Mark terminal
subgoals.finish({
  subgoalId: string,
  success?: boolean,           // default true
  error?: string,
})
```

### TUI Surfaces

| Surface | Shows |
|---------|-------|
| **Widget** (above editor) | Subgoal rows: glyph (⟳/✓/✗/◐/○) + name + `completed/total` progress + current line |
| **Footer** (status line) | `subgoals X/Y ✓` segment when subgoals exist |
| **Dashboard** (`/forgery`) | Subgoal list under focused run with completion count |

### Example: Decompose a Feature

```typescript
// Parent run
await devloop.run("Add OAuth2 PKCE auth", { parentRunId: runId });

// Decompose into subgoals
await subgoals.create({ goalId: runId, name: "research OAuth2 flow", total: 3 });
await subgoals.create({ goalId: runId, name: "implement PKCE middleware", total: 5 });
await subgoals.create({ goalId: runId, name: "write security tests", total: 4 });

// Update as work progresses
await subgoals.update({ subgoalId: sg1.id, completed: 2, current: "reading RFC 7519" });
await subgoals.finish({ subgoalId: sg1.id, success: true });
```

### ⚠️ Known Limitation: Name-Based Dedup

`subgoals.create` deduplicates by `(goalId, name)`. Calling it twice with the same goal and name returns the **existing** subgoal (patched), not a new one. This is intentional for idempotency but means you cannot have two subgoals with identical names under the same goal. If you need distinct subgoals, give them distinct names.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent fails quality gates | Check `validationErrors` and `qualityGateFailures` in result; add more specific `task` |
| Budget exceeded | Run `cost.estimate` first; set `maxCostPerAgent`; use cheaper model |
| Context lost | Ensure `parentRunId` is passed; use `devloop.run` for multi-phase |
| Output not parsing | Verify `outputSchema` matches expected JSON structure |
| Subgoal not showing in TUI | Ensure `goalId` matches the active `hctx.runId`; check `/forgery dashboard` settings view |
| `subgoals.create` returns existing subgoal | Name-based dedup — use a unique `name` for each subgoal |
| Subgoal stuck in "running" | Call `subgoals.finish({ subgoalId, success: true })` when done |

## Related Commands

```bash
/forgery status          # Show active runs, host calls, agents
/forgery agents          # List all recorded agents
/forgery log <agent-id>  # View agent transcript
/forgery workflow run review <file>  # Goldfish code review
```

## See Also

- [REFERENCE.md](REFERENCE.md) — Detailed API, schemas, and advanced patterns
- [EXAMPLES.md](EXAMPLES.md) — Real-world usage patterns