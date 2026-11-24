/**
 * pi-forgery — `/forgery distill` CLI tests.
 *
 * Exercises the `distill` subcommand added to the `index.ts` command handler.
 * The `distill()` function itself is covered by tests/distill.test.ts; these
 * tests verify the CLI wiring (argument parsing, output formatting, empty
 * state).
 *
 * Run with: `npx tsx --test tests/test-distill-cli.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ── mock ExtensionAPI that captures the registered command handler ────────

type CommandHandler = (args: string, ctx: unknown) => Promise<void>;

function makeMockApi(): { handler: CommandHandler } {
  let captured: CommandHandler | undefined;
  return {
    registerTool: () => {},
    registerCommand: (_name: string, opts: { handler: CommandHandler }) => {
      captured = opts.handler;
    },
    registerShortcut: () => {},
    on: () => {},
    get handler(): CommandHandler {
      assert.ok(captured, "command handler should have been registered");
      return captured;
    },
  } as { handler: CommandHandler };
}

function makeMockCtx(notifications: string[]): unknown {
  return {
    ui: {
      notify: (message: string, _level: string) => {
        notifications.push(message);
      },
    },
    cwd: "/tmp/test",
  };
}

// Import the extension factory after defining mocks.
import forgery from "../index.js";

test("/forgery distill: command handler is registered", () => {
  const api = makeMockApi();
  forgery(api as never);
  assert.equal(typeof api.handler, "function");
});

test("/forgery distill: no completed runs → 'no patterns' message", async () => {
  const api = makeMockApi();
  forgery(api as never);
  const handler = api.handler;

  const notifications: string[] = [];
  const ctx = makeMockCtx(notifications);

  await handler("distill", ctx as never);

  assert.equal(notifications.length, 1);
  assert.match(notifications[0], /no repeated host-call patterns/);
});

test("/forgery distill: with min-occurrences arg → no crash, empty message", async () => {
  const api = makeMockApi();
  forgery(api as never);
  const handler = api.handler;

  const notifications: string[] = [];
  const ctx = makeMockCtx(notifications);

  await handler("distill 3", ctx as never);

  assert.equal(notifications.length, 1);
  assert.match(notifications[0], /no repeated host-call patterns/);
});

test("/forgery distill: with min-occurrences + window-days + n → no crash", async () => {
  const api = makeMockApi();
  forgery(api as never);
  const handler = api.handler;

  const notifications: string[] = [];
  const ctx = makeMockCtx(notifications);

  await handler("distill 2 7 3", ctx as never);

  assert.equal(notifications.length, 1);
  assert.match(notifications[0], /no repeated host-call patterns/);
});
