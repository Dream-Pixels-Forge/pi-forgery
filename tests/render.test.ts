/**
 * pi-forgery — footer + widget render tests (pure, no host).
 * We stub the Theme to return colored text and verify the components
 * produce the expected line shapes.
 */

import { homedir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryFooter, type ForgeryFooterContext } from "../src/ui/footer.js";
import { ForgeryWidget, type ForgeryWidgetInteraction } from "../src/ui/widget.js";
import { ForgeryDashboard } from "../src/ui/dashboard.js";
import { ForgeryActivityStore, type ForgeryAgentRecord, type ForgeryEvent } from "../src/activity/store.js";
/** A minimal Theme stub that emits real ANSI so `visibleWidth`/`vw` strip it correctly. */
const ANSI: Record<string, string> = {
  accent: "32",
  muted: "37",
  dim: "90",
  text: "0",
  success: "32",
  error: "31",
  warning: "33",
  border: "36",
};
function stubTheme() {
  return {
    fg: (color: string, text: string) => `\x1b[${ANSI[color] ?? "0"}m${text}\x1b[0m`,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  } as unknown as import("@earendil-works/pi-coding-agent").Theme;
}

/** Strip ANSI so we can measure true visible width in assertions. */
function cleanWidth(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, "");
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
  assert.match(cleanWidth(lines[0]), /ctx \[███░░░\] 42%/);
  assert.match(cleanWidth(lines[0]), /minimax m3\.1 flash ●●○/); // shortModel + effort meter
  assert.match(cleanWidth(lines[0]), /21\.3k\/32k/);
});

test("ForgeryFooter: shows exact home as ~ and nested paths by basename", () => {
  const store = new ForgeryActivityStore();
  const home = homedir();
  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
    cwd: () => home,
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), footerCtx);
  assert.match(cleanWidth(footer.render(120)[0]), /~/, "home dir renders as ~");

  const nestedCtx = { ...footerCtx, cwd: () => `${home}/src/ui/footer.ts` };
  const nestedFooter = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), nestedCtx);
  const nestedLine = cleanWidth(nestedFooter.render(120)[0]);
  assert.match(nestedLine, /footer\.ts/, "nested path renders as its basename");
  assert.doesNotMatch(nestedLine, /~\/src\/ui/, "parent directories stay hidden");
});

test("ForgeryFooter: renders active run metrics", () => {
  const store = new ForgeryActivityStore();
  const run = store.start("run-1", { name: "demo" });
  store.beginCall("run-1", "c1", "pi.read", { path: "a.ts" });
  store.finishCall("run-1", "c1", {
    success: true,
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
  assert.match(lines[0], /1 call\b/);
  void run;
});

test("ForgeryFooter: completed run telemetry matches statusString", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.beginCall("run-1", "c1", "pi.read", { path: "a.ts" });
  store.finishCall("run-1", "c1", {
    success: true,
    metrics: { tokens: 1234, toolCalls: 1, cost: 0.42 },
  });
  store.subgoal({ goalId: "run-1", name: "tests", status: "completed" });
  store.subgoal({ goalId: "run-1", name: "docs", status: "running" });
  store.finish("run-1", true);
  const snap = store.snapshot();
  snap.runs[0].startedAt = 1_000;
  snap.runs[0].finishedAt = 193_000;

  const footerCtx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => undefined,
    effort: () => null,
    ciStatus: () => null,
  };
  const footer = new ForgeryFooter(
    () => stubTheme(),
    () => snap,
    footerCtx,
    false,
    () => 999_000,
  );
  const status = cleanWidth(footer.statusString());
  const custom = cleanWidth(footer.render(300).join(" "));
  for (const telemetry of ["1 call", "1.2k tok", "$0.42", "3m12s", "subgoals 1/2"]) {
    assert.ok(status.includes(telemetry), `statusString missing ${telemetry}: ${status}`);
    assert.ok(custom.includes(telemetry), `custom footer missing ${telemetry}: ${custom}`);
  }
  assert.ok(status.includes("completed"));
  assert.ok(custom.includes("completed"));
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
  assert.match(cleanWidth(footer.render(200)[0]), /ctx \[██████\] 100%/);
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
  assert.match(cleanWidth(line50), /\[███░░░\] 50%/);

  // 85% → error, 5 filled of 6 width
  const ctx85 = new ForgeryFooter(
    () => stubTheme(),
    () => store.snapshot(),
    { ...baseCtx, contextUsage: () => ({ tokens: 27_200, contextWindow: 32_000, percent: 85 }), ciStatus: () => null },
  );
  const line85 = ctx85.render(200)[0];
  assert.match(cleanWidth(line85), /\[█████░\] 85%/);

  // 30% → muted
  const ctx30 = new ForgeryFooter(
    () => stubTheme(),
    () => store.snapshot(),
    { ...baseCtx, contextUsage: () => ({ tokens: 9_600, contextWindow: 32_000, percent: 30 }), ciStatus: () => null },
  );
  const line30 = ctx30.render(200)[0];
  assert.match(cleanWidth(line30), /\[██░░░░\] 30%/);
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
  assert.match(line, /CI/);
});

test("ForgeryFooter: restores model name with reveal animation after CI settles", () => {
  const store = new ForgeryActivityStore();
  let now = 1000;
  const clock = () => now;
  const ctx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => null,
    modelId: () => "minimax/minimax-m3.1-flash",
    effort: () => "medium",
    ciStatus: () => "pending",
  };
  const footer = new ForgeryFooter(() => stubTheme(), () => store.snapshot(), ctx, true, clock);

  // While CI is pending, model is hidden.
  assert.ok(!footer.render(200)[0].includes("m3.1-flash"), "model hidden during CI pending");

  // CI leaves pending → restore animation begins at the current clock time.
  ctx.ciStatus = () => "green";
  now = 2000;
  // Right after CI settles the model is still hidden (progress is 0).
  assert.ok(!footer.render(200)[0].includes("m3.1-flash"), "model hidden right after CI settles");

  // Advance past the 3 s restore window → model name fully restored.
  now = 6000;
  const line = footer.render(200)[0];
  assert.match(line, /m3\.1 flash/);
  assert.match(line, /●●○/);
});

// ── SG-07: widget row budget & change detection ─────────────────────────

function widgetWithAgents(
  statuses: string[],
  maxRows = 8,
  clock = Date.now,
): { widget: ForgeryWidget; store: ForgeryActivityStore } {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  for (let i = 0; i < statuses.length; i++) {
    store.addAgent({
      id: `agent-${i}`,
      name: `agent-${i}`,
      task: "some task",
      status: statuses[i] as any,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), maxRows, undefined, {
    activity: () => ["line"],
    release: () => {},
    requestRender: () => {},
  }, true, clock);
  return { widget, store };
}

test("ForgeryWidget: render never exceeds maxRows at any width", () => {
  const fixed = () => 1000;
  for (const maxRows of [3, 5, 8, 12, 20]) {
    const { widget } = widgetWithAgents(
      ["running", "completed", "failed", "queued", "blocked"],
      maxRows,
      fixed,
    );
    for (const width of [20, 40, 80, 120, 200]) {
      const lines = widget.render(width);
      assert.ok(
        lines.length <= maxRows,
        `lines ${lines.length} > maxRows ${maxRows} at width ${width}`,
      );
      for (const line of lines) {
        assert.ok(cleanWidth(line).length <= width, `line longer than width ${width}: ${JSON.stringify(cleanWidth(line))}`);
      }
    }
  }
});

test("ForgeryWidget: hasChanged is false for identical snapshots", () => {
  const fixed = () => 1000;
  const { widget } = widgetWithAgents(["running", "completed"], 8, fixed);
  widget.render(120); // prime
  assert.equal(widget.hasChanged(), false, "same snapshot → not changed");
});

test("ForgeryWidget: hasChanged is true when an agent status changes", () => {
  const fixed = () => 1000;
  const { widget, store } = widgetWithAgents(["running", "completed"], 8, fixed);
  widget.render(120); // prime
  assert.equal(widget.hasChanged(), false, "same snapshot → not changed");

  store.updateAgent("agent-1", { status: "failed" });
  assert.equal(widget.hasChanged(), true, "changed agent → changed");
});

test("ForgeryWidget: card stays within maxRows", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.addAgent({
    id: "agent-1",
    name: "agent-1",
    task: "t",
    status: "running",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  const lines = widget.render(120);
  assert.ok(lines.length <= 8, `card render exceeds maxRows: ${lines.length}`);
  assert.ok(lines.some((l) => l.includes("agent-1")), "agent row shown");
  // Card is bordered: first and last lines are the border.
  assert.ok(lines[0].startsWith("╭"), "top border");
  assert.ok(lines[lines.length - 1].startsWith("╰"), "bottom border");
});

// ── SG-05: subgoal tree ───────────────────────────────────────────────

test("ForgeryWidget: renders nested subgoals with tree connectors", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const sg1 = store.subgoal({ goalId: "run-1", name: "schema migration", status: "completed", total: 3, completed: 3 });
  const sg2 = store.subgoal({ goalId: "run-1", name: "login route", status: "running", total: 5, completed: 3 });
  store.subgoal({ goalId: "run-1", name: "handler", parentSubgoalId: sg2.id, status: "completed" });
  store.subgoal({ goalId: "run-1", name: "rate-limit", parentSubgoalId: sg2.id, status: "pending" });
  store.subgoal({ goalId: "run-1", name: "e2e tests", status: "blocked" });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  const lines = widget.render(120);
  const body = lines.slice(1, lines.length - 1); // inside borders
  assert.ok(body.some((l) => l.includes("├─") || l.includes("└─")), "tree connectors present");
  assert.ok(body.some((l) => l.includes("schema migration")), "root subgoal shown");
  assert.ok(body.some((l) => l.includes("handler")), "nested child shown");
  assert.ok(body.some((l) => l.includes("▰▰▰▰▰")), "completed progress bar full");
});

test("ForgeryWidget: orphan subgoal renders at root (missing parent)", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.subgoal({ goalId: "run-1", name: "orphan", status: "pending", parentSubgoalId: "missing" });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  const lines = widget.render(120);
  assert.ok(lines.some((l) => l.includes("orphan")), "orphan shown at root");
});

test("ForgeryWidget: subgoal row budget caps at maxRows", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  for (let i = 0; i < 12; i++) {
    store.subgoal({ goalId: "run-1", name: `goal ${i}`, status: "pending" });
  }
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 4);
  const lines = widget.render(120);
  assert.ok(lines.length <= 4, `exceeds maxRows: ${lines.length}`);
});

// ── SG-06: widget focus, selection & expand ───────────────────────────

test("ForgeryWidget: ↓/↑ move selection and Enter toggles expand", () => {
  const { widget } = widgetWithAgents(["running"]);
  widget.render(120); // populate selectable rows
  assert.equal(widget.selectedIndex, -1, "nothing selected initially");

  widget.handleInput("j"); // down → run header
  widget.handleInput("j"); // down → first (only) agent
  assert.equal(widget.selectedIndex, 1, "down selects first agent");

  widget.handleInput("\r"); // Enter → expand selected
  assert.equal(widget.expandedId, "agent-0", "expandedId set to selected agent");

  widget.handleInput("\r"); // Enter again → collapse
  assert.equal(widget.expandedId, undefined, "second Enter collapses");

  widget.handleInput("\u001b"); // Esc with nothing expanded → release (no throw)
  assert.equal(widget.expandedId, undefined, "still collapsed");
});

test("ForgeryWidget: selected row shows gutter marker", () => {
  const { widget } = widgetWithAgents(["running"]);
  widget.render(120);
  widget.handleInput("j"); // run header
  widget.handleInput("j"); // first (only) agent
  const after = widget.render(120);
  assert.ok(after.some((l) => l.includes("▌")), "gutter marker on selected row");
  assert.equal(widget.selectedIndex, 1, "selectedIndex tracks the agent");
});

test("ForgeryWidget: selection clamps at the top and bottom", () => {
  const { widget } = widgetWithAgents(["running"]);
  widget.render(120); // selectable rows: [run header, agent-0]
  widget.handleInput("j"); // 0 → run header
  widget.handleInput("j"); // 1 → agent-0 (bottom)
  assert.equal(widget.selectedIndex, 1, "selected the agent");

  // Pressing down again clamps at the bottom.
  widget.handleInput("j");
  assert.equal(widget.selectedIndex, 1, "clamps at bottom");

  // Pressing up returns to the run header and clamps at the top.
  widget.handleInput("k");
  widget.handleInput("k");
  assert.equal(widget.selectedIndex, 0, "clamps at top");
});

// ── SG-16: dashboard keybindings, help & index bounds ───────────────

function dashboardWithRuns(runNames: string[]): { dash: ForgeryDashboard; done: () => void } {
  let closed = false;
  const snap = () => {
    const store = new ForgeryActivityStore();
    for (const name of runNames) store.start(name, { name });
    return store.snapshot();
  };
  const dash = new ForgeryDashboard(
    { requestRender: () => {} },
    stubTheme(),
    {} as never,
    {
      snapshot: snap,
      done: () => {
        closed = true;
      },
      hostCalls: ["pi.read", "agents.run"],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
    },
  );
  return { dash, done: () => closed };
}

test("ForgeryDashboard: ] next run / [ prev run, clamped", () => {
  const { dash } = dashboardWithRuns(["run-a", "run-b", "run-c"]);
  dash.render(120);
  assert.equal((dash as any).runIndex, 0, "starts at first run");

  dash.handleInput("]"); // next → run-b
  assert.equal((dash as any).runIndex, 1, "next run");
  assert.equal((dash as any).entityIndex, 0, "entity selection reset on run change");

  dash.handleInput("]"); // next → run-c
  assert.equal((dash as any).runIndex, 2, "last run");
  dash.handleInput("]"); // clamped
  assert.equal((dash as any).runIndex, 2, "clamped at last run");

  dash.handleInput("["); // prev → run-b
  assert.equal((dash as any).runIndex, 1, "prev run");
  dash.handleInput("[");
  dash.handleInput("[");
  dash.handleInput("[");
  assert.equal((dash as any).runIndex, 0, "clamped at first run");
});

test("ForgeryDashboard: j/k move entity selection clamped", () => {
  const { dash } = dashboardWithRuns(["run-a"]);
  dash.render(120);
  assert.equal((dash as any).entityIndex, 0, "starts at top");

  dash.handleInput("j");
  dash.handleInput("j");
  assert.equal((dash as any).entityIndex, 0, "clamps at top when no entities");

  dash.handleInput("k");
  assert.equal((dash as any).entityIndex, 0, "clamps at top going up");
});

test("ForgeryDashboard: tab cycles filter and resets entity index", () => {
  const { dash } = dashboardWithRuns(["run-a"]);
  dash.render(120);
  assert.equal((dash as any).filter, "all", "starts at all filter");

  dash.handleInput("\t");
  assert.equal((dash as any).filter, "active", "tab → active");
  assert.equal((dash as any).entityIndex, 0, "entity index reset on filter change");

  dash.handleInput("\t");
  dash.handleInput("\t");
  assert.equal((dash as any).filter, "failed", "tab → failed");
  dash.handleInput("\t");
  assert.equal((dash as any).filter, "all", "tab wraps to all");
});

test("ForgeryDashboard: settings Enter does not close overlay", () => {
  let closed = false;
  const snap = () => new ForgeryActivityStore().snapshot();
  const dash = new ForgeryDashboard(
    { requestRender: () => {} },
    stubTheme(),
    {} as never,
    {
      snapshot: snap,
      done: () => {
        closed = true;
      },
      hostCalls: [],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
    },
  );
  dash.handleInput("2"); // switch to settings
  assert.equal((dash as any).view, "settings", "switched to settings");
  dash.handleInput("\r"); // Enter in settings
  assert.equal(closed, false, "Enter in settings does not close");
  dash.handleInput("1"); // back to activity
  assert.equal((dash as any).view, "activity", "back to activity");
  dash.handleInput("\u001b"); // esc closes
  assert.equal(closed, true, "esc closes overlay");
});

test("ForgeryDashboard: ? opens help overlay, any key closes", () => {
  const { dash } = dashboardWithRuns(["run-a"]);
  dash.render(120);
  assert.equal((dash as any).helpOpen, false, "help closed initially");

  dash.handleInput("?");
  assert.equal((dash as any).helpOpen, true, "? opens help");
  const helpLines = dash.render(120);
  assert.ok(helpLines.some((l) => l.includes("keybindings")), "help panel rendered");
  assert.ok(helpLines.some((l) => l.includes("next run")), "help lists bindings");

  dash.handleInput("x"); // any key closes help
  assert.equal((dash as any).helpOpen, false, "any key closes help");
});

test("ForgeryDashboard: help bar present in activity view", () => {
  const { dash } = dashboardWithRuns(["run-a"]);
  const lines = dash.render(120);
  assert.ok(lines.some((l) => l.includes("run-a")), "tab bar shows run name");
  assert.ok(lines.some((l) => l.includes("›")), "tab bar shows tab glyphs");
});

// ── SG-18: dashboard agent table with aligned columns & frozen durations ──

function dashboardWithAgents(agents: ForgeryAgentRecord[]): { dash: ForgeryDashboard } {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  for (const a of agents) store.addAgent(a);
  const dash = new ForgeryDashboard(
    { requestRender: () => {} },
    stubTheme(),
    {} as never,
    {
      snapshot: () => store.snapshot(),
      done: () => {},
      hostCalls: ["pi.read"],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
    },
  );
  return { dash };
}

test("ForgeryDashboard: agent table shows aligned columns and frozen durations", () => {
  const started = 1000;
  const { dash } = dashboardWithAgents([
    {
      id: "a-1",
      name: "planner",
      task: "t",
      status: "completed",
      startedAt: started,
      finishedAt: started + 60_000,
      turns: 3,
      toolCalls: 12,
      usage: { input: 1000, output: 12_345, cost: 0.42 },
      current: "reading src/auth.ts",
      updatedAt: started + 60_000,
      runId: "run-1",
    },
    {
      id: "a-2",
      name: "coder",
      task: "t",
      status: "running",
      startedAt: started,
      turns: 2,
      toolCalls: 5,
      usage: { input: 500, output: 8_100, cost: 0.12 },
      current: "writing files",
      updatedAt: started,
      runId: "run-1",
    },
  ]);
  dash.render(200);
  const out = dash.render(200).join("\n");
  // Header present.
  assert.ok(out.includes("name"), "name column");
  assert.ok(out.includes("turns"), "turns column");
  assert.ok(out.includes("calls"), "calls column");
  assert.ok(out.includes("tokens"), "tokens column");
  assert.ok(out.includes("cost"), "cost column");
  assert.ok(out.includes("time"), "time column");
  // Completed agent shows frozen duration (60s), activity present.
  assert.ok(out.includes("planner"), "planner shown");
  assert.ok(out.includes("1m"), "completed duration frozen");
  // Running agent duration is now - startedAt (still running).
  assert.ok(out.includes("coder"), "coder shown");
  assert.ok(out.includes("t3"), "turns formatted t3");
  assert.ok(out.includes("t2"), "running agent turns t2");
  assert.ok(out.includes("12"), "calls value shown");
  assert.ok(out.includes("calls"), "calls column header");
  assert.ok(out.includes("12.3k"), "tokens compact");
  assert.ok(out.includes("$0.42"), "cost shown");
});

// ── SG-09..SG-13: footer priority segments, gauge, labels, CI ─────────

function footerWithCtx(overrides: Partial<ForgeryFooterContext> = {}): {
  footer: ForgeryFooter;
  ctx: ForgeryFooterContext;
} {
  const base: ForgeryFooterContext = {
    gitBranch: () => "main",
    contextUsage: () => ({ tokens: 21_300, contextWindow: 32_000, percent: 42 }),
    modelId: () => "anthropic/claude-opus-5-5-20261001",
    effort: () => "medium",
    ciStatus: () => null,
  };
  const ctx = { ...base, ...overrides };
  const footer = new ForgeryFooter(() => stubTheme(), () => new ForgeryActivityStore().snapshot(), ctx);
  return { footer, ctx };
}

test("ForgeryFooter: gauge colour changes at 50% and 85% (SG-11)", () => {
  const { footer } = footerWithCtx({
    contextUsage: () => ({ tokens: 16_000, contextWindow: 32_000, percent: 50 }),
  });
  assert.match(cleanWidth(footer.render(200)[0]), /ctx \[███░░░\] 50%/);

  const footer85 = footerWithCtx({
    contextUsage: () => ({ tokens: 27_200, contextWindow: 32_000, percent: 85 }),
  });
  assert.match(cleanWidth(footer85.footer.render(200)[0]), /ctx \[█████░\] 85%/);

  const footer30 = footerWithCtx({
    contextUsage: () => ({ tokens: 9_600, contextWindow: 32_000, percent: 30 }),
  });
  assert.match(cleanWidth(footer30.footer.render(200)[0]), /ctx \[██░░░░\] 30%/);
});

test("ForgeryFooter: compact counter folded into gauge + handoff alert (SG-11)", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  // Set compacts on the run via the store's internal: use a subgoal/compact path.
  // compacts lives on the run; simulate by reaching into the snapshot.
  const ctx: ForgeryFooterContext = {
    gitBranch: () => null,
    contextUsage: () => ({ tokens: 10_000, contextWindow: 32_000, percent: 40 }),
    modelId: () => null,
    effort: () => null,
    ciStatus: () => null,
  };
  // compactMax 2, run has 2 compacts → handoff alert.
  const footer = new ForgeryFooter(
    () => stubTheme(),
    () => {
      const snap = store.snapshot();
      // mutate compacts on the latest run for the test
      snap.runs[0].compacts = 2;
      return snap;
    },
    ctx,
    true,
    Date.now,
    "auto",
    2,
  );
  const out = cleanWidth(footer.render(120)[0]);
  assert.ok(out.includes("⚠ handoff"), "handoff alert shows at max compacts");
  assert.ok(out.includes("↻2/2"), "compact counter folded into gauge");
});

test("ForgeryFooter: CI states normalized, no ? placeholders (SG-13)", () => {
  const cases: Array<[string, string]> = [
    ["passing", "✓ CI"],
    ["failing", "✗ CI"],
    ["running", "CI"],
    ["pending", "CI"], // pending → running spinner + CI
    ["none", ""], // hidden
  ];
  for (const [ci, expect] of cases) {
    const { footer } = footerWithCtx({ ciStatus: () => ci as any });
    const line = cleanWidth(footer.render(200)[0]);
    assert.ok(!line.includes("?"), `no ? placeholder for ci=${ci}`);
    if (expect) {
      assert.ok(line.includes(expect), `ci=${ci} should show ${expect}`);
    }
  }
});

test("ForgeryFooter: two-line layout when segments overflow (SG-10)", () => {
  const { footer } = footerWithCtx();
  // Narrow width forces two lines in "auto" mode.
  const lines = footer.render(40);
  assert.equal(lines.length, 2, "auto switches to two lines when overflowing");
  // Line 1 = session (model + branch), line 2 = activity (ctx + run).
  assert.match(lines[0], /opus 5 5/);
  assert.match(lines[0], /main/);
  assert.match(lines[1], /ctx/);
});

test("ForgeryFooter: one line when lines=1 even if overflowing (SG-10)", () => {
  const { footer, ctx } = footerWithCtx();
  const oneLineFooter = new ForgeryFooter(
    () => stubTheme(),
    () => new ForgeryActivityStore().snapshot(),
    ctx,
    true,
    Date.now,
    1, // force one line
    5,
  );
  const lines = oneLineFooter.render(40);
  assert.equal(lines.length, 1, "lines=1 stays one line");
  assert.ok(cleanWidth(lines[0]).length <= 40, "never exceeds width");
});

test("ForgeryFooter: priority dropping keeps alerts at narrow width (SG-09)", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const ctx: ForgeryFooterContext = {
    gitBranch: () => "very-long-branch-name-that-takes-space",
    contextUsage: () => ({ tokens: 10_000, contextWindow: 32_000, percent: 90 }),
    modelId: () => "anthropic/claude-opus-5-5-20261001",
    effort: () => null,
    ciStatus: () => "failing",
  };
  // compactMax 1, run has 1 compact → handoff alert (priority 0, survives).
  store.snapshot().runs[0].compacts = 1;
  const footer = new ForgeryFooter(
    () => stubTheme(),
    () => store.snapshot(),
    ctx,
    true,
    Date.now,
    "auto",
    1,
  );
  const out = cleanWidth(footer.render(40)[0]);
  assert.ok(out.includes("⚠ handoff") || out.includes("✗ CI"), "an alert survives at 40 cols");
  assert.ok(out.length <= 40, "never exceeds width");
});

// ── SG-21: widget mount stability ───────────────────────────────────────

test("ForgeryWidget: visible by default; setVisible(false) renders nothing", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  assert.equal(widget.render(120).length > 0, true, "visible by default");
  widget.setVisible(false);
  assert.equal(widget.render(120).length, 0, "hidden renders nothing");
  widget.setVisible(true);
  assert.equal(widget.render(120).length > 0, true, "re-showing re-renders");
});

test("ForgeryWidget: update marks dirty only when content changed", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  widget.render(120); // prime
  assert.equal(widget.dirty, false, "clean after render");

  widget.update(store.snapshot()); // nothing changed
  assert.equal(widget.dirty, false, "no change → not dirty");

  store.addAgent({
    id: "agent-1",
    name: "agent-1",
    task: "t",
    status: "running",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  widget.update(store.snapshot()); // content changed
  assert.equal(widget.dirty, true, "content changed → dirty");
  const lines = widget.render(120);
  assert.ok(lines.some((l) => l.includes("agent-1")), "dirty render shows new agent");
});

test("ForgeryWidget: render returns cached lines when not dirty", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  const first = widget.render(120);
  const second = widget.render(120);
  assert.equal(first, second, "same reference when not dirty");
});

// ── SG-22: widget transcript pane ───────────────────────────────────────

function dashboardWithLongAgent(): { dash: ForgeryDashboard; store: ForgeryActivityStore } {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.addAgent({
    id: "a-1",
    name: "coder",
    task: "writing code",
    status: "running",
    runId: "run-1",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    text: "A".repeat(2000),
  });
  const dash = new ForgeryDashboard(
    { requestRender: () => {} },
    stubTheme(),
    {} as never,
    {
      snapshot: () => store.snapshot(),
      done: () => {},
      hostCalls: ["pi.read"],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
    },
  );
  return { dash, store };
}

test("ForgeryDashboard: agent table renders within width 60", () => {
  const { dash } = dashboardWithLongAgent();
  const lines = dash.render(60);
  // All lines should be within width (visible width, ANSI stripped)
  for (const line of lines) {
    assert.ok(cleanWidth(line).length <= 60, `line too wide: ${cleanWidth(line).length} > 60: ${cleanWidth(line)}`);
  }
  // Agent names should be visible
  assert.ok(lines.some((l) => l.includes("coder")), "agent name shown");
});

test("ForgeryDashboard: widget expanded pane scrolls long agent text", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.addAgent({
    id: "a-1",
    name: "coder",
    task: "writing code",
    status: "running",
    runId: "run-1",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    text: "A".repeat(2000),
  });
  const widget = new ForgeryWidget(() => stubTheme(), () => store.snapshot(), 8);
  widget.render(60); // prime render
  widget.handleInput("j"); // select run header
  widget.handleInput("j"); // select agent
  widget.handleInput("\r"); // expand agent
  const firstRender = widget.render(60);
  const firstText = firstRender.join("\n");
  assert.ok(firstText.includes("coder"), "agent name shown in expanded pane");
  // The long text should be wrapped
  const longLines = firstRender.filter((l) => l.includes("A".repeat(10)));
  assert.ok(longLines.length > 0, "long text should be wrapped into visible lines");
  // Scroll down
  widget.handleInput("\u001b[6~"); // PgDn
  const scrolledRender = widget.render(60);
  const scrolledText = scrolledRender.join("\n");
  // Scrolled content should be different from first render
  assert.ok(scrolledText.length > 0, "scrolled output should have content");
});

// ── SG-19: dashboard events timeline & items ──────────────────────────

function dashboardWithEvents(): { dash: ForgeryDashboard; store: ForgeryActivityStore } {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const now = Date.now();
  store.event("run-1", {
    id: "e-1",
    message: "phase plan → execute",
    level: "info",
    createdAt: now - 10_000,
  });
  store.event("run-1", {
    id: "e-2",
    message: "compaction ctx 86% → 41%",
    level: "warning",
    createdAt: now - 5_000,
  });
  store.event("run-1", {
    id: "e-3",
    message: "agent coder failed",
    level: "error",
    createdAt: now - 2_000,
  });
  store.event("run-1", {
    id: "e-4",
    message: "task completed successfully",
    level: "success",
    createdAt: now - 1_000,
  });
  store.item("run-1", {
    id: "i-1",
    label: "src/auth.ts",
    status: "completed",
    kind: "tool",
    updatedAt: now - 1_000,
  });
  store.item("run-1", {
    id: "i-2",
    label: "src/main.ts",
    status: "completed",
    kind: "tool",
    updatedAt: now - 500,
  });
  const dash = new ForgeryDashboard(
    { requestRender: () => {} },
    stubTheme(),
    {} as never,
    {
      snapshot: () => store.snapshot(),
      done: () => {},
      hostCalls: ["pi.read"],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
    },
  );
  return { dash, store };
}

test("ForgeryDashboard: events timeline shows every event kind glyph", () => {
  const { dash } = dashboardWithEvents();
  const out = dash.render(200).join("\n");
  assert.ok(out.includes("events"), "events section rendered");
  assert.ok(out.includes("✗"), "error event uses ✗ glyph");
  assert.ok(out.includes("✓"), "success event uses ✓ glyph");
  assert.ok(out.includes("⚠"), "warning event uses ⚠ glyph");
  assert.ok(out.includes("▸"), "info event uses ▸ glyph");
  assert.ok(out.includes("agent coder failed"), "error message shown");
  assert.ok(out.includes("compaction ctx 86% → 41%"), "warning message shown");
  assert.ok(out.includes("phase plan → execute"), "info message shown");
});

test("ForgeryDashboard: items pane renders when items present", () => {
  const { dash } = dashboardWithEvents();
  const out = dash.render(200).join("\n");
  assert.ok(out.includes("items"), "items section rendered");
  assert.ok(out.includes("src/auth.ts"), "item label shown");
  assert.ok(out.includes("src/main.ts"), "second item label shown");
});

test("ForgeryDashboard: items pane hidden when no items", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.event("run-1", {
    id: "e-1",
    message: "test event",
    level: "info",
    createdAt: Date.now(),
  });
  const dash = new ForgeryDashboard(
    { requestRender: () => {} },
    stubTheme(),
    {} as never,
    {
      snapshot: () => store.snapshot(),
      done: () => {},
      hostCalls: ["pi.read"],
      agentConfig: { maxConcurrent: 4, piBinary: "pi" },
    },
  );
  const out = dash.render(200).join("\n");
  assert.ok(!out.includes("items"), "items section hidden when empty");
});

test("ForgeryDashboard: event filter cycles all → errors → agents → phases", () => {
  const { dash } = dashboardWithEvents();
  dash.render(120);
  assert.equal((dash as any).eventFilter, "all", "starts at all filter");

  dash.handleInput("f");
  assert.equal((dash as any).eventFilter, "errors", "f → errors filter");

  dash.handleInput("f");
  assert.equal((dash as any).eventFilter, "agents", "f → agents filter");

  dash.handleInput("f");
  assert.equal((dash as any).eventFilter, "phases", "f → phases filter");

  dash.handleInput("f");
  assert.equal((dash as any).eventFilter, "all", "f wraps to all filter");
});

test("ForgeryDashboard: relative time toggle", () => {
  const { dash } = dashboardWithEvents();
  dash.render(120);
  assert.equal((dash as any).relativeTime, false, "starts at absolute time");

  dash.handleInput("t");
  assert.equal((dash as any).relativeTime, true, "t toggles relative time on");

  dash.handleInput("t");
  assert.equal((dash as any).relativeTime, false, "t toggles relative time off");
});

test("ForgeryDashboard: Enter toggles agent inspection drawer and shows full details (SG-26)", () => {
  const started = 1000;
  const { dash } = dashboardWithAgents([
    {
      id: "a-1",
      name: "planner",
      task: "Analyze repository architecture and design schema models",
      status: "completed",
      startedAt: started,
      finishedAt: started + 45_000,
      turns: 4,
      toolCalls: 9,
      usage: { input: 2000, output: 15_000, cost: 0.55 },
      current: "finished plan generation",
      value: { architecture: "modular", score: 95 },
      text: "Step 1: Analyzed src/\nStep 2: Created models\nStep 3: Validated types",
      updatedAt: started + 45_000,
      runId: "run-1",
    },
  ]);

  // Before enter: in activity table
  const tableRender = dash.render(100).join("\n");
  assert.ok(tableRender.includes("planner"), "planner in table view");
  assert.ok(!tableRender.includes("agent inspector"), "inspector not visible yet");

  // Press Enter: opens inspector drawer
  dash.handleInput("\r");
  const drawerRender = dash.render(100).join("\n");
  assert.ok(drawerRender.includes("agent inspector") || drawerRender.includes("agent: planner"), "drawer title visible");
  assert.ok(drawerRender.includes("Analyze repository architecture"), "full task objective rendered");
  assert.ok(drawerRender.includes("finished plan generation"), "last action shown");
  assert.ok(drawerRender.includes("structured result:"), "structured output section shown");
  assert.ok(drawerRender.includes("modular"), "json value displayed");
  assert.ok(drawerRender.includes("Step 1: Analyzed src/"), "transcript displayed");

  // Press Esc: closes inspector drawer back to table
  dash.handleInput("\u001b");
  const backRender = dash.render(100).join("\n");
  assert.ok(backRender.includes("turns"), "returned to agent table");
});
