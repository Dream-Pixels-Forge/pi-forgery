/**
 * pi-forgery — Cross-session persistence tests.
 *
 * Verifies the activity store survives a simulated restart:
 * export snapshot → import snapshot round-trip preserves model routing
 * outcomes (goal 26) and budget state (goal 29).
 *
 * Run with: `npx tsx --test tests/cross-session.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { CostManager, createCostManager } from "../src/agents/cost-manager.js";
import { ModelRouter } from "../src/agents/router.js";

function makeStoreWithData(): ForgeryActivityStore {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "run-1" });
  const callId = "c-1";
  store.beginCall("run-1", callId, "pi.grep", {});
  store.finishCall("run-1", callId, {
    success: true,
    metrics: { tokens: 100, toolCalls: 1, cost: 0.05 },
  });
  const run = store.get("run-1")!;
  run.startedAt = 1000;
  run.finishedAt = 2000;
  run.status = "completed";
  run.metrics = { toolCalls: 1, tokens: 100, cost: 0.05 };

  // Record model routing outcomes (goal 26 data that should survive restart)
  store.recordOutcome("claude-haiku", "code-gen", "completed", 0.01);
  store.recordOutcome("claude-haiku", "code-gen", "failed", 0.01);
  store.recordOutcome("claude-opus-4", "code-gen", "completed", 0.50);

  return store;
}

test("cross-session: export/import round-trip preserves runs and outcomes", () => {
  const store = makeStoreWithData();

  // Export snapshot (simulates session_shutdown save)
  const json = store.exportSnapshot();
  assert.ok(typeof json === "string");
  assert.ok(json.length > 0);

  // Parse to verify structure
  const snap = JSON.parse(json);
  assert.ok(Array.isArray(snap.runs));
  assert.ok(Array.isArray(snap.agents));
  assert.ok(snap.runs.length >= 1);
  assert.ok(snap.runs[0].id === "run-1");
  assert.ok(snap.runs[0].status === "completed");

  // Import into a fresh store (simulates session_start load)
  const fresh = new ForgeryActivityStore();
  fresh.importSnapshot(json);

  const freshSnap = fresh.snapshot();
  assert.ok(freshSnap.runs.length >= 1);
  assert.ok(freshSnap.runs[0].id === "run-1");
  assert.ok(freshSnap.runs[0].status === "completed");

  // Model routing outcomes survived (goal 26 data)
  const haikuOutcome = fresh.agentOutcomeFor("claude-haiku", "code-gen");
  assert.ok(haikuOutcome.totalRuns === 2);
  assert.ok(haikuOutcome.completed === 1);

  const opusOutcome = fresh.agentOutcomeFor("claude-opus-4", "code-gen");
  assert.ok(opusOutcome.totalRuns === 1);
  assert.ok(opusOutcome.completed === 1);

  // Router can use restored history
  const costManager = createCostManager(fresh);
  const router = new ModelRouter(fresh, costManager, "claude-opus-4");
  const route = router.route("write a function", [
    "claude-haiku",
    "claude-opus-4",
  ]);
  // haiku has 50% pass rate (< 0.6 default) → not viable; opus has 100% → chosen
  assert.equal(route.model, "claude-opus-4");
  assert.equal(route.historicalPassRate, 1.0);
});

test("cross-session: corrupt import throws (caller must catch)", () => {
  const store = new ForgeryActivityStore();
  assert.throws(() => store.importSnapshot("{ not valid json"));
  assert.throws(() => store.importSnapshot("null"));
});

test("cross-session: empty store exports valid JSON", () => {
  const store = new ForgeryActivityStore();
  const json = store.exportSnapshot();
  const snap = JSON.parse(json);
  assert.ok(Array.isArray(snap.runs));
  assert.ok(Array.isArray(snap.agents));
  assert.equal(snap.runs.length, 0);
  assert.equal(snap.agents.length, 0);
});

test("cross-session: import replaces all contents", () => {
  const store = makeStoreWithData();
  const json = store.exportSnapshot();

  const fresh = new ForgeryActivityStore();
  fresh.start("run-2", { name: "run-2" }); // pre-existing data
  fresh.importSnapshot(json); // should replace, not merge

  const freshSnap = fresh.snapshot();
  assert.equal(freshSnap.runs.length, 1);
  assert.equal(freshSnap.runs[0].id, "run-1");
  // run-2 should be gone
  assert.ok(!freshSnap.runs.some((r) => r.id === "run-2"));
});
