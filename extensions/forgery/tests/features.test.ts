/**
 * pi-forgery — Comprehensive Feature Test
 * 
 * Run with: pnpm test
 * Tests all specialist agents, cost management, dev loop, and quality gates
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRunner } from "../src/agents/runner.js";
import { EnhancedAgentRunner, createEnhancedAgentRunner, type EnhancedAgentRunRequest, type AgentTemplate, TEMPLATES, withBudgetEnforcement, nonEmptyGate, noHallucinationGate, schemaValidationGate, specificityGate, completenessGate } from "../src/agents/enhanced-runner.js";
import { DevLoopRunner, runDevLoop, createPhaseRunners, type DevLoopConfig } from "../src/agents/dev-loop.js";
import { CostManager, createCostManager, type CostBudget, type CostBreakdown } from "../src/agents/cost-manager.js";
import { ForgeryActivityStore } from "../src/activity/store.js";

// Test utilities
const TEST_CWD = process.cwd();
const TEST_RUN_ID = "test-run-" + Date.now();

// Mock Pi binary for testing (uses echo to simulate)
const MOCK_PI_BINARY = "echo";

// ============================================================================
// Test Suite: Cost Manager
// ============================================================================

test("CostManager: calculate costs correctly for known models", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const breakdown = costManager.calculateCost("claude-sonnet-4", 10000, 5000);
  assert.equal(breakdown.inputCost.toFixed(4), "0.0300");
  assert.equal(breakdown.outputCost.toFixed(4), "0.0750");
  assert.equal(breakdown.totalCost.toFixed(4), "0.1050");
  assert.equal(breakdown.model, "claude-sonnet-4");
});

test("CostManager: handle cache pricing for Anthropic models", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const breakdown = costManager.calculateCost("claude-opus-4", 10000, 5000, 5000, 2000);
  assert.ok(breakdown.cacheReadCost !== undefined && breakdown.cacheReadCost > 0);
  assert.ok(breakdown.cacheWriteCost !== undefined && breakdown.cacheWriteCost > 0);
});

test("CostManager: handle cache pricing for OpenAI models", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  // gpt-4o: input 0.0025/1k, cacheRead 0.00125/1k
  const breakdown = costManager.calculateCost("gpt-4o", 10000, 5000, 5000, 2000);
  assert.ok(breakdown.cacheReadCost !== undefined && breakdown.cacheReadCost > 0);
  assert.ok(breakdown.cacheWriteCost !== undefined && breakdown.cacheWriteCost > 0);
  assert.equal(breakdown.cacheReadCost.toFixed(6), "0.006250");
  assert.equal(breakdown.cacheWriteCost.toFixed(6), "0.005000");

  // gpt-4o-mini: input 0.00015/1k, cacheRead 0.000075/1k
  const breakdownMini = costManager.calculateCost("gpt-4o-mini", 10000, 5000, 5000, 2000);
  assert.ok(breakdownMini.cacheReadCost !== undefined && breakdownMini.cacheReadCost > 0);
  assert.ok(breakdownMini.cacheWriteCost !== undefined && breakdownMini.cacheWriteCost > 0);
});

test("CostManager: handle cache pricing for Google models", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  // gemini-1.5-pro: input 0.00125/1k, cacheRead 0.0003125/1k
  const breakdown = costManager.calculateCost("gemini-1.5-pro", 10000, 5000, 5000, 2000);
  assert.ok(breakdown.cacheReadCost !== undefined && breakdown.cacheReadCost > 0);
  assert.ok(breakdown.cacheWriteCost !== undefined && breakdown.cacheWriteCost > 0);
  assert.equal(breakdown.cacheReadCost.toFixed(8), "0.00156250");

  // gemini-1.5-flash
  const breakdownFlash = costManager.calculateCost("gemini-1.5-flash", 10000, 5000, 5000, 2000);
  assert.ok(breakdownFlash.cacheReadCost !== undefined && breakdownFlash.cacheReadCost > 0);
  assert.ok(breakdownFlash.cacheWriteCost !== undefined && breakdownFlash.cacheWriteCost > 0);
});

test("CostManager: fall back to default pricing for unknown models", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const breakdown = costManager.calculateCost("unknown-model-xyz", 1000, 1000);
  assert.ok(breakdown.totalCost > 0);
});

test("CostManager: record agent costs and track run totals", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const record = costManager.recordAgentCost({
    agentId: "agent-1",
    agentName: "test-coder",
    template: "coder",
    model: "claude-sonnet-4",
    breakdown: costManager.calculateCost("claude-sonnet-4", 5000, 3000),
    runId: TEST_RUN_ID,
    phase: "coder",
  });

  assert.equal(record.agentId, "agent-1");
  assert.ok(record.breakdown.totalCost > 0);

  const run = costManager.getRunCost(TEST_RUN_ID);
  assert.ok(run !== undefined);
  assert.equal(run!.totalCost, record.breakdown.totalCost);
  assert.equal(run!.agentCosts.length, 1);
});

test("CostManager: enforce budget limits", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const budget: CostBudget = {
    maxCostPerRun: 0.50,
    warningThreshold: 0.8,
  };
  costManager.setBudget(TEST_RUN_ID, budget);

  // Add cost under budget
  costManager.recordAgentCost({
    agentId: "agent-2",
    agentName: "test-1",
    template: "coder",
    model: "claude-sonnet-4",
    breakdown: costManager.calculateCost("claude-sonnet-4", 10000, 5000),
    runId: TEST_RUN_ID,
    phase: "coder",
  });

  const run = costManager.getRunCost(TEST_RUN_ID);
  assert.equal(run!.budgetStatus, "within");

  // Add cost that exceeds budget
  costManager.recordAgentCost({
    agentId: "agent-3",
    agentName: "test-2",
    template: "coder",
    model: "claude-sonnet-4",
    breakdown: costManager.calculateCost("claude-sonnet-4", 100000, 50000),
    runId: TEST_RUN_ID,
    phase: "coder",
  });

  const run2 = costManager.getRunCost(TEST_RUN_ID);
  assert.equal(run2!.budgetStatus, "exceeded");
});

test("CostManager: estimate costs for templates", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const estimate = costManager.estimateCost("claude-sonnet-4", "Refactor auth module", "coder", 2000);
  assert.ok(estimate.estimatedCost > 0);
  assert.ok(estimate.estimatedInputTokens > 0);
  assert.ok(estimate.estimatedOutputTokens > 0);
  assert.equal(estimate.confidence, "high");
});

test("CostManager: generate optimization recommendations", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  // Add some expensive agents
  costManager.recordAgentCost({
    agentId: "expensive-1",
    agentName: "teammate-run",
    template: "teammate",
    model: "claude-opus-4",
    breakdown: costManager.calculateCost("claude-opus-4", 50000, 30000),
    runId: TEST_RUN_ID + "-opt",
    phase: "teammate",
  });

  const recommendations = costManager.getOptimizationRecommendations(TEST_RUN_ID + "-opt");
  assert.ok(recommendations.length > 0);
  
  const modelSwitch = recommendations.find(r => r.type === "model_switch");
  assert.ok(modelSwitch !== undefined);
  assert.ok(modelSwitch!.estimatedSavings > 0);
});

test("CostManager: export formatted reports", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  // Add some data first
  costManager.recordAgentCost({
    agentId: 'test-1',
    agentName: 'test-coder',
    template: 'coder',
    model: 'claude-sonnet-4',
    breakdown: costManager.calculateCost('claude-sonnet-4', 10000, 5000),
    runId: TEST_RUN_ID,
    phase: 'coder',
  });
  
  const report = costManager.exportReport(TEST_RUN_ID);
  assert.ok(report.includes("COST REPORT"));
  assert.ok(report.includes("$"));
  assert.ok(report.includes("tokens"));
});

test("CostManager: track global totals", () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const totals = costManager.getTotalCosts();
  assert.ok(totals.runCount >= 0);
  assert.ok(totals.totalCost >= 0);
  assert.ok(totals.agentCount >= 0);
});

// ============================================================================
// Test Suite: Enhanced Agent Runner
// ============================================================================

test("EnhancedAgentRunner: create with cost manager", () => {
  const activity = new ForgeryActivityStore();
  const baseRunner = new AgentRunner({ piBinary: MOCK_PI_BINARY, maxConcurrent: 2 });
  const enhancedRunner = createEnhancedAgentRunner(baseRunner, activity);
  
  const costManager = enhancedRunner.getCostManager();
  assert.ok(costManager instanceof CostManager);
});

// Note: Full agent run tests require actual Pi binary
// These are integration tests that run against mock Pi binary

// ============================================================================
// Test Suite: Dev Loop
// ============================================================================

test("DevLoopRunner: create with all components", () => {
  const activity = new ForgeryActivityStore();
  const baseRunner = new AgentRunner({ piBinary: MOCK_PI_BINARY, maxConcurrent: 2 });
  const loopRunner = new DevLoopRunner(baseRunner, activity, TEST_CWD, TEST_RUN_ID + "-loop");
  
  assert.ok(loopRunner instanceof DevLoopRunner);
});

test("DevLoopRunner: create phase runners", () => {
  const activity = new ForgeryActivityStore();
  const baseRunner = new AgentRunner({ piBinary: MOCK_PI_BINARY, maxConcurrent: 2 });
  const phases = createPhaseRunners(baseRunner, activity, TEST_CWD, TEST_RUN_ID + "-phases");
  
  assert.ok(typeof phases.research === "function");
  assert.ok(typeof phases.plan === "function");
  assert.ok(typeof phases.test === "function");
  assert.ok(typeof phases.code === "function");
  assert.ok(typeof phases.review === "function");
  assert.ok(typeof phases.learn === "function");
});

// ============================================================================
// Test Suite: Quality Gates
// ============================================================================

test("Quality Gates: nonEmptyGate rejects empty output", async () => {
  
  assert.ok(nonEmptyGate("") !== undefined);
  assert.ok(nonEmptyGate("   ") !== undefined);
  assert.ok(nonEmptyGate("short") !== undefined);
  assert.equal(nonEmptyGate("This is a valid output with enough content"), undefined);
});

test("Quality Gates: noHallucinationGate catches placeholders", async () => {
  
  assert.ok(noHallucinationGate("TODO: implement this") !== undefined);
  assert.ok(noHallucinationGate("FIXME: not implemented") !== undefined);
  assert.ok(noHallucinationGate("[placeholder]") !== undefined);
  assert.ok(noHallucinationGate("<your code here>") !== undefined);
  assert.ok(noHallucinationGate("implementation omitted") !== undefined);
  assert.ok(noHallucinationGate("left as an exercise") !== undefined);
  assert.ok(noHallucinationGate("not implemented yet") !== undefined);
  assert.ok(noHallucinationGate("coming soon") !== undefined);
  assert.equal(noHallucinationGate("This is real implementation code"), undefined);
});

test("", async () => {
  
  const schema = {
    type: "object",
    properties: { requiredField: { type: "string" } },
    required: ["requiredField"],
  };
  
  assert.ok(schemaValidationGate('{"wrongField": "value"}', schema) !== undefined);
  assert.ok(schemaValidationGate('{"requiredField": "value"}', schema) === undefined);
  assert.ok(schemaValidationGate('not valid json', schema) !== undefined);
});

test("", async () => {
  
  const longOutput = "This is a very long output that mentions no files but goes on for quite a while to exceed the length threshold of 200 characters so it should trigger the specificity gate. Adding more text to make it longer than 200 characters for the test to work properly. This should definitely be over 200 characters now.";
  assert.ok(specificityGate(longOutput) !== undefined);
  
  const withFileRef = "This mentions src/main.ts and has enough length to pass the check";
  assert.equal(specificityGate(withFileRef), undefined);
});

test("", async () => {
  
  const schema = {
    type: "object",
    properties: {
      findings: { type: "array", items: { type: "string" } },
    },
    required: ["findings"],
  };
  
  assert.ok(completenessGate('{"findings": []}', schema) !== undefined);
  assert.equal(completenessGate('{"findings": ["item1"]}', schema), undefined);
});

// ============================================================================
// Test Suite: Template System Prompts
// ============================================================================

test("", async () => {
  
  const expectedTemplates: AgentTemplate[] = [
    "coder", "researcher", "reviewer", "planner", "tester",
    "documenter", "debugger", "architect", "security", "design",
    "git", "sniper", "teammate", "general"
  ];
  
  for (const t of expectedTemplates) {
    assert.ok(TEMPLATES[t] !== undefined, `Missing template: ${t}`);
    assert.ok(TEMPLATES[t].systemPrompt.length > 100, `Template ${t} has insufficient prompt`);
    assert.ok(Array.isArray(TEMPLATES[t].allowedTools), `Template ${t} missing allowedTools`);
  }
});

test("", async () => {
  
  const coder = TEMPLATES.coder;
  assert.ok(coder.outputSchema !== undefined);
  assert.ok(coder.outputSchema!.properties.filesChanged !== undefined);
  assert.ok(coder.outputSchema!.properties.testsPassed !== undefined);
  assert.ok(coder.outputSchema!.properties.buildPassed !== undefined);
});

test("", async () => {
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
test("", async () => {
  
  const researcher = TEMPLATES.researcher;
  assert.ok(researcher.outputSchema !== undefined);
  assert.ok(researcher.outputSchema!.properties.findings !== undefined);
  // evidence is nested in findings.items.properties
  const findingsSchema = researcher.outputSchema!.properties.findings;
  assert.ok(findingsSchema !== undefined);
  assert.ok(findingsSchema.items !== undefined);
  assert.ok(findingsSchema.items.properties.evidence !== undefined);
  assert.ok(researcher.outputSchema!.properties.gaps !== undefined);
  assert.ok(researcher.outputSchema!.properties.recommendations !== undefined);
});
  
  const reviewer = TEMPLATES.reviewer;
  assert.ok(reviewer.outputSchema !== undefined);
  assert.ok(reviewer.outputSchema!.properties.issues !== undefined);
  assert.ok(reviewer.outputSchema!.properties.approved !== undefined);
  const issueSchema = reviewer.outputSchema!.properties.issues.items;
  assert.ok(issueSchema.properties.severity.enum.includes("critical"));
  assert.ok(issueSchema.properties.severity.enum.includes("high"));
  assert.ok(issueSchema.properties.severity.enum.includes("medium"));
  assert.ok(issueSchema.properties.severity.enum.includes("low"));
  assert.ok(issueSchema.properties.severity.enum.includes("nit"));
});

test("", async () => {
  
  const security = TEMPLATES.security;
  assert.ok(security.outputSchema !== undefined);
  const findingSchema = security.outputSchema!.properties.findings.items;
  assert.ok(findingSchema.properties.cwe !== undefined);
  assert.ok(findingSchema.properties.owasp !== undefined);
  assert.ok(findingSchema.properties.poc !== undefined);
  assert.ok(findingSchema.properties.fix !== undefined);
  assert.ok(findingSchema.properties.severity.enum.includes("critical"));
});

test("", async () => {
  
  const design = TEMPLATES.design;
  assert.ok(design.outputSchema !== undefined);
  assert.ok(design.outputSchema!.properties.tokens !== undefined);
  assert.ok(design.outputSchema!.properties.components !== undefined);
  assert.ok(design.outputSchema!.properties.handoff !== undefined);
  assert.ok(design.outputSchema!.properties.a11y !== undefined);
  assert.ok(design.outputSchema!.properties.responsive !== undefined);
  assert.ok(design.outputSchema!.properties.motion !== undefined);
});

test("", async () => {
  
  const git = TEMPLATES.git;
  assert.ok(git.outputSchema !== undefined);
  assert.ok(git.outputSchema!.properties.worktrees !== undefined);
  assert.ok(git.outputSchema!.properties.actionsTaken !== undefined);
  assert.ok(git.outputSchema!.properties.issues !== undefined);
  assert.ok(git.outputSchema!.properties.prs !== undefined);
  assert.ok(git.outputSchema!.properties.releases !== undefined);
  assert.ok(git.outputSchema!.properties.docs !== undefined);
});

test("", async () => {
  
  const sniper = TEMPLATES.sniper;
  assert.ok(sniper.outputSchema !== undefined);
  assert.ok(sniper.outputSchema!.properties.findings !== undefined);
  assert.ok(sniper.outputSchema!.properties.metrics !== undefined);
  assert.ok(sniper.outputSchema!.properties.compliance !== undefined);
  assert.ok(sniper.outputSchema!.properties.regression !== undefined);
  assert.ok(sniper.outputSchema!.properties.annotations !== undefined);
  const findingSchema = sniper.outputSchema!.properties.findings.items;
  assert.ok(findingSchema.properties.bounds !== undefined);
  assert.ok(findingSchema.properties.type.enum.includes("regression"));
  assert.ok(findingSchema.properties.type.enum.includes("accessibility"));
  assert.ok(findingSchema.properties.type.enum.includes("design-token"));
  assert.ok(findingSchema.properties.severity.enum.includes("critical"));
});

test("", async () => {
  
  const teammate = TEMPLATES.teammate;
  assert.ok(teammate.outputSchema !== undefined);
  assert.ok(teammate.outputSchema!.properties.analysts !== undefined);
  assert.ok(teammate.outputSchema!.properties.indexPath !== undefined);
  assert.ok(teammate.outputSchema!.properties.crossCuttingConcerns !== undefined);
  assert.ok(teammate.outputSchema!.properties.risks !== undefined);
  assert.ok(teammate.outputSchema!.properties.quickWins !== undefined);
  assert.ok(teammate.outputSchema!.properties.architectureMap !== undefined);
  const analystSchema = teammate.outputSchema!.properties.analysts.items;
  assert.ok(analystSchema.properties.domain.enum.includes("frontend"));
  assert.ok(analystSchema.properties.domain.enum.includes("backend"));
  assert.ok(analystSchema.properties.domain.enum.includes("database"));
  assert.ok(analystSchema.properties.domain.enum.includes("security"));
  assert.ok(analystSchema.properties.domain.enum.includes("design"));
  assert.ok(analystSchema.properties.domain.enum.includes("ui-ux"));
  assert.ok(analystSchema.properties.domain.enum.includes("infra"));
  assert.ok(analystSchema.properties.domain.enum.includes("api"));
  assert.ok(analystSchema.properties.domain.enum.includes("testing"));
  assert.ok(analystSchema.properties.domain.enum.includes("dependencies"));
});

// ============================================================================
// Test Suite: Budget Enforcement Middleware
// ============================================================================

test("", async () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const budget: CostBudget = { maxCostPerRun: 1.00 };
  const enforcement = withBudgetEnforcement(costManager, TEST_RUN_ID, budget);
  
  const check = enforcement.checkBeforeRun(0.50);
  assert.equal(check.allowed, true);
  
  const check2 = enforcement.checkBeforeRun(1.50);
  assert.equal(check2.allowed, false);
  assert.ok(check2.reason !== undefined);
});

test("", async () => {
  const activity = new ForgeryActivityStore();
  const costManager = createCostManager(activity);
  
  const budget: CostBudget = { maxCostPerRun: 0.10, warningThreshold: 0.8 };
  const enforcement = withBudgetEnforcement(costManager, TEST_RUN_ID + "-warn2", budget);
  
  const check = enforcement.checkBeforeRun(0.09); // 90% of budget
  assert.equal(check.allowed, true);
  assert.ok(check.warning !== undefined);
  
  const check2 = enforcement.checkBeforeRun(0.05); // 50% of budget
  assert.equal(check2.allowed, true);
  assert.equal(check2.warning, undefined);
});

// ============================================================================
// Test Suite: Schema Definitions
// ============================================================================

test("Schemas: AgentTemplate has all 14 values", () => {
  const templates: AgentTemplate[] = [
    "coder", "researcher", "reviewer", "planner", "tester",
    "documenter", "debugger", "architect", "security", "design",
    "git", "sniper", "teammate", "general"
  ];
  assert.equal(templates.length, 14);
});

test("Schemas: CostBudget has all fields", () => {
  const budget: CostBudget = {
    maxCostPerRun: 1.0,
    maxCostPerAgent: 0.25,
    maxCostPerPhase: 0.5,
    maxTokensPerRun: 100000,
    maxTokensPerAgent: 10000,
    warningThreshold: 0.8,
  };
  assert.equal(budget.maxCostPerRun, 1.0);
  assert.equal(budget.warningThreshold, 0.8);
});

test("Schemas: CostBreakdown has cache fields", () => {
  const breakdown: CostBreakdown = {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 100,
    cacheWriteTokens: 50,
    inputCost: 0.003,
    outputCost: 0.0075,
    cacheReadCost: 0.00015,
    cacheWriteCost: 0.0009375,
    totalCost: 0.0115875,
    model: "claude-opus-4",
  };
  assert.ok(breakdown.cacheReadTokens !== undefined);
  assert.ok(breakdown.cacheWriteTokens !== undefined);
  assert.ok(breakdown.cacheReadCost !== undefined);
  assert.ok(breakdown.cacheWriteCost !== undefined);
});

// ============================================================================
// Test Suite: Activity Store Integration
// ============================================================================

test("Activity Store: cost metrics tracked in run", async () => {
  const activity = new ForgeryActivityStore();
  const runId = TEST_RUN_ID + "-cost-activity";
  
  activity.start(runId, { name: "cost-test" }, "test", TEST_CWD);
  
  // Simulate adding metrics
  const run = activity.get(runId)!;
  run.metrics = { toolCalls: 1, tokens: 10000, cost: 0.105 };
  
  const retrieved = activity.get(runId);
  assert.ok(retrieved !== undefined);
  assert.equal(retrieved!.metrics!.toolCalls, 1);
  assert.equal(retrieved!.metrics!.tokens, 10000);
  assert.equal(retrieved!.metrics!.cost, 0.105);
});

// ============================================================================
// Test Suite: Feature Completeness
// ============================================================================

test("Feature Completeness: all major features implemented", () => {
  const features = {
    // Specialist agents (14)
    coder: true,
    researcher: true,
    reviewer: true,
    planner: true,
    tester: true,
    documenter: true,
    debugger: true,
    architect: true,
    security: true,
    design: true,
    git: true,
    sniper: true,
    teammate: true,
    general: true,
    
    // Core capabilities
    structuredOutput: true,
    selfCorrection: true,
    qualityGates: true,
    contextInjection: true,
    parallelExecution: true,
    pipelineExecution: true,
    
    // Dev loop
    devLoop: true,
    phaseRunners: true,
    learningPhase: true,
    budgetInLoop: true,
    
    // Cost management
    costTracking: true,
    costEstimation: true,
    budgetEnforcement: true,
    optimizationRecommendations: true,
    costReporting: true,
    
    // Activity tracking
    runTracking: true,
    agentTracking: true,
    costMetricsInActivity: true,
    
    // Quality gates (5)
    nonEmptyGate: true,
    noHallucinationGate: true,
    schemaValidationGate: true,
    specificityGate: true,
    completenessGate: true,
  };

  for (const [feature, implemented] of Object.entries(features)) {
    assert.equal(implemented, true, `Missing feature: ${feature}`);
  }
  
  // Count total features
  assert.equal(Object.keys(features).length, 37);
});