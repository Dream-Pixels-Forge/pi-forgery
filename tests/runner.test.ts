import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, parsePiPrintJsonl } from "../src/agents/runner.js";
import type { AgentRunResult } from "../src/agents/runner.js";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { makeRegistry } from "../src/exec/tool.js";
import type { HostExecCtx } from "../src/exec/runtime.js";

const PROJECT_CWD = process.cwd();
const TEST_ROOT = mkdtempSync(join(tmpdir(), "forgery-runner-tests-"));
process.chdir(TEST_ROOT);
test.after(() => {
  process.chdir(PROJECT_CWD);
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

function usage() {
  return {
    input: 120,
    output: 18,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 138,
    cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
  };
}

function fakePi(name: string, events: unknown[]): { binary: string; argsPath: string } {
  const binary = join(TEST_ROOT, `${name}.cjs`);
  const argsPath = join(TEST_ROOT, `${name}-args.txt`);
  const source = `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(argsPath)}, process.argv.slice(2).join(" "));
for (const event of ${JSON.stringify(events)}) console.log(JSON.stringify(event));
`;
  writeFileSync(binary, source);
  chmodSync(binary, 0o755);
  return { binary, argsPath };
}

test("parser reads documented assistant message_end content and usage", () => {
  const stdout = [
    JSON.stringify({ type: "session", version: 3, id: "s1" }),
    JSON.stringify({ type: "message_end", message: { role: "user", content: "Review" } }),
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "First" }, { type: "text", text: "Second" }],
        usage: usage(),
      },
    }),
  ].join("\n");

  const parsed = parsePiPrintJsonl(stdout);
  assert.deepEqual(parsed, {
    text: "First\nSecond",
    value: undefined,
    usage: { input: 120, output: 18, cost: 0.3 },
  });
});

test("parser retains latest message_update usage and legacy structured value", () => {
  const stdout = [
    JSON.stringify({ type: "message_update", usage: usage(), assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "ignored" } }),
    JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Done" }] } }),
    JSON.stringify({ type: "result", value: { approved: true } }),
  ].join("\n");

  const parsed = parsePiPrintJsonl(stdout);
  assert.equal(parsed?.text, "Done");
  assert.deepEqual(parsed?.value, { approved: true });
  assert.deepEqual(parsed?.usage, { input: 120, output: 18, cost: 0.3 });
});

test("fake Pi CLI runs in JSON mode and returns final text and usage", async () => {
  const { binary, argsPath } = fakePi("json-success", [
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Real answer" }], usage: usage() } },
  ]);
  const runner = new AgentRunner({ piBinary: binary, maxConcurrent: 1 });

  const result = await runner.run({ task: "answer", model: "test-model", timeoutMs: 5_000 });

  assert.equal(result.status, "completed");
  assert.equal(result.text, "Real answer");
  assert.deepEqual(result.usage, { input: 120, output: 18, cost: 0.3 });
  const args = readFileSync(argsPath, "utf8");
  assert.ok(args.startsWith("--mode json "), `expected JSON mode, got: ${args}`);
  assert.ok(args.includes("--model test-model"));
});

test("exit zero without an assistant result fails instead of returning empty success", async () => {
  const { binary } = fakePi("no-result", [{ type: "agent_settled", aborted: false }]);
  const runner = new AgentRunner({ piBinary: binary, maxConcurrent: 1 });

  const result = await runner.run({ task: "answer", timeoutMs: 5_000 });

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /no assistant result/i);
});

test("agents.run preserves structured value", async () => {
  const baseResult: AgentRunResult = {
    id: "agent-1",
    status: "completed",
    text: "{\"approved\":true}",
    value: { approved: true },
    usage: { input: 1, output: 2, cost: 0.01 },
    startedAt: 1,
    finishedAt: 2,
  };
  const runner = {
    async run() { return baseResult; },
    get() { return undefined; },
  } as unknown as AgentRunner;
  const store = new ForgeryActivityStore();
  store.start("run-1");
  const registry = makeRegistry(runner, store, undefined);
  const spec = registry.get("agents.run")!;
  const ctx: HostExecCtx = { runId: "run-1", activity: store, cwd: TEST_ROOT };

  const result = await spec.execute({ task: "return JSON" }, ctx, new AbortController().signal);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    id: "agent-1",
    status: "completed",
    text: "{\"approved\":true}",
    value: { approved: true },
    usage: { input: 1, output: 2, cost: 0.01 },
  });
});
