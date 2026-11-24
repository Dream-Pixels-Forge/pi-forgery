/**
 * pi-forgery — SG-29 Interactive Agent Controls tests.
 *
 * Covers: AgentRunner.retry, dashboard `s`=stop, `r`=retry, `/`=filter.
 *
 * Run with: `npx tsx --test tests/sg29-interactive-controls.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRunner } from "../src/agents/runner.js";
import type { AgentRunRequest } from "../src/agents/runner.js";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { ForgeryDashboard } from "../src/ui/dashboard.js";

// ── stubs ─────────────────────────────────────────────────────────────

function stubTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}`,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => `**${text}**`,
  } as unknown as import("@earendil-works/pi-coding-agent").Theme;
}

function stubTui() {
  return { requestRender: () => {} } as never;
}

function stubKeybindings() {
  return {} as never;
}

function makeDashboard(opts: {
  runner: AgentRunner;
  snapshot: () => import("../src/activity/store.js").ForgerySnapshot;
}): ForgeryDashboard {
  return new ForgeryDashboard(
    stubTui(),
    stubTheme(),
    stubKeybindings(),
    {
      snapshot: opts.snapshot,
      done: () => {},
      hostCalls: [],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
      runner: opts.runner,
    },
  );
}

// ── AgentRunner.retry ───────────────────────────────────────────────

test("runner.retry: re-spawns a failed agent with original params", async () => {
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });

  const agentId = "agent-failed-1";
  ;(runner as any).agents.set(agentId, {
    id: agentId,
    name: "failing-agent",
    task: "do something",
    status: "failed",
    runId: "run-1",
    cwd: "/tmp/proj",
    model: "claude-haiku",
    systemPrompt: "be helpful",
    timeoutMs: 30_000,
    startedAt: Date.now() - 1000,
    updatedAt: Date.now(),
    finishedAt: Date.now(),
  });

  let spawnCount = 0;
  ;(runner as any).run = async (req: AgentRunRequest) => {
    spawnCount += 1;
    const id = "agent-retry-" + spawnCount;
    const result = {
      id,
      status: "completed" as const,
      text: "retry done",
      usage: { input: 1, output: 1, cost: 0.001 },
      startedAt: Date.now(),
      finishedAt: Date.now(),
    };
    ;(runner as any).agents.set(id, {
      id,
      name: req.name ?? "agent",
      task: req.task,
      status: "completed",
      runId: req.runId,
      cwd: req.cwd,
      model: req.model,
      systemPrompt: req.systemPrompt,
      timeoutMs: req.timeoutMs,
      startedAt: result.startedAt,
      updatedAt: result.finishedAt,
      finishedAt: result.finishedAt,
    });
    return result;
  };

  const result = await runner.retry(agentId);

  assert.equal(spawnCount, 1, "retry should spawn once");
  assert.equal(result.status, "completed");
  assert.equal(result.text, "retry done");
  // Verify the retry used the original run params (runId threaded through).
  const retried = runner.get(`agent-retry-1`);
  assert.equal(retried?.runId, "run-1");
  assert.equal(retried?.model, "claude-haiku");
  assert.equal(retried?.cwd, "/tmp/proj");
});

test("runner.retry: returns undefined for unknown agent id", async () => {
  const runner = new AgentRunner({ piBinary: "pi" });
  const result = await runner.retry("does-not-exist");
  assert.equal(result, undefined);
});

test("runner.retry: does not retry a running agent", async () => {
  const runner = new AgentRunner({ piBinary: "pi" });
  const agentId = "agent-running";
  ;(runner as any).agents.set(agentId, {
    id: agentId,
    name: "running-agent",
    task: "running",
    status: "running",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  const result = await runner.retry(agentId);
  assert.equal(result, undefined, "running agent cannot be retried");
});

// ── Dashboard: stop via `s` ─────────────────────────────────────────

test("dashboard: `s` stops the focused running agent", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "run-1", cwd: "/tmp/proj" });

  // Mock runner that records stop() calls.
  let stoppedId: string | undefined;
  const runner = {
    stop: (id: string) => { stoppedId = id; return { id, status: "stopped" } as any; },
    get: (id: string) => undefined,
    piBinary: "pi",
    concurrency: 1,
  } as unknown as AgentRunner;

  // Plant an agent in the store so the dashboard can focus it.
  store.addAgent({
    id: "agent-active",
    name: "active-agent",
    task: "do work",
    status: "running",
    runId: "run-1",
    cwd: "/tmp/proj",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  } as any);

  const snap = () => store.snapshot();
  const dash = makeDashboard({ runner, snapshot: snap });

  ;(dash as any).entityIndex = 0; // focus the only agent

  // Press 's' to stop.
  dash.handleInput("s");

  assert.equal(stoppedId, "agent-active", "stop called on focused agent");
});

// ── Dashboard: filter via `/` ───────────────────────────────────────

test("dashboard: `/` enters filter mode", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "run-1", cwd: "/tmp/proj" });
  const snap = () => store.snapshot();
  const dash = makeDashboard({
    runner: new AgentRunner({ piBinary: "pi" }),
    snapshot: snap,
  });

  dash.handleInput("/");
  assert.equal((dash as any).filtering, true, "filtering mode on");
  assert.equal((dash as any).filterText, "", "filter text starts empty");
});

test("dashboard: typing in filter sets filterText", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "run-1", cwd: "/tmp/proj" });
  const snap = () => store.snapshot();
  const dash = makeDashboard({
    runner: new AgentRunner({ piBinary: "pi" }),
    snapshot: snap,
  });

  dash.handleInput("/");
  for (const ch of "alpha") dash.handleInput(ch);
  assert.equal((dash as any).filterText, "alpha");
});

test("dashboard: Esc exits filter mode and clears text", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "run-1", cwd: "/tmp/proj" });
  const snap = () => store.snapshot();
  const dash = makeDashboard({
    runner: new AgentRunner({ piBinary: "pi" }),
    snapshot: snap,
  });

  dash.handleInput("/");
  dash.handleInput("a");
  dash.handleInput("\u001b"); // esc
  assert.equal((dash as any).filtering, false, "filtering mode off");
  assert.equal((dash as any).filterText, "", "filter text cleared");
});
