/**
 * pi-forgery — execution runtime tests.
 *
 * Tests the host-call registry, schema validation, program execution, and
 * the host-proxy bridging.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HostCallRegistry,
  buildHostProxy,
  runProgram,
  validateArgs,
  type HostExecCtx,
} from "../src/exec/runtime.js";
import { ForgeryActivityStore } from "../src/activity/store.js";

test("validateArgs: missing required field", () => {
  const schema = {
    type: "object" as const,
    properties: {},
    required: ["task"],
  };
  const result = validateArgs(schema as any, {});
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /task/);
});

test("validateArgs: passes when required field present", () => {
  const schema = {
    type: "object" as const,
    properties: {},
    required: ["task"],
  };
  const result = validateArgs(schema as any, { task: "do something" });
  assert.equal(result.ok, true);
});

test("registry: register + list", () => {
  const reg = new HostCallRegistry();
  reg.register({
    ref: "pi.read",
    schema: { type: "object", properties: {} },
    kind: "tool",
    execute: async () => ({ value: "data" }),
  });
  reg.register({
    ref: "pi.bash",
    schema: { type: "object", properties: {} },
    kind: "tool",
    execute: async () => ({ value: "out" }),
  });
  assert.ok(reg.has("pi.read"));
  assert.ok(reg.has("pi.bash"));
  assert.ok(!reg.has("agents.run"));
  assert.deepEqual(reg.list().sort(), ["pi.bash", "pi.read"]);
});

test("runProgram: literal JSON", async () => {
  const reg = new HostCallRegistry();
  const store = new ForgeryActivityStore();
  const ctx: HostExecCtx = { runId: "run-1", activity: store, cwd: "." };
  const result = await runProgram('{"name": "demo"}', reg, ctx, new AbortController().signal);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: "demo" });
});

test("runProgram: simple async program with a host call", async () => {
  const reg = new HostCallRegistry();
  reg.register({
    ref: "pi.read",
    schema: { type: "object", properties: {}, required: ["path"] } as any,
    kind: "tool",
    execute: async (args) => ({ value: "file-content", preview: String(args.path) }),
  });

  const store = new ForgeryActivityStore();
  const ctx: HostExecCtx = { runId: "run-1", activity: store, cwd: "." };
  const code = `
    const text = await pi.read({ path: "hello.txt" });
    return { text };
  `;
  const result = await runProgram(code, reg, ctx, new AbortController().signal);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { text: "file-content" });
});

test("runProgram: error from a host call propagates", async () => {
  const reg = new HostCallRegistry();
  reg.register({
    ref: "pi.bash",
    schema: { type: "object", properties: {}, required: ["command"] } as any,
    kind: "tool",
    execute: async () => ({ error: "exit 1: not found", preview: "echo" }),
  });

  const store = new ForgeryActivityStore();
  const ctx: HostExecCtx = { runId: "run-1", activity: store, cwd: "." };
  const code = `
    try {
      const out = await pi.bash({ command: "false" });
      return out;
    } catch (e) {
      return { error: e.message };
    }
  `;
  const result = await runProgram(code, reg, ctx, new AbortController().signal);
  // The program catches the HostCallError and returns it, so result.ok is
  // true but the value is the structured error.
  assert.equal(result.ok, true);
  assert.ok((result.value as any).error);
  assert.match((result.value as any).error, /bash/);
});

test("runProgram: parallel calls via Promise.all", async () => {
  let calls = 0;
  const reg = new HostCallRegistry();
  reg.register({
    ref: "pi.read",
    schema: { type: "object", properties: {}, required: ["path"] } as any,
    kind: "tool",
    execute: async () => {
      calls += 1;
      return { value: "data" };
    },
  });
  const store = new ForgeryActivityStore();
  const ctx: HostExecCtx = { runId: "run-1", activity: store, cwd: "." };
  const code = `
    const [a, b] = await Promise.all([
      pi.read({ path: "a" }),
      pi.read({ path: "b" }),
    ]);
    return { a, b };
  `;
  const result = await runProgram(code, reg, ctx, new AbortController().signal);
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test("buildHostProxy: unknown member throws", async () => {
  const reg = new HostCallRegistry();
  reg.register({
    ref: "pi.read",
    schema: { type: "object", properties: {} },
    kind: "tool",
    execute: async () => ({ value: "x" }),
  });
  const store = new ForgeryActivityStore();
  const ctx: HostExecCtx = { runId: "run-1", activity: store, cwd: "." };
  const { pi } = buildHostProxy(reg, ctx, new AbortController().signal);
  // Only "read" is callable on the pi namespace.
  assert.ok(typeof pi.read === "function");
  // Accessing an unregistered host call should not produce a callable.
  assert.equal(pi.bash, undefined);
});
