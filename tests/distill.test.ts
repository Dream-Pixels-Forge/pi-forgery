/**
 * pi-forgery — Activity Distill tests.
 *
 * Run with: `npx tsx --test tests/distill.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { distill } from "../src/activity/distill.js";

// ── helpers ─────────────────────────────────────────────────────────────

function makeRun(
  store: ForgeryActivityStore,
  runId: string,
  refs: string[],
  cost: number,
  startedAt: number,
  finishedAt: number,
): void {
  store.start(runId, { name: runId });
  for (let i = 0; i < refs.length; i++) {
    const callId = `c-${runId}-${i}`;
    store.beginCall(runId, callId, refs[i], {});
    store.finishCall(runId, callId, {
      success: true,
      metrics: { tokens: 100, toolCalls: 1, cost: cost / refs.length },
    });
  }
  const run = store.get(runId)!;
  run.startedAt = startedAt;
  run.finishedAt = finishedAt;
  run.status = "completed";
  run.metrics = { toolCalls: refs.length, tokens: 100 * refs.length, cost };
}

// ── tests ──────────────────────────────────────────────────────────────

test("distill: finds repeated 3-call sequences across runs", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  // Run 1: pi.grep → pi.read → agents.run
  makeRun(store, "run-1", ["pi.grep", "pi.read", "agents.run"], 0.05, base, base + 100);
  // Run 2: same pattern
  makeRun(store, "run-2", ["pi.grep", "pi.read", "agents.run"], 0.07, base + 200, base + 300);
  // Run 3: same pattern again
  makeRun(store, "run-3", ["pi.grep", "pi.read", "agents.run"], 0.03, base + 400, base + 500);

  const result = distill(store, { minOccurrences: 2 });

  assert.ok(result.length > 0);
  const target = result.find((p) => p.pattern === "pi.grep → pi.read → agents.run");
  assert.ok(target);
  assert.equal(target!.occurrences, 3);
  assert.equal(target!.suggestedName, "grep-to-agent.run-3step");
});

test("distill: ignores one-off patterns below minOccurrences", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  makeRun(store, "run-1", ["pi.grep", "pi.read", "agents.run"], 0.05, base, base + 100);
  // Only one occurrence — should be filtered out
  const result = distill(store, { minOccurrences: 2 });

  assert.equal(result.length, 0);
});

test("distill: minOccurrences=1 includes single-occurrence patterns", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  makeRun(store, "run-1", ["pi.write", "pi.read", "pi.ls"], 0.01, base, base + 100);

  const result = distill(store, { minOccurrences: 1 });

  assert.equal(result.length, 1);
  assert.equal(result[0].pattern, "pi.write → pi.read → pi.ls");
  assert.equal(result[0].occurrences, 1);
});

test("distill: sorts results by occurrences descending", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  // Pattern A: 3 occurrences
  makeRun(store, "run-1", ["pi.grep", "pi.read", "agents.run"], 0.05, base, base + 100);
  makeRun(store, "run-2", ["pi.grep", "pi.read", "agents.run"], 0.05, base + 200, base + 300);
  makeRun(store, "run-3", ["pi.grep", "pi.read", "agents.run"], 0.05, base + 400, base + 500);

  // Pattern B: 2 occurrences
  makeRun(store, "run-4", ["pi.write", "pi.edit", "pi.ls"], 0.02, base + 600, base + 700);
  makeRun(store, "run-5", ["pi.write", "pi.edit", "pi.ls"], 0.02, base + 800, base + 900);

  const result = distill(store, { minOccurrences: 2 });

  assert.equal(result.length, 2);
  assert.equal(result[0].pattern, "pi.grep → pi.read → agents.run");
  assert.equal(result[0].occurrences, 3);
  assert.equal(result[1].pattern, "pi.write → pi.edit → pi.ls");
  assert.equal(result[1].occurrences, 2);
});

test("distill: avgCost and avgDuration computed from runs", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  makeRun(store, "run-1", ["pi.grep", "pi.read", "agents.run"], 0.10, base, base + 200);
  makeRun(store, "run-2", ["pi.grep", "pi.read", "agents.run"], 0.30, base + 400, base + 800);

  const result = distill(store, { minOccurrences: 2 });

  assert.equal(result.length, 1);
  assert.equal(result[0].occurrences, 2);
  assert.ok(Math.abs(result[0].avgCost - 0.20) < 0.0001); // (0.10 + 0.30) / 2
  assert.equal(result[0].avgDuration, 300); // (200 + 400) / 2
});

test("distill: respects windowMs — old runs excluded", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();

  // Recent run (within 1 day)
  makeRun(
    store,
    "run-recent",
    ["pi.grep", "pi.read", "agents.run"],
    0.05,
    now - 1000,
    now,
  );
  // Old run (30 days ago — outside default 7-day window)
  makeRun(
    store,
    "run-old",
    ["pi.grep", "pi.read", "agents.run"],
    0.05,
    now - 30 * 24 * 60 * 60 * 1000,
    now - 30 * 24 * 60 * 60 * 1000 + 100,
  );

  // Default windowMs = 7 days → only recent run counts → 1 occurrence → filtered by minOccurrences=2
  const result = distill(store, { minOccurrences: 2 });
  assert.equal(result.length, 0);

  // With a 60-day window → both runs count → 2 occurrences
  const resultWide = distill(store, { minOccurrences: 2, windowMs: 60 * 24 * 60 * 60 * 1000 });
  assert.equal(resultWide.length, 1);
  assert.equal(resultWide[0].occurrences, 2);
});

test("distill: empty store returns empty array", () => {
  const store = new ForgeryActivityStore();
  const result = distill(store);
  assert.equal(result.length, 0);
});

test("distill: n-gram length parameter", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  // 4-call pattern repeated twice
  makeRun(store, "run-1", ["pi.grep", "pi.read", "pi.edit", "pi.write"], 0.05, base, base + 100);
  makeRun(store, "run-2", ["pi.grep", "pi.read", "pi.edit", "pi.write"], 0.05, base + 200, base + 300);

  // With n=3, we get two overlapping 3-grams per run → each appears twice
  const result3 = distill(store, { minOccurrences: 2, n: 3 });
  assert.ok(result3.length >= 1);
  assert.ok(result3.some((p) => p.pattern.includes("pi.grep → pi.read → pi.edit")));

  // With n=4, we get one 4-gram per run → appears twice
  const result4 = distill(store, { minOccurrences: 2, n: 4 });
  assert.equal(result4.length, 1);
  assert.equal(result4[0].pattern, "pi.grep → pi.read → pi.edit → pi.write");
  assert.equal(result4[0].occurrences, 2);
});

test("distill: only completed runs considered", () => {
  const store = new ForgeryActivityStore();

  const now = Date.now();
  const base = now - 1000;

  // Completed run with pattern
  makeRun(store, "run-done", ["pi.grep", "pi.read", "agents.run"], 0.05, base, base + 100);
  // Running run (not completed) with same pattern — should NOT count
  store.start("run-active", { name: "run-active" });
  store.beginCall("run-active", "c1", "pi.grep", {});
  store.beginCall("run-active", "c2", "pi.read", {});
  store.beginCall("run-active", "c3", "agents.run", {});

  const result = distill(store, { minOccurrences: 2 });
  assert.equal(result.length, 0); // only 1 completed run with the pattern
});
