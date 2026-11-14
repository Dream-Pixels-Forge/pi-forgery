/**
 * pi-forgery — activity store tests.
 *
 * Run with: `node --test tests/store.test.ts` (TypeScript via a
 * typecheck-only runner, or compiled). We assert the store's lifecycle,
 * cascades, and bounds.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import type { ForgerySubgoalInput } from "../src/activity/types.js";

test("store: start + finish a run", () => {
  const store = new ForgeryActivityStore();
  const run = store.start("run-1", { name: "demo" });
  assert.equal(run.status, "running");
  assert.equal(run.name, "demo");

  store.finish("run-1", true);
  const finished = store.get("run-1");
  assert.equal(finished?.status, "completed");
  assert.ok(finished?.finishedAt);
});

test("store: cascade to running phases/calls on finish", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  store.phase("run-1", { name: "step 1" });
  const call = store.beginCall("run-1", "c1", "pi.read", { path: "a.ts" });
  assert.equal(call.status, "running");

  store.finish("run-1", false, "boom");
  const run = store.get("run-1")!;
  assert.equal(run.status, "failed");
  assert.equal(run.error, "boom");
  assert.equal(run.phases[0].status, "stopped");
  assert.equal(run.calls[0].status, "stopped");
});

test("store: auto-complete previous phase", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  store.phase("run-1", { name: "a" });
  const second = store.phase("run-1", { name: "b" });
  const run = store.get("run-1")!;
  assert.equal(run.phases[0].status, "completed");
  assert.equal(run.phases[1].status, "running");
  assert.equal(run.currentPhaseId, second.id);
});

test("store: revision bumps on every mutation", () => {
  const store = new ForgeryActivityStore();
  const r0 = store.revision();
  store.start("run-1");
  assert.ok(store.revision() > r0);
  store.finish("run-1", true);
  assert.ok(store.revision() > r0 + 1);
});

test("store: subscribe + unsubscribe", () => {
  const store = new ForgeryActivityStore();
  let ticks = 0;
  const unsub = store.subscribe(() => {
    ticks += 1;
  });
  store.start("run-1");
  assert.equal(ticks, 1);
  unsub();
  store.start("run-2");
  assert.equal(ticks, 1, "no longer subscribed");
});

test("store: snapshot includes active totals", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  store.beginCall("run-1", "c1", "agents.run", { task: "x" });
  store.updateCall("run-1", "c1", { type: "metrics", metrics: { tokens: 1234, toolCalls: 1, cost: 0.42 } });
  const snap = store.snapshot();
  assert.equal(snap.activeRunId, "run-1");
  assert.equal(snap.activeTotals?.calls, 1);
  assert.equal(snap.activeTotals?.tokens, 1234);
  assert.equal(snap.activeTotals?.cost, 0.42);
});

test("store: run bounds evict oldest", () => {
  const store = new ForgeryActivityStore();
  for (let i = 0; i < 30; i++) store.start(`run-${i}`);
  // MAX_RUNS is 24, so the first 6 should be evicted.
  assert.equal(store.get("run-0"), undefined);
  assert.ok(store.get("run-29"));
  assert.ok(store.get("run-6"));
});

test("store: agent add + update + agents() order", () => {
  const store = new ForgeryActivityStore();
  const a = {
    id: "a1",
    name: "agent",
    task: "t",
    status: "queued" as const,
    startedAt: 0,
    updatedAt: 0,
  };
  store.addAgent(a);
  store.updateAgent("a1", { status: "running" as const });
  assert.equal(store.agents()[0].status, "running");
  assert.equal(store.agents().length, 1);
});

test("store: updateAgent with an unchanged patch does not bump the revision", () => {
  const store = new ForgeryActivityStore();
  const agent = {
    id: "a1",
    name: "agent",
    task: "t",
    status: "queued" as const,
    startedAt: 0,
    updatedAt: 0,
  };
  store.addAgent(agent);
  const before = store.revision();
  // The UI re-syncs agents on every refresh; a no-op write must stay silent
  // or the refresh loop spins forever.
  store.updateAgent("a1", { ...agent });
  assert.equal(store.revision(), before);
});

test("store: updateAgent with a changed field bumps the revision", () => {
  const store = new ForgeryActivityStore();
  store.addAgent({
    id: "a1",
    name: "agent",
    task: "t",
    status: "queued" as const,
    startedAt: 0,
    updatedAt: 0,
  });
  const before = store.revision();
  store.updateAgent("a1", { status: "running" as const });
  assert.equal(store.revision(), before + 1);
  assert.equal(store.agents()[0].status, "running");
});

test("store: the snapshot clock is live without a store mutation", async () => {
  const store = new ForgeryActivityStore();
  const first = store.snapshot().now;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = store.snapshot().now;
  assert.ok(second > first, `expected a live clock, got ${first} then ${second}`);
});

test("store: compact increments the run's compacts counter", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const run = store.get("run-1")!;
  assert.equal(run.compacts, 0);

  const count1 = store.compact("run-1");
  assert.equal(count1, 1);
  assert.equal(store.get("run-1")!.compacts, 1);

  const count2 = store.compact("run-1");
  assert.equal(count2, 2);
  assert.equal(store.get("run-1")!.compacts, 2);

  // Compact on an unknown run returns 0 and does not throw.
  assert.equal(store.compact("unknown"), 0);
});

test("store: compact bumps the revision", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  const before = store.revision();
  store.compact("run-1");
  assert.ok(store.revision() > before);
});

test("store: subgoal create + update + finish", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });

  const sg = store.subgoal({
    goalId: "run-1",
    name: "add auth",
    status: "running",
    total: 5,
    completed: 1,
  });
  assert.equal(sg.name, "add auth");
  assert.equal(sg.status, "running");
  assert.equal(sg.total, 5);
  assert.equal(sg.completed, 1);
  assert.ok(sg.id);
  assert.ok(sg.startedAt);

  // Update progress.
  const updated = store.updateSubgoal(sg.id, { completed: 3, current: "writing tests" });
  assert.ok(updated);
  assert.equal(updated!.completed, 3);
  assert.equal(updated!.current, "writing tests");

  // Finish.
  const finished = store.finishSubgoal(sg.id, true);
  assert.ok(finished);
  assert.equal(finished!.status, "completed");
  assert.ok(finished!.finishedAt);
});

test("store: subgoals appear in run.subgoals and snapshot", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");

  store.subgoal({ goalId: "run-1", name: "research" });
  store.subgoal({ goalId: "run-1", name: "implement" });
  store.subgoal({ goalId: "run-1", name: "review" });

  const run = store.get("run-1")!;
  assert.equal(run.subgoals.length, 3);

  const snap = store.snapshot();
  assert.equal(snap.subgoalTotals?.total, 3);
  assert.equal(snap.subgoalTotals?.completed, 0);

  store.finishSubgoal(run.subgoals[0].id, true);
  const snap2 = store.snapshot();
  assert.equal(snap2.subgoalTotals!.completed, 1);
  assert.equal(snap2.subgoalTotals!.total, 3);
});

test("store: subgoalsForGoal filters by goal id", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  store.start("run-2");

  store.subgoal({ goalId: "run-1", name: "sg-a" });
  store.subgoal({ goalId: "run-2", name: "sg-b" });

  assert.equal(store.subgoalsForGoal("run-1").length, 1);
  assert.equal(store.subgoalsForGoal("run-1")[0].name, "sg-a");
  assert.equal(store.subgoalsForGoal("run-2").length, 1);
  assert.equal(store.subgoalsForGoal("run-2")[0].name, "sg-b");
  assert.equal(store.subgoalsForGoal("unknown").length, 0);
});

test("store: subgoal by id lookup", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  const sg = store.subgoal({ goalId: "run-1", name: "lookup me" });
  const found = store.subgoalById(sg.id);
  assert.ok(found);
  assert.equal(found!.name, "lookup me");
  assert.equal(store.subgoalById("nope"), undefined);
});

test("store: subgoal finish cascades error", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  const sg = store.subgoal({ goalId: "run-1", name: "failing" });
  const finished = store.finishSubgoal(sg.id, false, "boom");
  assert.ok(finished);
  assert.equal(finished!.status, "failed");
  assert.equal(finished!.error, "boom");
});

test("store: subgoal revision bumps on mutation", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1");
  const before = store.revision();
  store.subgoal({ goalId: "run-1", name: "sg" });
  assert.ok(store.revision() > before);
  const sgId = store.subgoalsForGoal("run-1")[0].id;
  store.updateSubgoal(sgId, { status: "running" });
  assert.ok(store.revision() > before + 1);
});
