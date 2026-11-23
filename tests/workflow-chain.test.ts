/**
 * pi-forgery — WorkflowChain tests.
 *
 * TDD: pure functions first, then the chain with a fake AgentRunner
 * (no real `pi --print` subprocesses) and a fake WorkflowEngine.
 *
 * Run with: `npx tsx --test tests/workflow-chain.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { WorkflowChain } from "../src/workflow/chain.js";
import { WorkflowEngine } from "../src/workflow/engine.js";
import type { WorkflowResult } from "../src/workflow/types.js";
import type { AgentRunner, AgentRunResult } from "../src/agents/runner.js";

// ── fake AgentRunner (zero subprocesses) ────────────────────────────────

interface FakeRunReq {
  task: string;
  systemPrompt?: string;
  name?: string;
  cwd?: string;
  timeoutMs?: number;
  model?: string;
}

function makeFakeRunner({
  script,
  delayMs = 0,
}: {
  script: (req: FakeRunReq) => string;
  delayMs?: number;
}) {
  const calls: FakeRunReq[] = [];
  const runner = {
    calls,
    async run(req: FakeRunReq): Promise<AgentRunResult> {
      calls.push(req);
      if (delayMs) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
      const text = script(req);
      const id = "agent-" + String(calls.length);
      const t = Date.now();
      return {
        id,
        status: "completed",
        text,
        value: undefined,
        startedAt: t - 100,
        finishedAt: t,
      };
    },
    get() {
      return undefined;
    },
    stop() {
      return undefined;
    },
    listForUi() {
      return [];
    },
  } as unknown as AgentRunner;
  return runner;
}

function findingsJson(findings: { severity: string; issue: string; rationale: string }[]): string {
  return "```json\n" + JSON.stringify(findings) + "\n```\n";
}

// ── fake WorkflowEngine (delegates to fake runner) ─────────────────────

function makeFakeEngine(store: ForgeryActivityStore, runner: AgentRunner): WorkflowEngine {
  // We need to intercept engine.run to return controlled results.
  // Since WorkflowEngine is a class with private fields, we create a real
  // instance but override its behavior by patching the prototype method.
  const engine = new WorkflowEngine(store, runner as any, "/fake/cwd");

  // Patch run() to return a synthetic WorkflowResult based on pipeline id.
  const originalRun = engine.run.bind(engine);
  (engine as any).run = async (
    pipelineId: string,
    target: string,
    context: string[],
    mode: string,
  ): Promise<WorkflowResult | { error: string }> => {
    // Record the call for assertions
    (engine as any)._lastCall = { pipelineId, target, context, mode };

    // Return a synthetic completed result with a fake artifact path
    const runId = "chain-step-" + Math.random().toString(16).slice(2, 8);
    return {
      runId,
      status: "completed",
      phases: [
        {
          phaseId: `${pipelineId}-phase-1`,
          phaseName: `${pipelineId} Phase 1`,
          findings: [
            { severity: "nit", issue: "test finding", rationale: "synthetic" },
          ],
          totals: { blocker: 0, major: 0, nit: 1 },
        },
      ],
      consolidatedArtifact: `/fake/cwd/.pi/forgery/review/${runId}/consolidated_review_report.md`,
    };
  };

  return engine;
}

// ── tests ──────────────────────────────────────────────────────────────

test("workflow.chain: runs two steps sequentially, threads artifact", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({
    script: () => findingsJson([{ severity: "nit", issue: "finding", rationale: "r" }]),
  });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  const result = await chain.run([
    { pipeline: "bootstrap", target: "src/index.ts" },
    { pipeline: "drift-report" }, // no target → should thread bootstrap's artifact
  ]);

  assert.equal(result.status, "completed");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].pipeline, "bootstrap");
  assert.equal(result.steps[0].target, "src/index.ts");
  assert.ok(result.steps[0].artifactPath);
  // Step 2 should have inherited step 1's artifact as its target
  assert.equal(result.steps[1].pipeline, "drift-report");
  assert.equal(result.steps[1].target, result.steps[0].artifactPath);
  assert.ok(result.steps[1].artifactPath);
});

test("workflow.chain: gate=pause halts between steps", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({
    script: () => findingsJson([]),
  });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  // Run step 1 with gate=pause after it
  const result = await chain.run([
    { pipeline: "bootstrap", target: "src/index.ts", gate: "pause" },
    { pipeline: "drift-report" },
  ]);

  assert.equal(result.status, "paused");
  assert.equal(result.currentStep, 1);
  assert.equal(result.gate, "pause");
  assert.equal(result.steps.length, 1);

  // Now set gate to proceed and resume from step 2
  chain.setGate(result.runId, "proceed");
  const resumed = await chain.run([
    { pipeline: "drift-report", target: result.steps[0]!.artifactPath! },
  ]);

  assert.equal(resumed.status, "completed");
  assert.equal(resumed.steps.length, 1);
});

test("workflow.chain: gate=abort stops the chain", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({
    script: () => findingsJson([]),
  });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  const result = await chain.run([
    { pipeline: "bootstrap", target: "src/index.ts" },
    { pipeline: "drift-report", gate: "abort" },
  ]);

  assert.equal(result.status, "stopped");
  assert.equal(result.gate, "abort");
  assert.equal(result.steps.length, 1); // only step 1 ran
});

test("workflow.chain: empty steps returns error", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: () => "" });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  const result = await chain.run([]);

  assert.equal(result.status, "failed");
  assert.ok(result.error);
  assert.equal(result.error, "steps array required");
});

test("workflow.chain: first step without target returns error", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: () => "" });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  const result = await chain.run([
    { pipeline: "bootstrap" }, // no target, no prior artifact
  ]);

  assert.equal(result.status, "failed");
  assert.equal(result.currentStep, 0);
  assert.ok(result.error?.includes("no target"));
});

test("workflow.chain: setGate changes gate mid-chain", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({
    script: () => findingsJson([]),
  });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  // Start with gate=pause after step 1
  const result = await chain.run([
    { pipeline: "bootstrap", target: "src/index.ts", gate: "pause" },
    { pipeline: "drift-report" },
  ]);

  assert.equal(result.status, "paused");

  // Change gate to proceed
  chain.setGate(result.runId, "proceed");

  // Run step 2 manually with the same run id — it should see gate=proceed
  const resumed = await chain.run(
    [{ pipeline: "drift-report", target: result.steps[0]!.artifactPath! }],
    result.runId,
  );

  assert.equal(resumed.status, "completed");
  assert.equal(resumed.currentStep, 1);
});

test("workflow.chain: gate state stored in activity store", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: () => "" });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  const result = await chain.run([
    { pipeline: "bootstrap", target: "src/index.ts" },
    { pipeline: "drift-report", gate: "pause" },
  ]);

  assert.equal(result.status, "paused");

  // Gate state should be readable from the activity store
  const run = store.get(result.runId);
  assert.ok(run);
  const gateItem = run!.items.find((i) => i.id === "chain-gate");
  assert.ok(gateItem);
  assert.equal((gateItem!.data as any).gate, "pause");
});

test("workflow.chain: activity run is created for the chain", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: () => "" });
  const engine = makeFakeEngine(store, runner);
  const chain = new WorkflowChain(engine, store);

  const result = await chain.run([
    { pipeline: "bootstrap", target: "src/index.ts" },
  ]);

  const run = store.get(result.runId);
  assert.ok(run);
  assert.equal(run!.name, "workflow chain: 1 step(s)");
  assert.equal(run!.status, "completed");
});
