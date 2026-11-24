/**
 * pi-forgery — Budget circuit breaker tests.
 *
 * Run with: `npx tsx --test tests/budget.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { CostManager, createCostManager } from "../src/agents/cost-manager.js";
import type { AgentRunner, AgentRunResult } from "../src/agents/runner.js";
import { createEnhancedAgentRunner } from "../src/agents/enhanced-runner.js";
import { DevLoopRunner } from "../src/agents/dev-loop.js";
import { createForgeryExecTool } from "../src/exec/tool.js";

// ── helpers ─────────────────────────────────────────────────────────────

function makeRunWithCost(
  store: ForgeryActivityStore,
  costManager: CostManager,
  runId: string,
  cost: number,
): void {
  store.start(runId, { name: runId });
  const run = store.get(runId)!;
  run.status = "running";
  run.metrics = { toolCalls: 1, tokens: 100, cost };
  // Record the cost in the cost manager too
  costManager.recordAgentCost({
    agentId: `agent-${runId}`,
    agentName: `agent-${runId}`,
    template: "general",
    model: "claude-haiku",
    breakdown: {
      inputTokens: 50,
      outputTokens: 50,
      inputCost: cost / 2,
      outputCost: cost / 2,
      totalCost: cost,
      model: "claude-haiku",
    },
    runId,
  });
}

// ── CostManager.budgetStatus tests ─────────────────────────────────────

test("budgetStatus: no budget → all false", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.05);

  const bs = costManager.budgetStatus("run-1");
  assert.equal(bs.pctUsed, 0);
  assert.equal(bs.overSoft, false);
  assert.equal(bs.overHard, false);
});

test("budgetStatus: within budget", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.05);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.8 });

  const bs = costManager.budgetStatus("run-1");
  assert.equal(bs.pctUsed, 50);
  assert.equal(bs.overSoft, false);
  assert.equal(bs.overHard, false);
});

test("budgetStatus: over soft (80%) but not hard", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.085);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.8 });

  const bs = costManager.budgetStatus("run-1");
  assert.equal(bs.pctUsed, 85);
  assert.equal(bs.overSoft, true);
  assert.equal(bs.overHard, false);
});

test("budgetStatus: over hard (100%)", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.10);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.8 });

  const bs = costManager.budgetStatus("run-1");
  assert.equal(bs.pctUsed, 100);
  assert.equal(bs.overSoft, true);
  assert.equal(bs.overHard, true);
});

test("budgetStatus: over hard (>100%)", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.15);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.8 });

  const bs = costManager.budgetStatus("run-1");
  assert.ok(Math.abs(bs.pctUsed - 150) < 0.001);
  assert.equal(bs.overSoft, true);
  assert.equal(bs.overHard, true);
});

test("budgetStatus: custom warning threshold", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.06);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.5 });

  const bs = costManager.budgetStatus("run-1");
  assert.equal(bs.pctUsed, 60);
  assert.equal(bs.overSoft, true); // 60% >= 50% threshold
  assert.equal(bs.overHard, false);
});

// ── Controller integration tests ───────────────────────────────────────

test("controller: #checkBudgets hard-stops run at 100%", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.10);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.8 });

  // Simulate what the controller does
  const snap = store.snapshot();
  for (const run of snap.runs) {
    if (run.status !== "running") continue;
    const bs = costManager.budgetStatus(run.id);
    if (bs && bs.overHard) {
      store.finish(run.id, false, "budget exceeded");
      store.event(run.id, {
        message: "budget exceeded — run stopped",
        level: "error",
        data: { kind: "budget-exceeded", runId: run.id },
      });
    }
  }

  const run = store.get("run-1")!;
  assert.equal(run.status, "failed");
  assert.equal(run.error, "budget exceeded");

  const events = run.events.filter((e) => e.data?.kind === "budget-exceeded");
  assert.equal(events.length, 1);
  assert.equal(events[0].level, "error");
});

test("controller: #checkBudgets warns at 80% but does not stop", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.085);
  costManager.setBudget("run-1", { maxCostPerRun: 0.10, warningThreshold: 0.8 });

  const snap = store.snapshot();
  let warned = false;
  let stopped = false;
  for (const run of snap.runs) {
    if (run.status !== "running") continue;
    const bs = costManager.budgetStatus(run.id);
    if (bs && bs.overHard) {
      stopped = true;
      store.finish(run.id, false, "budget exceeded");
    }
    if (bs && bs.overSoft) {
      warned = true;
      store.event(run.id, {
        message: "budget warning: 85% of max cost used",
        level: "warning",
        data: { kind: "budget-warning", runId: run.id, pctUsed: 85 },
      });
    }
  }

  assert.equal(warned, true);
  assert.equal(stopped, false);
  const run = store.get("run-1")!;
  assert.equal(run.status, "running"); // still running
  const warnings = run.events.filter((e) => e.data?.kind === "budget-warning");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].level, "warning");
});

test("controller: no budget set → no warning, no stop", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  makeRunWithCost(store, costManager, "run-1", 0.50); // way over any reasonable budget
  // No budget set

  const snap = store.snapshot();
  let warned = false;
  let stopped = false;
  for (const run of snap.runs) {
    if (run.status !== "running") continue;
    const bs = costManager.budgetStatus(run.id);
    if (bs && bs.overHard) {
      stopped = true;
      store.finish(run.id, false, "budget exceeded");
    }
    if (bs && bs.overSoft) {
      warned = true;
    }
  }

  assert.equal(warned, false);
  assert.equal(stopped, false);
  const run = store.get("run-1")!;
  assert.equal(run.status, "running");
});

test("budgetStatus: unknown run → zeros", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);

  const bs = costManager.budgetStatus("nonexistent");
  assert.equal(bs.pctUsed, 0);
  assert.equal(bs.overSoft, false);
  assert.equal(bs.overHard, false);
});

test("calculateCost uses provider-reported total when present", () => {
  const manager = createCostManager();
  const breakdown = manager.calculateCost("default", 1_000, 1_000, 0, 0, 0.001);
  assert.equal(breakdown.totalCost, 0.001);
});

test("hard-budget callback fires when recorded costs cross the limit", () => {
  const store = new ForgeryActivityStore();
  const manager = createCostManager(store);
  store.start("run-1");
  manager.setBudget("run-1", { maxCostPerRun: 0.10 });
  let calls = 0;
  manager.onBudgetExceeded("run-1", () => { calls += 1; });

  manager.recordAgentCost({
    agentId: "agent-1",
    agentName: "expensive",
    model: "default",
    breakdown: {
      inputTokens: 1,
      outputTokens: 1,
      inputCost: 0,
      outputCost: 0.20,
      totalCost: 0.20,
      model: "default",
    },
    runId: "run-1",
  });

  assert.equal(calls, 1);
  assert.equal(manager.budgetStatus("run-1").overHard, true);
});

test("shared cost manager is injected into enhanced and dev-loop runners", () => {
  const store = new ForgeryActivityStore();
  const manager = createCostManager(store);
  const runner = {} as AgentRunner;
  const enhanced = createEnhancedAgentRunner(runner, store, manager);
  assert.equal(enhanced.getCostManager(), manager);

  const loop = new DevLoopRunner(runner, store, ".", "run-1", manager);
  assert.equal((loop as any).enhancedRunner.getCostManager(), manager);
});

test("forgery_exec aborts at hard budget and prevents the next spawn", async () => {
  const store = new ForgeryActivityStore();
  const manager = createCostManager(store);
  let spawnCount = 0;
  const runner = {
    async run(): Promise<AgentRunResult> {
      spawnCount += 1;
      return {
        id: `agent-${spawnCount}`,
        status: "completed",
        text: "done",
        usage: { input: 10, output: 5, cost: 0.20 },
        startedAt: 1,
        finishedAt: 2,
      };
    },
    get() { return undefined; },
  } as unknown as AgentRunner;
  const tool = createForgeryExecTool(store, runner, manager);
  const code = `
    await cost.budget({ maxCostPerRun: 0.10 });
    await agents.run({ task: "first expensive agent" });
    await agents.run({ task: "must not spawn" });
    return "unexpected success";
  `;

  const result = await tool.execute(
    "call-budget",
    { code },
    new AbortController().signal,
    undefined,
    { cwd: ".", ui: { setStatus() {} } } as any,
  );

  assert.equal(result.details?.ok, false);
  assert.match(result.details?.error ?? "", /budget exceeded/i);
  assert.equal(spawnCount, 1);
  assert.equal(manager.getRunCost("call-budget")?.totalCost, 0.20);
});
