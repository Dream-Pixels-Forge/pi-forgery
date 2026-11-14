---
name: pi-forgery-mastery-examples
description: Real-world usage examples for pi-forgery: feature development, bug fixing, refactoring, code review, security audits, design system work, and team onboarding.
---

# Pi-Forgery Mastery — Examples

Practical patterns for common development scenarios.

## 1. Feature Development: Add Rate Limiting to API

### Full Dev Loop with Budget

```typescript
const result = await devloop.run("Add rate limiting to REST API with Redis backend", {
  budget: { maxCostPerRun: 1.50, warningThreshold: 0.85 },
  maxLoopIterations: 2,
  qualityThreshold: 0.85,
  phaseOrder: ["teammate", "planner", "tester", "coder", "security", "reviewer", "git"]
});
```

### Step-by-Step (Manual Control)

```typescript
const phases = createPhaseRunners(baseRunner, activity, cwd, runId);

// 1. Research existing API patterns
const research = await phases.research("Analyze current API middleware, Redis usage, and error handling patterns");

// 2. Plan implementation
const plan = await phases.plan("Design rate limiter: sliding window, key strategies, headers, exemptions", research);

// 3. Design tests first (TDD)
const tests = await phases.test("Test: rate limit exceeded, window reset, different keys, bypass for health checks", plan, research);

// 4. Implement
const code = await phases.code("Implement rate limiter middleware with tests", plan, tests);

// 5. Security audit
const review = await phases.review(code, tests);

// 6. Learn for next time
const learning = await phases.learn([research, plan, tests, code, review]);
```

## 2. Bug Fix: Memory Leak in WebSocket Handler

### Debugger Agent Pipeline

```typescript
await agents.runPipeline({
  steps: [
    { ref: "agents.debugger", task: "Reproduce and isolate memory leak in WebSocket handler" },
    { ref: "agents.coder", task: "Fix the leak (close handlers, clear intervals, remove listeners)" },
    { ref: "agents.tester", task: "Add regression test: 1000 connections, verify no memory growth" },
    { ref: "agents.reviewer", task: "Verify fix handles edge cases: rapid connect/disconnect, malformed messages" }
  ]
});
```

### Direct Debugger Agent

```typescript
const result = await agents.debugger({
  task: "Find why WebSocket connections accumulate in memory after 1000 messages",
  outputSchema: {
    type: "object",
    properties: {
      reproductionSteps: { type: "array", items: { type: "string" } },
      rootCause: { type: "string" },
      hypothesesTested: { type: "array", items: { 
        type: "object",
        properties: { hypothesis: { type: "string" }, test: { type: "string" }, result: { type: "string", enum: ["confirmed", "rejected", "inconclusive"] } },
        required: ["hypothesis", "test", "result"]
      }},
      fix: { type: "string" },
      verification: { type: "string" },
      regressionTest: { type: "string" },
      prevention: { type: "string" }
    },
    required: ["reproductionSteps", "rootCause", "hypothesesTested", "fix", "verification", "regressionTest", "prevention"]
  }
});
```

## 3. Security Audit: OAuth2 Implementation

### Security Agent with Structured Output

```typescript
const audit = await agents.security({
  task: "Audit OAuth2 PKCE implementation for A01-A10 compliance",
  outputSchema: {
    type: "object",
    properties: {
      threatModel: { type: "object" },
      findings: { type: "array", items: { type: "object", properties: {
        file: { type: "string" },
        line: { type: "number" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
        cwe: { type: "string" },
        owasp: { type: "string" },
        issue: { type: "string" },
        impact: { type: "string" },
        poc: { type: "string" },
        fix: { type: "string" },
        references: { type: "array", items: { type: "string" } }
      }}},
      summary: { type: "string" },
      riskScore: { type: "number", minimum: 0, maximum: 10 }
    },
    required: ["findings", "summary", "riskScore"]
  }
});
```

## 4. Design System: Extract Tokens from UI Components

### Sniper Agent for Visual Analysis

```typescript
const tokens = await agents.sniper({
  task: "Extract design tokens from dashboard screenshots: colors, spacing, typography, shadows",
  outputSchema: {
    type: "object",
    properties: {
      findings: { type: "array", items: { type: "object", properties: {
        type: { type: "string", enum: ["design-token", "accessibility", "layout"] },
        severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
        bounds: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
        expected: { type: "string" },
        actual: { type: "string" },
        recommendation: { type: "string" }
      }}},
      metrics: { type: "object", properties: {
        pixelDiff: { type: "number" },
        ssim: { type: "number" },
        perceptualHash: { type: "string" },
        contrastViolations: { type: "number" },
        touchTargetViolations: { type: "number" }
      }},
      compliance: { type: "object", properties: {
        wcagLevel: { type: "string", enum: ["AA", "AAA", "fail"] },
        designSystemAdherence: { type: "number", minimum: 0, maximum: 1 }
      }},
      recommendations: { type: "array", items: { type: "string" } }
    },
    required: ["findings", "metrics", "compliance", "recommendations"]
  }
});
```

## 5. Team Onboarding: Deep Codebase Exploration

### Teammate Agent (10 Parallel Analysts)

```typescript
const onboarding = await agents.teammate({
  task: "Complete onboarding analysis for new team member: architecture, key modules, deployment, testing, security, design system"
});
// Creates dev-notes/teammate-analysis/:
// - frontend.md, backend.md, database.md, security.md, design.md
// - ui-ux.md, infra.md, api.md, testing.md, dependencies.md
// - INDEX.md (master index with cross-references)
```

### Access the Results

```bash
cat dev-notes/teammate-analysis/INDEX.md
cat dev-notes/teammate-analysis/frontend.md
cat dev-notes/teammate-analysis/security.md
```

## 6. Refactoring: Migrate to TanStack Router

### Parallel Execution

```typescript
await agents.runParallel({
  agents: [
    { ref: "agents.researcher", task: "Map all React Router v6 usages: routes, hooks, navigations" },
    { ref: "agents.planner", task: "Create migration plan: phases, breaking changes, testing strategy" },
    { ref: "agents.coder", task: "Implement TanStack Router setup with file-based routes" },
    { ref: "agents.tester", task: "Write migration tests: route matching, params, lazy loading" },
    { ref: "agents.documenter", task: "Update routing docs with new patterns" }
  ]
});
```

### Sequential Pipeline (Dependencies)

```typescript
await agents.runPipeline({
  steps: [
    { ref: "agents.researcher", task: "Analyze current routing: 47 routes, 12 lazy, 8 protected" },
    { ref: "agents.planner", task: "Phase 1: Setup + config routes. Phase 2: Migrate feature routes. Phase 3: Protected routes. Phase 4: Cleanup" },
    { ref: "agents.coder", task: "Phase 1: Install @tanstack/react-router, create route tree, configure devtools" },
    { ref: "agents.tester", task: "Test route tree generation, type safety, lazy loading" },
    { ref: "agents.coder", task: "Phase 2: Migrate public routes to file-based" },
    { ref: "agents.coder", task: "Phase 3: Migrate protected routes with loaders" },
    { ref: "agents.reviewer", task: "Full review: types, lazy loading, SSR compatibility" },
    { ref: "agents.git", task: "Create PR stack: setup → public → protected → cleanup" }
  ]
});
```

## 7. Visual Regression Testing

### Sniper in CI Pipeline

```typescript
// Compare baseline vs current
const regression = await agents.sniper({
  task: "Compare baseline.png vs current.png for visual regression, audit WCAG AA compliance",
  outputSchema: {
    type: "object",
    properties: {
      regression: { type: "object", properties: {
        baselineImage: { type: "string" },
        currentImage: { type: "string" },
        diffImage: { type: "string" },
        threshold: { type: "number" },
        passed: { type: "boolean" }
      }},
      findings: { type: "array" },
      compliance: { type: "object" }
    },
    required: ["regression", "findings", "compliance"]
  }
});

if (!regression.structuredOutput?.regression?.passed) {
  throw new Error("Visual regression detected!");
}
```

## 8. Cost-Controlled Feature Development

### With Budget Enforcement

```typescript
// Estimate first
const estimate = await cost.estimate({
  model: "claude-sonnet-4",
  template: "coder",
  taskDescription: "Add Stripe webhook handler with idempotency, retries, and monitoring",
  contextTokens: 5000
});
console.log(`Estimated: $${estimate.estimatedCost.toFixed(4)}`);

// Set budget
await cost.budget({ maxCostPerRun: 0.75, warningThreshold: 0.8 });

// Run with budget auto-enforced
const result = await agents.runEnhanced({
  task: "Add Stripe webhook handler with idempotency, retries, and monitoring",
  template: "coder",
  budget: { maxCostPerRun: 0.75, maxCostPerAgent: 0.20 },
  outputSchema: { /* coder schema */ },
  parentRunId: runId
});

// Check results
if (result.status === "failed" && result.validationErrors?.some(e => e.includes("budget"))) {
  console.log("Budget exceeded - consider cheaper model or smaller scope");
}
```

## 9. Git Workflow: Release Automation

```typescript
const release = await agents.git({
  task: "Create release v2.3.0: conventional commits changelog, tag, GitHub Release, update docs",
  outputSchema: {
    type: "object",
    properties: {
      actionsTaken: { type: "array", items: { type: "string" } },
      releases: { type: "array", items: { type: "object", properties: {
        tag: { type: "string" }, name: { type: "string" }, notes: { type: "string" }, draft: { type: "boolean" }, prerelease: { type: "boolean" }
      }}},
      docs: { type: "array", items: { type: "object" } },
      metrics: { type: "object" }
    },
    required: ["actionsTaken", "releases", "docs", "metrics"]
  }
});
```

## 10. Performance Optimization

### Cost Optimization Check

```typescript
const optimizations = await cost.optimize({ runId: "abc123" });
for (const opt of optimizations) {
  console.log(`[${opt.priority}] ${opt.type}: ${opt.description} — save ~$${opt.estimatedSavings.toFixed(4)}`);
}
// Example output:
// [1] model_switch: Switch teammate from opus-4 to sonnet-4 (80% cheaper input) — save ~$0.45
// [2] caching: Enable prompt caching for 3 high-input agents — save ~$0.12
// [3] template_change: Teammate runs 10 analysts; use researcher for focused work — save ~$0.30
```

## 11. Subgoal Decomposition: Track Multi-Step Tasks

Break a complex task into subgoals with individual status and progress, visible in the widget, footer, and dashboard.

```typescript
const runId = hctx.runId; // or your own forgery_exec run id

// 1. Decompose into subgoals
await subgoals.create({ goalId: runId, name: "research existing auth", total: 3, status: "running" });
await subgoals.create({ goalId: runId, name: "design PKCE flow", total: 4 });
await subgoals.create({ goalId: runId, name: "implement middleware", total: 6 });
await subgoals.create({ goalId: runId, name: "write tests", total: 5 });

// 2. Update as work progresses (agent reports current step)
await subgoals.update({
  subgoalId: researchSg.id,
  completed: 1,
  current: "reading RFC 7519 and OAuth2 spec",
});

// 3. Mark complete
await subgoals.finish({ subgoalId: researchSg.id, success: true });

// 4. Check status in TUI
// /forgery dashboard → activity view shows subgoals under focused run
// Footer shows: subgoals 1/4
// Widget shows subgoal rows with glyphs and progress
```

### With acceptance criteria

```typescript
await subgoals.create({
  goalId: runId,
  name: "implement PKCE middleware",
  acceptanceCriteria: [
    "Generates code_verifier and code_challenge",
    "Redirects to authorization endpoint",
    "Handles authorization code callback",
    "Validates state parameter",
    "Exchanges code for tokens",
  ],
  total: 5,
});
```

### Nested subgoals

```typescript
await subgoals.create({
  goalId: runId,
  name: "implement middleware",
  parentSubgoalId: undefined, // top-level
});

await subgoals.create({
  goalId: runId,
  name: "write route handler",
  parentSubgoalId: middlewareSg.id, // nested under middleware
});
```

## Pattern Summary

| Scenario | Recommended Approach |
|----------|---------------------|
| New feature | `devloop.run` with budget + `teammate` first |
| Bug fix | `agents.debugger` → `coder` → `tester` → `reviewer` |
| Security audit | `agents.security` with structured schema |
| Design extraction | `agents.sniper` with vision schema |
| Team onboarding | `agents.teammate` (10 analysts) |
| Refactoring | `agents.runPipeline` with dependencies |
| Parallel tasks | `agents.runParallel` |
| Visual regression | `agents.sniper` with regression schema |
| Release | `agents.git` with release schema |
| Cost control | `cost.budget` + `cost.estimate` + `cost.optimize` |
| Multi-step task tracking | `subgoals.create/update/finish` + TUI display |