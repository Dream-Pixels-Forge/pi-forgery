/**
 * pi-forgery — Budget circuit breaker tests.
 *
 * Run with: `npx tsx --test tests/budget.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { CostManager, createCostManager } from "../src/agents/cost-manager.js";

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
