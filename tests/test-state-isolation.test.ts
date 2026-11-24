import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForgeryActivityStore } from "../src/activity/store.js";
import type { AgentRunResult } from "../src/agents/runner.js";
import type { AgentRunner } from "../src/agents/runner.js";
import { WorkflowChain } from "../src/workflow/chain.js";
import { WorkflowEngine } from "../src/workflow/engine.js";
import { WorkflowResolver } from "../src/workflow/resolver.js";

function fakeRunner(): AgentRunner {
  return {
    async run(): Promise<AgentRunResult> {
      const now = Date.now();
      return {
        id: "agent-1",
        status: "completed",
        text: "```json\n[]\n```",
        startedAt: now,
        finishedAt: now,
      };
    },
  } as unknown as AgentRunner;
}

function tempCwd(root: string): { cwd: string; restore: () => void } {
  const previous = process.cwd();
  const cwd = join(root, "cwd");
  mkdirSync(cwd, { recursive: true });
  process.chdir(cwd);
  return { cwd, restore: () => process.chdir(previous) };
}

test("chain writes journals only to its injected directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "forgery-chain-paths-"));
  const { restore } = tempCwd(root);
  try {
    const store = new ForgeryActivityStore();
    const engine = {
      async run() {
        return {
          runId: "step-1",
          status: "completed",
          phases: [],
          consolidatedArtifact: join(root, "artifact.md"),
        };
      },
    } as unknown as WorkflowEngine;
    const journalDir = join(root, "custom-journal");
    const chain = new WorkflowChain(engine, store, journalDir);

    const result = await chain.run([{ pipeline: "review", target: "doc.md" }]);

    assert.equal(result.status, "completed");
    assert.ok(existsSync(join(journalDir, `${result.runId}.json`)), "journal must use the injected directory");
    assert.equal(existsSync(join(root, "cwd", ".pi")), false, "chain must not write under process.cwd()");
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test("engine writes state and reports only to injected directories", async () => {
  const root = mkdtempSync(join(tmpdir(), "forgery-engine-paths-"));
  const { restore } = tempCwd(root);
  try {
    const store = new ForgeryActivityStore();
    const runDir = join(root, "custom-state");
    const reportDir = join(root, "custom-reports");
    const engine = new WorkflowEngine(store, fakeRunner(), root, { runDir, reportDir });

    const result = await engine.run("review", "docs/spec.md");
    assert.equal("error" in result, false);
    if ("error" in result) return;

    assert.ok(existsSync(join(runDir, `${result.runId}.json`)), "run state must use the injected directory");
    assert.ok(
      readFileSync(join(reportDir, result.runId, "consolidated_review_report.md"), "utf8").includes("Traceability Matrix"),
      "consolidated report must use the injected directory",
    );
    assert.equal(existsSync(join(root, "cwd", ".pi")), false, "engine must not write under process.cwd()");
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolver writes reports only to its injected directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "forgery-resolver-paths-"));
  const { restore } = tempCwd(root);
  try {
    const store = new ForgeryActivityStore();
    const engine = new WorkflowEngine(store, fakeRunner(), root, {
      runDir: join(root, "state"),
      reportDir: join(root, "reports"),
    });
    const docPath = join(root, "design.md");
    writeFileSync(docPath, "line 1\n");
    const drift = await engine.run("drift-report", docPath);
    assert.equal("error" in drift, false);
    if ("error" in drift) return;

    const reportDir = join(root, "custom-resolver");
    const resolver = new WorkflowResolver(store, fakeRunner(), root, engine, reportDir);
    const result = await resolver.resolveFindings({
      runId: drift.runId,
      findings: [{ severity: "major", issue: "leave unchanged", rationale: "contested", decision: "contest" }],
    });

    assert.equal(result.error, undefined);
    assert.equal(result.reportPath, join(reportDir, drift.runId, "goldfish_review_report.md"));
    assert.ok(existsSync(result.reportPath));
    assert.equal(existsSync(join(root, "cwd", ".pi")), false, "resolver must not write under process.cwd()");
  } finally {
    restore();
    rmSync(root, { recursive: true, force: true });
  }
});
