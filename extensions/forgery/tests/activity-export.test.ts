/**
 * pi-forgery — activity export / import tests.
 *
 * Tests round-trip persistence of the activity snapshot to JSON.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForgeryActivityStore } from "../src/activity/store.js";

test("exportSnapshot + importSnapshot round-trip preserves runs, agents, subgoals", () => {
  const store = new ForgeryActivityStore();

  // Create a run with subgoals
  store.start("run-1", { name: "demo run", description: "a test run" });
  store.subgoal({ goalId: "run-1", name: "write tests", status: "completed", total: 3, completed: 3 });
  store.subgoal({ goalId: "run-1", name: "write code", status: "running", total: 5, completed: 2 });

  // Add an agent
  store.addAgent({
    id: "agent-1",
    name: "coder",
    task: "write code",
    status: "completed",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });

  const revisionBefore = store.revision();

  // Export
  const json = store.exportSnapshot();
  assert.ok(typeof json === "string");
  const parsed = JSON.parse(json);
  assert.ok(parsed.runs);
  assert.ok(parsed.agents);
  assert.equal(parsed.runs.length, 1);
  assert.equal(parsed.runs[0].id, "run-1");
  assert.equal(parsed.runs[0].subgoals.length, 2);
  assert.equal(parsed.agents.length, 1);

  // Clear the store
  store.reset();
  assert.equal(store.runs().length, 0);
  assert.equal(store.agents().length, 0);

  // Import
  const revisionBeforeImport = store.revision();
  store.importSnapshot(json);

  // Verify restored state
  const runs = store.runs();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, "run-1");
  assert.equal(runs[0].name, "demo run");
  assert.equal(runs[0].description, "a test run");
  assert.equal(runs[0].subgoals.length, 2);
  assert.equal(runs[0].subgoals[0].name, "write tests");
  assert.equal(runs[0].subgoals[0].status, "completed");
  assert.equal(runs[0].subgoals[1].name, "write code");
  assert.equal(runs[0].subgoals[1].status, "running");

  const agents = store.agents();
  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, "agent-1");
  assert.equal(agents[0].name, "coder");

  // Revision should have bumped
  assert.ok(store.revision() > revisionBeforeImport);
});

test("importSnapshot of malformed JSON throws", () => {
  const store = new ForgeryActivityStore();
  assert.throws(() => store.importSnapshot("{ not valid json"));
});

test("importSnapshot of wrong shape does not crash", () => {
  const store = new ForgeryActivityStore();
  // Valid JSON but missing expected fields — should not throw
  store.importSnapshot(JSON.stringify({ runs: [], agents: [] }));
  assert.equal(store.runs().length, 0);
  assert.equal(store.agents().length, 0);
});

test("exportSnapshot produces valid JSON matching ForgerySnapshot shape", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "test" });
  const json = store.exportSnapshot();
  const parsed = JSON.parse(json);
  assert.ok(typeof parsed.now === "number");
  assert.ok(Array.isArray(parsed.runs));
  assert.ok(Array.isArray(parsed.agents));
  assert.ok(parsed.activeTotals);
  assert.ok(parsed.subgoalTotals);
});
