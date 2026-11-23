/**
 * pi-forgery — ModelRouter tests.
 *
 * Run with: `npx tsx --test tests/router.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { CostManager, createCostManager } from "../src/agents/cost-manager.js";
import { ModelRouter, classifyTask } from "../src/agents/router.js";

test("router: classifyTask", () => {
  assert.equal(classifyTask("plan the architecture"), "planning");
  assert.equal(classifyTask("write a function"), "code-gen");
  // "review the code" matches code-gen first (code keyword) — order matters
  assert.equal(classifyTask("review the code"), "code-gen");
  assert.equal(classifyTask("review this document"), "review");
  assert.equal(classifyTask("audit the security setup"), "review");
  assert.equal(classifyTask("summarize the document"), "summarization");
  assert.equal(classifyTask("research the topic"), "research");
  assert.equal(classifyTask("fix the bug"), "debug");
  assert.equal(classifyTask("do something unknown"), "general");
});

test("router: cold start returns default candidate", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  const router = new ModelRouter(store, costManager, "claude-haiku");

  const result = router.route("write a hello world script");
  assert.equal(result.model, "claude-haiku");
  assert.equal(result.historicalPassRate, 0.5); // cold start assumption
  assert.ok(result.reason.includes("Cold start"));
});

test("router: respects candidates list", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  const router = new ModelRouter(store, costManager, "claude-opus-4");

  const result = router.route("write a script", ["claude-haiku", "claude-sonnet-4"]);
  assert.ok(["claude-haiku", "claude-sonnet-4"].includes(result.model));
});

test("router: picks cheapest viable model on cold start", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  // haiku is cheapest in DEFAULT_MODEL_PRICING
  const router = new ModelRouter(store, costManager, "claude-opus-4");

  const result = router.route("write a function", [
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-haiku",
  ]);
  assert.equal(result.model, "claude-haiku");
  assert.ok(result.expectedCost >= 0);
});

test("router: read-your-writes — recorded outcomes influence subsequent routes", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  const router = new ModelRouter(store, costManager, "claude-opus-4");

  // Route with no history → cheapest candidate
  let result = router.route("write a function", ["claude-opus-4", "claude-haiku"]);
  assert.equal(result.model, "claude-haiku");

  // Record haiku failing repeatedly on code-gen
  for (let i = 0; i < 5; i++) {
    store.recordOutcome("claude-haiku", "code-gen", "failed", 0.01);
  }
  // Record opus completing successfully on code-gen
  for (let i = 0; i < 5; i++) {
    store.recordOutcome("claude-opus-4", "code-gen", "completed", 0.50);
  }

  // Now route again — haiku has 0% pass rate (not viable), opus has 100% (viable)
  // Only opus is viable, so it's chosen despite higher cost
  result = router.route("write a function", ["claude-opus-4", "claude-haiku"]);
  assert.equal(result.model, "claude-opus-4");
  assert.equal(result.historicalPassRate, 1.0);
});

test("router: minPassRate threshold", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  const router = new ModelRouter(store, costManager, "claude-haiku");

  // Record haiku at 50% pass rate (below default 0.6)
  store.recordOutcome("claude-haiku", "review", "completed", 0.01);
  store.recordOutcome("claude-haiku", "review", "failed", 0.01);

  // With default minPassRate=0.6, haiku is not viable → fallback to cheapest overall
  let result = router.route("review this code", ["claude-haiku", "claude-opus-4"]);
  // viable = [] (haiku 50% < 60%), pool = all = [haiku, opus], cheapest = haiku
  assert.equal(result.model, "claude-haiku");

  // With minPassRate=0.4, haiku IS viable → should pick haiku
  result = router.route("review this code", ["claude-haiku", "claude-opus-4"], 0.4);
  assert.equal(result.model, "claude-haiku");
  assert.equal(result.historicalPassRate, 0.5);
});

test("router: expectedCost uses avgCostPerRun when history exists", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  const router = new ModelRouter(store, costManager, "claude-haiku");

  // Record known costs
  store.recordOutcome("claude-haiku", "code-gen", "completed", 0.10);
  store.recordOutcome("claude-haiku", "code-gen", "completed", 0.20);

  const result = router.route("write a function", ["claude-haiku"]);
  assert.ok(Math.abs(result.expectedCost - 0.15) < 0.0001); // average of 0.10 and 0.20
});

test("router: result schema fields", () => {
  const store = new ForgeryActivityStore();
  const costManager = createCostManager(store);
  const router = new ModelRouter(store, costManager, "claude-haiku");

  const result = router.route("write a test", ["claude-haiku"]);
  assert.ok(typeof result.model === "string");
  assert.ok(typeof result.reason === "string");
  assert.ok(typeof result.expectedCost === "number");
  assert.ok(typeof result.historicalPassRate === "number");
  assert.ok(result.historicalPassRate >= 0 && result.historicalPassRate <= 1);
});
