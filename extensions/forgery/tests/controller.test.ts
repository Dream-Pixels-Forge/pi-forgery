/**
 * pi-forgery — UI controller tests (host-stubbed).
 *
 * The controller owns the footer/agent refresh wiring. These tests assert
 * that the footer reads *live* host state instead of a value captured at
 * mount time (the bug behind "the footer does not update in realtime").
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryUiController } from "../src/ui/controller.js";
import { ForgeryActivityStore } from "../src/activity/store.js";
import { AgentRunner } from "../src/agents/runner.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** A minimal Theme stub that just tags text with a marker. */
function stubTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}`,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => `**${text}**`,
  } as unknown as import("@earendil-works/pi-coding-agent").Theme;
}

interface FooterComponent {
  render(width: number): string[];
}

function stubUi() {
  const state: { footerFactory?: (...args: unknown[]) => FooterComponent } = {};
  const ui = {
    theme: stubTheme(),
    setFooter: (factory: unknown) => {
      state.footerFactory = factory as typeof state.footerFactory;
    },
    setWidget: () => {},
    setStatus: () => {},
    notify: () => {},
  };
  return { ui, state };
}

test("ForgeryUiController: footer reads host state live, not frozen at mount", () => {
  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const controller = new ForgeryUiController(store, runner, []);
  const { ui, state } = stubUi();

  let percent = 10;
  let modelId = "acme/model-x";
  let thinkingLevel = "low";

  const ctx = {
    ui,
    cwd: "/tmp/project",
    get model() {
      return { id: modelId };
    },
    get thinkingLevel() {
      return thinkingLevel;
    },
    getContextUsage: () => ({ tokens: 1_000, contextWindow: 10_000, percent }),
  } as unknown as ExtensionContext;

  controller.start(ctx);
  const footer = state.footerFactory!(ui, stubTheme(), {});

  // At mount the footer shows the then-current values.
  const atMount = footer.render(200)[0];
  assert.match(atMount, /10%/);
  assert.match(atMount, /model-x/);
  assert.match(atMount, /lw/);

  // Host state changes afterwards — the footer must pick them up.
  percent = 55;
  modelId = "acme/model-y";
  thinkingLevel = "high";

  const after = footer.render(200)[0];
  assert.match(after, /55%/);
  assert.match(after, /model-y/);
  assert.match(after, /hgh/);

  controller.stop();
});

test("ForgeryUiController: a stale extension context degrades instead of throwing", () => {
  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const controller = new ForgeryUiController(store, runner, []);
  const { ui, state } = stubUi();

  // Pi invalidates the context after newSession/fork/switchSession/reload —
  // every context getter then throws.
  const ctx = {
    ui,
    get cwd(): string {
      throw new Error("extension context is no longer active");
    },
    get model(): never {
      throw new Error("extension context is no longer active");
    },
    get thinkingLevel(): never {
      throw new Error("extension context is no longer active");
    },
    getContextUsage(): never {
      throw new Error("extension context is no longer active");
    },
  } as unknown as ExtensionContext;

  controller.start(ctx);
  const footer = state.footerFactory!(ui, stubTheme(), {});

  assert.doesNotThrow(() => footer.render(200));

  controller.stop();
});

test("ForgeryUiController: refresh does not re-notify the store when nothing changed", () => {
  const store = new ForgeryActivityStore();
  const runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 1 });
  const controller = new ForgeryUiController(store, runner, []);
  const { ui } = stubUi();

  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  const ctx = {
    ui,
    cwd: "/tmp/project",
    model: { id: "acme/model-x" },
    thinkingLevel: "low",
    getContextUsage: () => ({ tokens: 1_000, contextWindow: 10_000, percent: 10 }),
  } as unknown as ExtensionContext;

  controller.start(ctx);
  const baseline = notifications;

  controller.refresh();
  controller.refresh();
  controller.refresh();

  assert.equal(notifications, baseline, "idle refresh must not spin the store");

  unsubscribe();
  controller.stop();
});
