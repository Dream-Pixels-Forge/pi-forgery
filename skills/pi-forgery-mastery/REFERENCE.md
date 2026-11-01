---
name: pi-forgery-mastery-reference
description: Detailed API reference for pi-forgery: all host calls, schemas, agent templates, cost management, and dev loop configuration.
---

# Pi-Forgery Mastery — Reference

Complete API documentation for all pi-forgery capabilities.

## Host Calls in `forgery_exec`

### Specialist Agents (Pre-configured)

```typescript
// All accept: { task: string, cwd?: string, model?: string, timeoutMs?: number, systemPrompt?: string, outputSchema?: object, maxRetries?: number }
agents.coder(options)
agents.researcher(options)
agents.reviewer(options)
agents.planner(options)
agents.tester(options)
agents.documenter(options)
agents.debugger(options)
agents.architect(options)
agents.security(options)
agents.design(options)
agents.git(options)
agents.sniper(options)
agents.teammate(options)
```

### Generic Enhanced Agent

```typescript
agents.runEnhanced({
  task: string,
  template: "coder" | "researcher" | "reviewer" | "planner" | "tester" | 
            "documenter" | "debugger" | "architect" | "security" | "design" | 
            "git" | "sniper" | "teammate" | "general",
  cwd?: string,
  model?: string,
  timeoutMs?: number,
  systemPrompt?: string,
  name?: string,
  outputSchema?: object,
  maxRetries?: number,        // default: 2
  qualityGates?: string[],    // ["nonEmpty", "noHallucination", "specificity"]
  injectContext?: boolean,    // default: true
  allowedTools?: string[],    // default: template defaults
  budget?: { maxTokens?: number, maxCost?: number },
  parentRunId?: string        // for context injection + cost tracking
})
```

### Parallel & Pipeline Execution

```typescript
// Parallel — all run simultaneously
agents.runParallel({
  agents: Array<{ ref: "agents.coder"|"agents.researcher"|..., task: string, outputSchema?: object }>
})

// Sequential — each passes context to next
agents.runPipeline({
  steps: Array<{ ref: "agents.coder"|..., task: string, outputSchema?: object }>
})
```

### Cost Management

```typescript
// Estimate cost before running
cost.estimate({
  model: string,              // "claude-sonnet-4", "gpt-4o", "gemini-1.5-flash", etc.
  template?: string,          // affects token estimate
  taskDescription: string,
  contextTokens?: number
}) → { estimatedCost, estimatedInputTokens, estimatedOutputTokens, confidence, assumptions }

// Set budget for current run
cost.budget({
  maxCostPerRun?: number,     // hard stop
  maxCostPerAgent?: number,
  maxCostPerPhase?: number,
  maxTokensPerRun?: number,
  maxTokensPerAgent?: number,
  warningThreshold?: number   // 0-1, default 0.8
})

// Get cost report
cost.report({ runId?: string, format?: "text"|"json" })

// Get optimization recommendations
cost.optimize({ runId: string }) → Array<{
  type: "model_switch"|"caching"|"batching"|"template_change"|"prompt_optimization",
  description: string,
  estimatedSavings: number,
  effort: "low"|"medium"|"high",
  priority: number
}>

// Set budget for current run
cost.budget({ maxCostPerRun: 1.00, warningThreshold: 0.8 })

// Get cost records
cost.records({ runId?: string, agentId?: string })

// Global totals
cost.totals() → { totalCost, totalTokens, runCount, agentCount }
```

### Dev Loop Orchestration

```typescript
devloop.run(task: string, {
  maxLoopIterations?: number,      // default: 3
  maxPhaseRetries?: number,        // default: 2
  enableLearning?: boolean,        // default: true
  qualityThreshold?: number,       // 0-1, default: 0.8
  phaseOrder?: AgentTemplate[],    // default: researcher,planner,tester,coder,reviewer
  globalContext?: string,
  budget?: { maxCostPerRun, maxTokensPerRun, maxTimeMs }
}) → {
  success: boolean,
  iterations: number,
  phases: Array<{ phase, result, passed, feedback, metrics }>,
  finalOutput: EnhancedAgentRunResult,
  learningSummary: string,
  totalMetrics: { durationMs, totalTokens, totalCost, phasesCompleted },
  artifacts: { research, plan, tests, code, review, learning }
}

// Phase runners for step-by-step control
const phases = devloop.createPhaseRunners(...)
phases.research(task, context?)
phases.plan(task, research)
phases.test(task, plan, research)
phases.code(task, plan, tests)
phases.review(code, tests)
phases.learn(allPhases)
```

### Workflow (Goldfish Review)

```typescript
workflow.run({ pipeline: "review", target: string, context?: string[], mode?: "REVIEW"|"BRAINSTORM" })
workflow.status({ runId?: string })
workflow.stop({ runId: string })
workflow.resolve({ runId: string, findings: Array<{ severity, line, issue, rationale, decision }> })
```

### Core Pi Tools (Always Available)

```typescript
pi.read({ path })
pi.write({ path, content, confirm? })
pi.edit({ path, old_string, new_string, replace_all?, confirm? })
pi.bash({ command, confirm?, timeout?, cwd? })
pi.exec({ command, args })
pi.ls({ path? })
pi.find({ pattern, path? })
pi.grep({ pattern, path? })
pi.showImage({ path, maxWidthCells?, maxHeightCells? })
pi.showImages({ paths, maxWidthCells?, maxHeightCells? })
pi.showVideo({ path, maxWidthCells?, maxHeightCells? })
```

### Subgoals

```typescript
// Create or update (deduped by goalId + name)
subgoals.create({
  goalId: string,              // parent run id (defaults to hctx.runId)
  parentSubgoalId?: string,
  name: string,
  description?: string,
  acceptanceCriteria?: string[],
  status?: "pending"|"running"|"completed"|"failed"|"blocked",
  current?: string,
  total?: number,
  completed?: number,
}) → { id, goalId, name, status, current, total, completed, startedAt, updatedAt }

// Update progress
subgoals.update({
  subgoalId: string,
  status?: "pending"|"running"|"completed"|"failed"|"blocked",
  current?: string,
  total?: number,
  completed?: number,
  output?: unknown,
  error?: string,
  usage?: { input?: number, output?: number, cost?: number },
}) → { id, name, status, ... }

// List
subgoals.list({ goalId?: string }) → Array<subgoal>

// Finish
subgoals.finish({
  subgoalId: string,
  success?: boolean,   // default true
  error?: string,
}) → { id, name, status, finishedAt }
```

### Activity Commands

```bash
/forgery dashboard
/forgery status
/forgery agents
/forgery log <agent-id>
/forgery stop <agent-id>
/forgery settings
/forgery image-protocol [auto|kitty|iterm2|none]
/forgery image <path>
/forgery video <path>
/forgery workflow run|status|list|stop|resume ...
```

## ⚠️ Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Subgoal dedup by `(goalId, name)` | Same name + goal returns existing subgoal, not a new one | Use unique names per subgoal |
| No real-`pi` binary integration tests | Tests use mock subprocesses; end-to-end with actual `pi` CLI not covered | Run `/forgery status` manually to verify TUI display |
| No per-subgoal cost attribution | Cost is tracked at run/agent level, not subgoal level | Use `subgoals.update({ usage: {...} })` manually for subgoal-level tracking |


## Agent Output Schemas

### Coder
```json
{
  "filesChanged": [{ "path": "string", "action": "create|edit|delete", "description": "string" }],
  "summary": "string",
  "testsPassed": "boolean",
  "buildPassed": "boolean"
}
```

### Researcher
```json
{
  "findings": [{ "claim": "string", "evidence": [{ "file": "string", "line": "number", "snippet": "string" }], "confidence": 0-1 }],
  "gaps": ["string"],
  "recommendations": ["string"],
  "sources": [{ "file": "string", "lines": "string", "relevance": "string" }]
}
```

### Reviewer
```json
{
  "summary": "string",
  "issues": [{ "file": "string", "line": "number", "severity": "critical|high|medium|low|nit", "issue": "string", "suggestion": "string", "cwe": "string" }],
  "approved": "boolean"
}
```

### Planner
```json
{
  "overview": "string",
  "phases": [{ "name": "string", "tasks": [{ "id": "string", "description": "string", "acceptanceCriteria": ["string"], "estimate": "string", "deps": ["string"], "risks": ["string"], "owner": "string" }] }],
  "acceptanceCriteria": ["string"],
  "risks": ["string"],
  "rollbackPlan": "string"
}
```

### Security
```json
{
  "threatModel": { "assets": [], "trustBoundaries": [], "attackSurfaces": [], "actors": [] },
  "findings": [{ "file": "string", "line": "number", "severity": "critical|high|medium|low|info", "cwe": "string", "owasp": "string", "issue": "string", "impact": "string", "poc": "string", "fix": "string", "references": ["string"] }],
  "summary": "string",
  "riskScore": 0-10
}
```

### Design
```json
{
  "tokens": { "color": {}, "spacing": {}, "typography": {}, "border": {}, "shadow": {}, "motion": {} },
  "components": [{ "name": "string", "props": {}, "states": ["string"], "a11y": ["string"] }],
  "patterns": ["string"],
  "screens": [{}],
  "a11y": ["string"],
  "responsive": {},
  "motion": {},
  "handoff": "string"
}
```

### Git
```json
{
  "actionsTaken": ["string"],
  "issues": [{ "action": "created|updated|closed|labeled|assigned|milestoned", "number": "number", "title": "string", "labels": ["string"], "body": "string" }],
  "prs": [{ "action": "opened|updated|merged|closed|review_requested|draft", "number": "number", "title": "string", "base": "string", "head": "string", "checks": ["string"] }],
  "workflows": [{ "file": "string", "action": "created|updated|deleted|triggered", "description": "string" }],
  "releases": [{ "tag": "string", "name": "string", "notes": "string", "draft": "boolean", "prerelease": "boolean" }],
  "docs": [{ "file": "string", "action": "created|updated|deleted", "description": "string" }],
  "metrics": { "commitsThisSession": "number", "filesChanged": "number", "linesAdded": "number", "linesRemoved": "number", "checksPassed": "boolean" },
  "worktrees": [{ "path": "string", "branch": "string", "commit": "string", "action": "added|removed|listed|locked|unlocked|moved|pruned|repaired", "purpose": "feature|hotfix|test|review|ci|experiment|pr", "locked": "boolean", "prunable": "boolean" }]
}
```

### Sniper
```json
{
  "findings": [{ "type": "regression|accessibility|design-token|layout|component|performance|compliance", "severity": "critical|high|medium|low|info", "bounds": { "x": "number", "y": "number", "width": "number", "height": "number" }, "expected": "string", "actual": "string", "diff": "string", "recommendation": "string" }],
  "annotations": [{ "x": "number", "y": "number", "label": "string", "color": "string" }],
  "metrics": { "pixelDiff": "number", "ssim": "number", "perceptualHash": "string", "contrastViolations": "number", "touchTargetViolations": "number", "layoutShiftRegions": "number" },
  "compliance": { "wcagLevel": "AA|AAA|fail", "designSystemAdherence": 0-1, "responsiveBreakpoints": ["string"] },
  "regression": { "baselineImage": "string", "currentImage": "string", "diffImage": "string", "threshold": "number", "passed": "boolean" },
  "recommendations": ["string"]
}
```

### Teammate
```json
{
  "analysts": [{ "domain": "frontend|backend|database|security|design|ui-ux|infra|api|testing|dependencies", "reportPath": "string", "summary": "string", "findings": ["string"], "risks": ["string"], "recommendations": ["string"], "confidence": 0-1 }],
  "indexPath": "string",
  "crossCuttingConcerns": ["string"],
  "risks": ["string"],
  "quickWins": ["string"],
  "architectureMap": "string"
}
```

## Model Pricing (Built-in)

| Model | Input/1K | Output/1K | Cache Read/1K | Cache Write/1K |
|-------|----------|-----------|---------------|----------------|
| claude-opus-4 | $0.015 | $0.075 | $0.0015 | $0.01875 |
| claude-sonnet-4 | $0.003 | $0.015 | $0.0003 | $0.00375 |
| claude-3.5-sonnet | $0.003 | $0.015 | $0.0003 | $0.00375 |
| claude-3.5-haiku | $0.001 | $0.005 | $0.0001 | $0.00125 |
| gpt-4o | $0.0025 | $0.010 | $0.00125 | $0.0025 |
| gpt-4o-mini | $0.00015 | $0.0006 | $0.000075 | $0.00015 |
| gemini-1.5-pro | $0.00125 | $0.005 | $0.0003125 | $0.00125 |
| gemini-1.5-flash | $0.000075 | $0.0003 | $0.00001875 | $0.000075 |
| gemini-2.0-flash | $0.000075 | $0.0003 | $0.00001875 | $0.000075 |

## Default Phase Order (Dev Loop)

```
["researcher", "planner", "tester", "coder", "reviewer"]
```

Extended with optional phases:
```
["teammate", "researcher", "planner", "tester", "coder", "sniper", "reviewer", "git"]
```

## Quality Gate Details

| Gate | Checks | Fails When |
|------|--------|------------|
| nonEmptyGate | Output length > 10 chars | Empty or trivial output |
| noHallucinationGate | No TODO/FIXME/placeholder/left as exercise | Hallucination markers detected |
| schemaValidationGate | Valid JSON + required fields present | Invalid JSON or missing required fields |
| specificityGate | File/line references present for code tasks | Long output (>200 chars) without file refs |
| completenessGate | Required arrays non-empty | Required array field is empty |

## Budget Enforcement Flow

```
1. cost.budget({ maxCostPerRun: 1.00 })  // Set budget
2. agents.runEnhanced({ budget: { maxCostPerRun: 1.00 } })  // Pass to agent
3. Before each agent: checkBeforeRun(estimatedCost)
   - If projected > maxCostPerRun → reject
   - If projected > threshold (80%) → warn
4. After agent: checkAfterAgent(agentCost)
   - If budgetStatus == "exceeded" → stop further agents
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `validationErrors` | Schema validation failed | Fix `outputSchema` or agent prompt |
| `qualityGateFailures` | Quality gate rejected output | Check specific gate; refine task |
| `Budget exceeded` | Cost limit reached | Increase budget or use cheaper model |
| `Agent unavailable` | Pi binary not found | Ensure `pi` is in PATH |
| `Timeout` | Agent exceeded timeoutMs | Increase timeout or simplify task |

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+F` | Open forgery dashboard |
| `Ctrl+Alt+E` | Focus activity widget |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PI_IMAGE_PROTOCOL` | Force image protocol: `kitty`, `iterm2`, `none`, `auto` |

## File Extensions for Dev Notes

| Agent | Extension |
|-------|-----------|
| teammate | `.md` (markdown reports) |
| devloop | Activity store + dev-notes artifacts |
| cost | Terminal output + activity store metrics |