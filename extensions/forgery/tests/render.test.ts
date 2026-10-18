/**
 * pi-forgery — footer + widget render tests (pure, no host).
 * We stub the Theme to return colored text and verify the components
 * produce the expected line shapes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryFooter, type ForgeryFooterContext } from "../src/ui/footer.js";
import { ForgeryWidget, type ForgeryWidgetInteraction } from "../src/ui/widget.js";
import { ForgeryActivityStore } from "../src/activity/store.js";

/** A minimal Theme stub that just tags text with a marker. */
function stubTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}`,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => `**${text}**`,
  } as unknown as import("@earendil-works/pi-coding-agent").Theme;
}

test("ForgeryFooter: renders idle when no runs", () => {
  const store = new ForgeryActivityStore();
  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => "main",
    contextPercent: () => 42,
    contextTokens: () => 21_300,
    modelId: () => "claude-sonnet",
  };
  const footer = new ForgeryFooter(stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /main/);
  assert.match(lines[0], /42%/);
  assert.match(lines[0], /claude-sonnet/);
  assert.match(lines[0], /idle/);
});

test("ForgeryFooter: renders active run metrics", () => {
  const store = new ForgeryActivityStore();
  const run = store.start("run-1", { name: "demo" });
  store.beginCall("run-1", "c1", "pi.read", { path: "a.ts" });
  store.updateCall("run-1", "c1", {
    type: "metrics",
    metrics: { tokens: 1234, cost: 0.42 },
  });

  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextPercent: () => null,
    contextTokens: () => null,
    modelId: () => undefined,
  };
  const footer = new ForgeryFooter(stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /demo/);
  assert.match(lines[0], /1 calls/);
  assert.match(lines[0], /1\.2k tok/);
  assert.match(lines[0], /\$0\.42/);
  void run;
});

test("ForgeryFooter: statusString() mirrors a compact line", () => {
  const store = new ForgeryActivityStore();
  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextPercent: () => null,
    contextTokens: () => null,
    modelId: () => undefined,
  };
  const footer = new ForgeryFooter(stubTheme(), () => store.snapshot(), footerCtx);
  assert.equal(footer.statusString(), "forgery · idle");

  store.start("run-2", { name: "busy" });
  assert.match(footer.statusString(), /busy/);
  assert.match(footer.statusString(), /0 calls/);
});

test("ForgeryWidget: shouldShow true when a run is active", () => {
  const store = new ForgeryActivityStore();
  const interaction: ForgeryWidgetInteraction = {
    activity: () => ["line"],
    release: () => {},
    requestRender: () => {},
  };
  const widget = new ForgeryWidget(stubTheme(), () => store.snapshot(), 8, { retainMs: 5000 }, interaction);
  assert.equal(widget.shouldShow(store.snapshot()), false);

  store.start("run-3", { name: "now" });
  assert.equal(widget.shouldShow(store.snapshot()), true);

  // Render returns a header line.
  const lines = widget.render(120);
  assert.ok(lines.length >= 1);
  assert.match(lines[0], /now/);
});
