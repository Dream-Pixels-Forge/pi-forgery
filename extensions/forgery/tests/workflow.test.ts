/**
 * pi-forgery — workflow engine tests.
 *
 * TDD: pure functions first (parseFindings / synthesizeFindings), then the
 * engine with a fake AgentRunner (no real `pi --print` subprocesses).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ForgeryActivityStore } from "../src/activity/store.js";
import {
  parseFindings,
  synthesizeFindings,
  WorkflowEngine,
  type Finding,
} from "../src/workflow/engine.js";
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

function findingsJson(findings: Finding[]): string {
  return "```json\n" + JSON.stringify(findings) + "\n```\n";
}

// ── parseFindings ───────────────────────────────────────────────────────

test("parseFindings extracts findings from a fenced json array", () => {
  const text =
    "Some prose.\n" +
    findingsJson([
      { severity: "blocker", line: 12, issue: "missing objective", rationale: "no goal" },
      { severity: "nit", issue: "typo", rationale: "fix it" },
    ]) +
    "trailing prose";
  const found = parseFindings(text);
  assert.equal(found.length, 2);
  assert.equal(found[0].severity, "blocker");
  assert.equal(found[0].line, 12);
  assert.equal(found[0].issue, "missing objective");
  assert.equal(found[1].severity, "nit");
});

test("parseFindings handles empty array and single object", () => {
  assert.equal(parseFindings(findingsJson([])).length, 0);
  const single =
    "```json\n" +
    JSON.stringify({ severity: "major", issue: "x", rationale: "y" }) +
    "\n```";
  assert.equal(parseFindings(single).length, 1);
  assert.equal(parseFindings(single)[0].severity, "major");
});

test("parseFindings drops invalid findings", () => {
  const text =
    findingsJson([
      { severity: "blocker", issue: "ok", rationale: "ok" },
      { severity: "bogus", issue: "bad sev", rationale: "x" } as unknown as Finding,
      { issue: "no sev", rationale: "x" } as unknown as Finding,
      { severity: "blocker", rationale: "x" } as unknown as Finding,
    ]) +
    "```json\nnot json at all\n```";
  const found = parseFindings(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].issue, "ok");
});

// ── synthesizeFindings ──────────────────────────────────────────────────

test("synthesizeFindings dedupes keeping highest severity", () => {
  const found = synthesizeFindings([
    { severity: "nit", line: 1, issue: "duplicate term", rationale: "a" },
    { severity: "blocker", line: 1, issue: "duplicate term", rationale: "b" },
    { severity: "major", line: 5, issue: "unique thing", rationale: "c" },
  ]);
  assert.equal(found.length, 2);
  assert.equal(found[0].severity, "blocker");
  assert.equal(found[1].severity, "major");
});

test("synthesizeFindings sorts blocker > major > nit then line", () => {
  const found = synthesizeFindings([
    { severity: "nit", line: 9, issue: "z nit", rationale: "x" },
    { severity: "blocker", line: 2, issue: "a blocker", rationale: "x" },
    { severity: "major", line: 1, issue: "m major", rationale: "x" },
    { severity: "nit", line: 3, issue: "b nit", rationale: "x" },
  ]);
  const sevs = found.map((f) => f.severity);
  assert.deepEqual(sevs, ["blocker", "major", "nit", "nit"]);
  const nits = found.filter((f) => f.severity === "nit");
  assert.equal(nits[0].line, 3);
  assert.equal(nits[1].line, 9);
});

// ── engine ──────────────────────────────────────────────────────────────

function reviewerScript(req: FakeRunReq): string {
  const t = req.task;
  const findings: Finding[] = [];
  if (t.includes("Zoom Out")) {
    findings.push({
      severity: "blocker",
      line: 3,
      issue: "speculative feature",
      rationale: "yagni",
    });
  }
  if (t.includes("Comprehension")) {
    findings.push({
      severity: "major",
      line: 7,
      issue: "undefined term",
      rationale: "define it",
    });
  }
  if (t.includes("Critic")) {
    findings.push({
      severity: "nit",
      line: 11,
      issue: "buzzword",
      rationale: "plain english",
    });
  }
  return findingsJson(findings);
}

test("engine runs all phases, records agents, writes artifacts", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript, delayMs: 10 });
  const engine = new WorkflowEngine(store, runner, process.cwd());

  const result = await engine.run("review", "docs/spec.md");
  assert.equal("error" in result, false);
  const completed = result as { status: string; phases: Array<{ findings: unknown[] }> };
  assert.equal(completed.status, "completed");
  assert.equal(completed.phases.length, 5);

  // 5 phases x reviewers (1+1+2+1+2 = 7 agents)
  assert.equal(
    (runner as unknown as { calls: FakeRunReq[] }).calls.length,
    7,
  );

  // activity store run finished successfully
  const runId = (result as { runId: string }).runId;
  const activity2 = store.get(runId);
  assert.ok(activity2);
  assert.equal(activity2.status, "completed");

  // artifacts exist on disk
  const state = engine.get(runId);
  assert.ok(state);
  for (const rep of state.reports) {
    assert.ok(existsSync(rep.artifactPath), `missing artifact ${rep.artifactPath}`);
    assert.ok(readFileSync(rep.artifactPath, "utf8").includes("Findings:"));
  }
  const consolidated = readFileSync(
    join(".pi/forgery/review", runId, "consolidated_review_report.md"),
    "utf8",
  );
  assert.ok(consolidated.includes("Traceability Matrix"));
});

test("engine stop halts phases", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript, delayMs: 30 });
  const engine = new WorkflowEngine(store, runner, process.cwd());

  const p = engine.run("review", "docs/spec.md");
  // engine.run is synchronous up to the first awaited agent; state exists now.
  const state = engine.states()[0];
  assert.ok(state);
  assert.equal(state.status, "running");

  engine.stop(state.id);

  const result = await p;
  if ("error" in result && result.error && result.error !== "stopped") {
    assert.fail("expected stopped, got error: " + result.error);
  }
  assert.equal((result as { status: string }).status, "stopped");
});

test("engine.resume continues a stopped run", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript, delayMs: 10 });
  const engine = new WorkflowEngine(store, runner, process.cwd());

  const p = engine.run("review", "docs/spec.md");
  await new Promise((res) => setTimeout(res, 0));
  const state = engine.states()[0];
  engine.stop(state.id);
  const stopped = await p;
  assert.equal((stopped as { status: string }).status, "stopped");

  const resumed = await engine.resume(state.id);
  if ("error" in resumed) {
    assert.fail("expected completed, got error: " + resumed.error);
  }
  const completed = resumed as { status: string };
  assert.equal(completed.status, "completed");
});

test("engine.resume continues a stopped run", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript, delayMs: 10 });
  const engine = new WorkflowEngine(store, runner, process.cwd());

  const p = engine.run("review", "docs/spec.md");
  await new Promise((res) => setTimeout(res, 0));
  const state = engine.states()[0];
  engine.stop(state.id);
  const stopped = await p;
  assert.equal((stopped as { status: string }).status, "stopped");

  const resumed = await engine.resume(state.id);
  if ("error" in resumed) {
    assert.fail("expected completed, got error: " + resumed.error);
  }
  const completed = resumed as { status: string };
  assert.equal(completed.status, "completed");
});

test("brainstorm pipeline is registered with 6 lens phases", () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript });
  const engine = new WorkflowEngine(store, runner, process.cwd());

  const brainstorm = engine.pipeline("brainstorm");
  assert.ok(brainstorm);
  assert.equal(brainstorm.phases.length, 6);
  const lensIds = brainstorm.phases.map((p) => p.id);
  assert.ok(lensIds.includes("design-critic"));
  assert.ok(lensIds.includes("codebase-details"));
  assert.ok(lensIds.includes("zoom-out"));
  assert.ok(lensIds.includes("comprehension"));
  assert.ok(lensIds.includes("implementation-readiness"));
  assert.ok(lensIds.includes("style"));
  // every phase targets full text and uses the brainstorm standard
  for (const phase of brainstorm.phases) {
    assert.equal(phase.targetStrategy, "full");
    assert.equal(phase.standard, "brainstorm");
    assert.equal(phase.reviewers.length, 1);
  }
});

test("brainstorm run executes all 6 lens phases and writes artifacts", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript, delayMs: 5 });
  const engine = new WorkflowEngine(store, runner, process.cwd());

  const result = await engine.run("brainstorm", "docs/concept.md");
  if ("error" in result) {
    assert.fail("brainstorm run failed: " + result.error);
  }
  const completed = result as { status: string; phases: unknown[] };
  assert.equal(completed.status, "completed");
  assert.equal(completed.phases.length, 6);

  // 6 lens agents ran
  assert.equal(
    (runner as unknown as { calls: FakeRunReq[] }).calls.length,
    6,
  );

  // every phase produced a report artifact
  const runId = (result as { runId: string }).runId;
  const state2 = engine.get(runId);
  assert.ok(state2);
  assert.equal(state2.reports.length, 6);
  for (const rep of state2.reports) {
    assert.ok(existsSync(rep.artifactPath), `missing artifact ${rep.artifactPath}`);
    assert.ok(readFileSync(rep.artifactPath, "utf8").includes("Findings:"));
  }
  const consolidated = readFileSync(
    join(".pi/forgery/review", runId, "consolidated_review_report.md"),
    "utf8",
  );
  assert.ok(consolidated.includes("Traceability Matrix"));
});

test("engine.run unknown pipeline returns error", async () => {
  const store = new ForgeryActivityStore();
  const runner = makeFakeRunner({ script: reviewerScript });
  const engine = new WorkflowEngine(store, runner, process.cwd());
  const result = await engine.run("no-such-pipeline", "docs/spec.md");
  assert.equal("error" in result, true);
  assert.equal((result as { error: string }).error, "unknown pipeline no-such-pipeline");
});
