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
    cwd: () => "/home/user/my-project",
    compactCount: () => 1,
    compactMax: () => 5,
    issuesOpen: () => 3,
    issuesClosed: () => 12,
    prsOpen: () => 1,
    prsClosed: () => 5,
    ciStatus: () => "green",
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /main/);
  assert.match(lines[0], /42%/);
  assert.match(lines[0], /m3\.1-flash/);
  assert.match(lines[0], /med/); // effort short form
  assert.match(lines[0], /my-project/);
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
    cwd: () => null,
    compactCount: () => null,
    compactMax: () => null,
    issuesOpen: () => null,
    issuesClosed: () => null,
    prsOpen: () => null,
    prsClosed: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
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
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    cwd: () => null,
    compactCount: () => null,
    compactMax: () => null,
    issuesOpen: () => null,
    issuesClosed: () => null,
    prsOpen: () => null,
    prsClosed: () => null,
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
    cwd: () => null,
    compactCount: () => null,
    compactMax: () => null,
    issuesOpen: () => null,
    issuesClosed: () => null,
    prsOpen: () => null,
    prsClosed: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  // Pi does not clamp `percent`; the bar must not build a negative repeat count.
  assert.doesNotThrow(() => footer.render(200));
  assert.match(footer.render(200)[0], /125%/);
});

test("ForgeryFooter: renders subgoal progress when subgoals exist", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.subgoal({ goalId: "run-1", name: "write tests", status: "completed", total: 3, completed: 3 });
  store.subgoal({ goalId: "run-1", name: "write code", status: "running", total: 5, completed: 2 });

  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    cwd: () => null,
    compactCount: () => null,
    compactMax: () => null,
    issuesOpen: () => null,
    issuesClosed: () => null,
    prsOpen: () => null,
    prsClosed: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  const lines = footer.render(200);
  // subgoal segment: completed subgoal count / total subgoal count across active runs
  assert.match(lines[0], /subgoals 1\/2/);
});

test("ForgeryFooter: no subgoal segment when no subgoals", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });

  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    cwd: () => null,
    compactCount: () => null,
    compactMax: () => null,
    issuesOpen: () => null,
    issuesClosed: () => null,
    prsOpen: () => null,
    prsClosed: () => null,
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

test("ForgeryFooter: renders a single context percentage, not duplicated", () => {
  const store = new ForgeryActivityStore();
  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => ({ tokens: 21_300, contextWindow: 32_000, percent: 42 }),
    modelId: () => undefined,
    effort: () => null,
    cwd: () => null,
    compactCount: () => null,
    compactMax: () => null,
    issuesOpen: () => null,
    issuesClosed: () => null,
    prsOpen: () => null,
    prsClosed: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  const line = footer.render(200)[0];
  // #progressBar already appends formatPercent(pct), so ctxSeg must not add it again.
  const pctOccurrences = line.match(/42%/g);
  assert.equal(pctOccurrences?.length, 1, "context percentage should render exactly once");
  assert.match(line, /ctx \[███░░░\] 42%/);
});
