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
    contextUsage: () => ({ tokens: 21_300, contextWindow: 32_000, percent: 42 }),
    modelId: () => "minimax/minimax-m3.1-flash",
    effort: () => "medium",
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /main/);
  assert.match(lines[0], /ctx \[muted\]\[███░░░\] 42%/);
  assert.match(lines[0], /m3\.1-flash/);
  assert.match(lines[0], /med/); // effort short form
});

test("ForgeryFooter: renders active run metrics", () => {
  const store = new ForgeryActivityStore();
  const run = store.start("run-1", { name: "demo" });
  store.beginCall("run-1", "c1", "pi.read", { path: "a.ts" });
  store.updateCall("run-1", "c1", {
    type: "metrics",
    metrics: { tokens: 1234, toolCalls: 1, cost: 0.42 },
  });

  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /demo/);
  assert.match(lines[0], /1 calls/);
  void run;
});

test("ForgeryFooter: statusString() mirrors a compact line", () => {
  const store = new ForgeryActivityStore();
  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
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
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8, { retainMs: 5000 }, interaction);
  assert.equal(widget.shouldShow(store.snapshot()), false);

  store.start("run-3", { name: "now" });
  assert.equal(widget.shouldShow(store.snapshot()), true);

  // Render returns a header line.
  const lines = widget.render(120);
  assert.ok(lines.length >= 1);
  assert.match(lines[0], /now/);
});

test("ForgeryFooter: clamps a context percentage above 100", () => {
  const store = new ForgeryActivityStore();
  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => ({ tokens: 250_000, contextWindow: 200_000, percent: 125 }),
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  // Percent above 100 is clamped at 100 in the bar; must not throw on over-full context.
  assert.doesNotThrow(() => footer.render(200));
  assert.match(footer.render(200)[0], /ctx \[error\]\[██████\] 100%/);
});

test("ForgeryFooter: no subgoal segment (minimal Claude Code style)", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });

  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  assert.match(lines[0], /demo/);
  assert.ok(!lines[0].includes("subgoals"));
});

test("ForgeryWidget: renders subgoal rows for active run", () => {
  const store = new ForgeryActivityStore();
  const interaction: ForgeryWidgetInteraction = {
    activity: () => [],
    release: () => {},
    requestRender: () => {},
  };
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8, { retainMs: 5000 }, interaction);

  store.start("run-1", { name: "demo" });
  store.subgoal({ goalId: "run-1", name: "write tests", status: "completed", total: 3, completed: 3 });
  store.subgoal({ goalId: "run-1", name: "write code", status: "running", total: 5, completed: 2 });

  const lines = widget.render(120);
  const body = lines.join("\n");
  assert.match(body, /write tests/);
  assert.match(body, /write code/);
  assert.match(body, /3\/3/);
  assert.match(body, /2\/5/);
});

test("ForgeryWidget: no subgoal rows when run has none", () => {
  const store = new ForgeryActivityStore();
  const interaction: ForgeryWidgetInteraction = {
    activity: () => [],
    release: () => {},
    requestRender: () => {},
  };
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8, { retainMs: 5000 }, interaction);

  store.start("run-1", { name: "demo" });
  const lines = widget.render(120);
  const body = lines.join("\n");
  assert.ok(!body.includes("write tests"));
  assert.ok(!body.includes("write code"));
});

test("ForgeryFooter: colors context bar warning at 50% and error at 85%+", () => {
  const store = new ForgeryActivityStore();
  const baseCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
  };

  // 50% → warning, 3 filled of 6 width
  const ctx50 = new ForgeryFooter(
    () => stubTheme(),
    () => store.snapshot(),
    { ...baseCtx, contextUsage: () => ({ tokens: 16_000, contextWindow: 32_000, percent: 50 }), ciStatus: () => null },
  );
  const line50 = ctx50.render(200)[0];
  assert.match(line50, /\[warning\]\[███░░░\] 50%/);

  // 85% → error, 5 filled of 6 width
  const ctx85 = new ForgeryFooter(
    () => stubTheme(),
    () => store.snapshot(),
    { ...baseCtx, contextUsage: () => ({ tokens: 27_200, contextWindow: 32_000, percent: 85 }), ciStatus: () => null },
  );
  const line85 = ctx85.render(200)[0];
  assert.match(line85, /\[error\]\[█████░\] 85%/);

  // 30% → muted
  const ctx30 = new ForgeryFooter(
    () => stubTheme(),
    () => store.snapshot(),
    { ...baseCtx, contextUsage: () => ({ tokens: 9_600, contextWindow: 32_000, percent: 30 }), ciStatus: () => null },
  );
  const line30 = ctx30.render(200)[0];
  assert.match(line30, /\[muted\]\[██░░░░\] 30%/);
});

test("ForgeryFooter: hides model name while CI is pending", () => {
  const store = new ForgeryActivityStore();
  const ctx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => "minimax/minimax-m3.1-flash",
    effort: () => "medium",
    ciStatus: () => "pending",
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), ctx);
  const line = footer.render(200)[0];
  // CI pending hides the model segment entirely.
  assert.ok(!line.includes("m3.1-flash"), "model should be hidden during CI pending");
  assert.ok(!line.includes("med"), "effort should be hidden during CI pending");
  // CI status itself is still shown.
  assert.match(line, /CI ◐/);
});

test("ForgeryFooter: restores model name with reveal animation after CI settles", () => {
  const store = new ForgeryActivityStore();
  const ctx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => "minimax/minimax-m3.1-flash",
    effort: () => "medium",
    ciStatus: () => "pending",
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), ctx);

  // While CI is pending, model is hidden.
  assert.ok(!footer.render(200)[0].includes("m3.1-flash"), "model hidden during CI pending");

  // CI leaves pending → restore animation begins.
  ctx.ciStatus = () => "green";

  // Render ~35 times to advance past the ~30-frame restore window.
  let line = "";
  for (let i = 0; i < 35; i++) {
    line = footer.render(200)[0];
  }
  // Model name fully restored.
  assert.match(line, /m3\.1-flash/);
  assert.match(line, /med/);
});
