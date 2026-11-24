/**
 * pi-forgery — Durable Run Journal tests.
 *
 * Run with: `npx tsx --test tests/journal.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, unlinkSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkflowJournal } from "../src/workflow/journal.js";
import { WorkflowChain } from "../src/workflow/chain.js";
import { WorkflowEngine } from "../src/workflow/engine.js";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { AgentRunner } from "../src/agents/runner.js";
import type { JournalEntry } from "../src/workflow/journal.js";

// Run against the production-relative layout inside an isolated temp cwd.
const PROJECT_CWD = process.cwd();
const TEST_ROOT = mkdtempSync(join(tmpdir(), "forgery-journal-tests-"));
process.chdir(TEST_ROOT);
test.after(() => {
  process.chdir(PROJECT_CWD);
  rmSync(TEST_ROOT, { recursive: true, force: true });
});
const TEST_DIR = ".pi/forgery/journal";

// ── helpers ─────────────────────────────────────────────────────────────

function makeEntry(runId: string, currentStep = 0, status: JournalEntry["status"] = "running"): JournalEntry {
  return {
    runId,
    steps: [
      {
        stepIndex: 0,
        pipeline: "bootstrap",
        target: "src/index.ts",
        status: currentStep > 0 ? "completed" : "pending",
        phases: [{ phaseId: "p1", phaseName: "Scan", findings: 3, totals: { blocker: 0, major: 1, nit: 2 } }],
        artifactPath: currentStep > 0 ? ".pi/forgery/review/run-1/01_report.md" : undefined,
      },
      {
        stepIndex: 1,
        pipeline: "drift-report",
        target: currentStep > 0 ? ".pi/forgery/review/run-1/01_report.md" : "src/index.ts",
        status: currentStep > 1 ? "completed" : "pending",
        phases: [],
      },
    ],
    currentStep,
    status,
    gate: "proceed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function cleanup() {
  try {
    mkdirSync(TEST_DIR, { recursive: true });
    const files = readdirSync(TEST_DIR).filter((f) => f.endsWith(".json"));
    for (const f of files) unlinkSync(join(TEST_DIR, f));
  } catch {
    /* dir may not exist */
  }
}

// ── tests ──────────────────────────────────────────────────────────────

test("journal: write + read round trip", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  const entry = makeEntry("run-1");
  journal.write(entry);

  const read = journal.read("run-1");
  assert.ok(read);
  assert.equal(read!.runId, "run-1");
  assert.equal(read!.steps.length, 2);
  assert.equal(read!.currentStep, 0);
  assert.equal(read!.status, "running");
});

test("journal: read returns null for missing run", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  assert.equal(journal.read("nonexistent"), null);
});

test("journal: list returns all entries", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  journal.write(makeEntry("run-1"));
  journal.write(makeEntry("run-2"));
  journal.write(makeEntry("run-3"));

  const list = journal.list();
  assert.equal(list.length, 3);
  const ids = list.map((e) => e.runId).sort();
  assert.deepEqual(ids, ["run-1", "run-2", "run-3"]);
});

test("journal: exists returns true/false correctly", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  assert.equal(journal.exists("run-1"), false);
  journal.write(makeEntry("run-1"));
  assert.equal(journal.exists("run-1"), true);
});

test("journal: write updates entry in place", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  journal.write(makeEntry("run-1", 0, "running"));

  // Mark step 0 as completed
  const updated = journal.read("run-1")!;
  updated.steps[0].status = "completed";
  updated.steps[0].artifactPath = ".pi/forgery/review/run-1/01_report.md";
  updated.currentStep = 1;
  journal.write(updated);

  const read = journal.read("run-1")!;
  assert.equal(read.steps[0].status, "completed");
  assert.ok(read.steps[0].artifactPath);
  assert.equal(read.currentStep, 1);
});

test("journal: files are valid JSON", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  journal.write(makeEntry("run-1"));

  const files = readdirSync(TEST_DIR).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 1);
  const raw = readFileSync(join(TEST_DIR, files[0]), "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.runId, "run-1");
});

test("journal: resume — completed chain returns already-complete", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  const entry = makeEntry("run-1", 2, "completed");
  journal.write(entry);

  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const engine = new WorkflowEngine(store, runner as any, "/fake/cwd");
  const chain = new WorkflowChain(engine, store);

  const result = chain.resume("run-1");
  assert.equal(result.status, "already-complete");
  assert.equal(result.completedSteps.length, 2);
  assert.equal(result.nextStep, 2);
});

test("journal: resume — not found", () => {
  cleanup();
  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const engine = new WorkflowEngine(store, runner as any, "/fake/cwd");
  const chain = new WorkflowChain(engine, store);

  const result = chain.resume("nonexistent");
  assert.equal(result.status, "not-found");
  assert.equal(result.completedSteps.length, 0);
});

test("journal: resume — resumable returns next step", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  // Step 0 completed, step 1 pending
  const entry = makeEntry("run-1", 1, "running");
  journal.write(entry);

  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const engine = new WorkflowEngine(store, runner as any, "/fake/cwd");
  const chain = new WorkflowChain(engine, store);

  const result = chain.resume("run-1");
  assert.equal(result.status, "resumable");
  assert.equal(result.completedSteps.length, 1);
  assert.equal(result.completedSteps[0].pipeline, "bootstrap");
  assert.equal(result.nextStep, 1);
  assert.equal(result.gate, "proceed");
});

test("journal: resume — idempotent on completed run", () => {
  cleanup();
  const journal = new WorkflowJournal(TEST_DIR);
  const entry = makeEntry("run-1", 2, "completed");
  journal.write(entry);

  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const engine = new WorkflowEngine(store, runner as any, "/fake/cwd");
  const chain = new WorkflowChain(engine, store);

  const r1 = chain.resume("run-1");
  const r2 = chain.resume("run-1");
  assert.equal(r1.status, "already-complete");
  assert.equal(r2.status, "already-complete");
  assert.equal(r1.completedSteps.length, r2.completedSteps.length);
});
