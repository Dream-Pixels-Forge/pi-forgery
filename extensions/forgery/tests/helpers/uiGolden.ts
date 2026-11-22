/**
 * pi-forgery — golden render test helpers (SG-25).
 *
 * Renders each UI surface (widget, footer, dashboard) for a set of canned
 * scenarios at fixed widths. Fixtures live under `tests/fixtures/ui/`.
 *
 * `UPDATE_GOLDEN=1 npx tsx --test tests/ui-golden.test.ts` regenerates all
 * fixtures. Widths are measured with fake-theme tags stripped so snapshots
 * stay width-safe across terminals.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  ForgeryActivityStore,
  type ForgerySnapshot,
} from "../../src/activity/store.js";
import { ForgeryFooter, type ForgeryFooterContext } from "../../src/ui/footer.js";
import { ForgeryWidget, type ForgeryWidgetInteraction } from "../../src/ui/widget.js";
import { ForgeryDashboard } from "../../src/ui/dashboard.js";
import { icons, type UiStatus } from "../../src/ui/format.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "ui",
);
export const NOW = 1_700_000_000_000; // fixed clock for deterministic renders (SG-14)
export const UPDATE = process.env.UPDATE_GOLDEN === "1";

/** Fake theme: emits real ANSI escapes so pi-tui's width helpers strip them
 *  correctly. Widths are measured with ANSI removed. */
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
export function stubTheme(): Theme {
  return {
    fg: (color: string, text: string) => `\x1b[${ANSI[color] ?? "0"}m${text}\x1b[0m`,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    italic: (text: string) => `\x1b[3m${text}\x1b[0m`,
    underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
    inverse: (text: string) => `\x1b[7m${text}\x1b[0m`,
    strikethrough: (text: string) => `\x1b[9m${text}\x1b[0m`,
  } as unknown as Theme;
}

/** Strip ANSI escapes so visible width can be measured. */
export function stripTheme(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Build the activity store + footer context for a scenario. */
export function scenario(snapName: string): { snap: ForgerySnapshot; ctx: ForgeryFooterContext } {
  const store = new ForgeryActivityStore();
  const ctx: ForgeryFooterContext = {
    gitBranch: () => "main",
    contextUsage: () => ({ tokens: 21_300, contextWindow: 32_000, percent: 42 }),
    modelId: () => "anthropic/claude-opus-5-5-20261001",
    effort: () => "medium",
    ciStatus: () => null,
  };
  const now = NOW;

  switch (snapName) {
    case "idle":
      // no runs, no agents
      break;

    case "one-running-agent": {
      store.start("run-1", { name: "demo" });
      store.addAgent({
        id: "a1",
        name: "planner",
        task: "planning",
        status: "running",
        runId: "run-1",
        startedAt: now,
        updatedAt: now,
        current: "reading src/auth.ts",
      });
      break;
    }

    case "five-mixed-agents": {
      store.start("run-1", { name: "demo" });
      const statuses: UiStatus[] = ["running", "completed", "failed", "queued", "blocked"];
      statuses.forEach((status, i) => {
        store.addAgent({
          id: `agent-${i}`,
          name: `agent-${i}`,
          task: "task",
          status,
          runId: "run-1",
          startedAt: now,
          updatedAt: now,
          current: status === "running" ? "working" : undefined,
          turns: i + 1,
          toolCalls: (i + 1) * 2,
        });
      });
      break;
    }

    case "failed-run": {
      store.start("run-1", { name: "demo" });
      store.finish("run-1", false, "boom");
      store.addAgent({
        id: "a1",
        name: "tester",
        task: "test",
        status: "failed",
        runId: "run-1",
        startedAt: now,
        updatedAt: now,
        error: "exit 1: 2 failing",
      });
      break;
    }

    case "subgoal-tree": {
      store.start("run-1", { name: "demo" });
      store.subgoal({ goalId: "run-1", name: "schema migration", status: "completed", total: 3, completed: 3 });
      const sg2 = store.subgoal({
        goalId: "run-1",
        name: "login route",
        status: "running",
        total: 5,
        completed: 3,
      });
      store.subgoal({ goalId: "run-1", name: "handler", parentSubgoalId: sg2.id, status: "completed" });
      store.subgoal({ goalId: "run-1", name: "rate-limit", parentSubgoalId: sg2.id, status: "queued" });
      store.subgoal({ goalId: "run-1", name: "e2e tests", status: "blocked" });
      break;
    }

    case "long-task-name": {
      store.start("run-1", { name: "demo" });
      store.addAgent({
        id: "a1",
        name: "planner",
        task: "planning",
        status: "running",
        runId: "run-1",
        startedAt: now,
        updatedAt: now,
        current:
          "reading src/auth/session/token/handler/middleware/logger/validator/parser/builder.rs",
      });
      break;
    }

    default:
      throw new Error(`unknown scenario: ${snapName}`);
  }

  // Normalize all timestamps to a fixed clock so golden renders are
  // deterministic across runs (spinner frames, durations, etc.).
  const snap = store.snapshot();
  snap.now = NOW;
  for (const run of snap.runs) {
    run.startedAt = NOW;
    run.updatedAt = NOW;
    if (run.finishedAt) run.finishedAt = NOW;
    for (const call of run.calls) {
      if (call.startedAt) call.startedAt = NOW;
      if (call.finishedAt) call.finishedAt = NOW;
    }
    for (const sg of run.subgoals) {
      if (sg.startedAt) sg.startedAt = NOW;
      sg.updatedAt = NOW;
      if (sg.finishedAt) sg.finishedAt = NOW;
    }
  }
  for (const agent of snap.agents) {
    agent.startedAt = NOW;
    agent.updatedAt = NOW;
    if (agent.finishedAt) agent.finishedAt = NOW;
  }

  return { snap, ctx };
}

export const SCENARIOS: string[] = [
  "idle",
  "one-running-agent",
  "five-mixed-agents",
  "failed-run",
  "subgoal-tree",
  "long-task-name",
];

export const WIDTHS: number[] = [40, 80, 120];

/** Render a surface for a scenario at a width. */
export function renderSurface(
  surface: "widget" | "footer" | "dashboard",
  snap: ForgerySnapshot,
  ctx: ForgeryFooterContext,
  width: number,
): string[] {
  const theme = stubTheme();
  const clock = () => NOW;
  const iconSet = icons("unicode");
  switch (surface) {
    case "widget": {
      const widget = new ForgeryWidget(
        () => theme,
        () => snap,
        8,
        { retainMs: 30_000 },
        {
          activity: () => ["line 1", "line 2"],
          release: () => {},
          requestRender: () => {},
        },
        true,
        clock,
      );
      return widget.render(width);
    }
    case "footer": {
      const footer = new ForgeryFooter(() => theme, () => snap, ctx, true, clock);
      return footer.render(width);
    }
    case "dashboard": {
      const dash = new ForgeryDashboard(
        { requestRender: () => {} },
        theme,
        {} as never,
        {
          snapshot: () => snap,
          done: () => {},
          hostCalls: ["pi.read", "agents.run"],
          agentConfig: { maxConcurrent: 4, piBinary: "pi" },
        },
      );
      return dash.render(width);
    }
  }
}

/** Golden fixture path. */
export function fixturePath(surface: string, scenario: string, width: number): string {
  return path.join(FIXTURE_DIR, `${surface}-${scenario}-${width}.txt`);
}

/** Read or write a golden fixture. */
export function golden(
  surface: string,
  scenario: string,
  width: number,
  content?: string,
): string | undefined {
  const file = fixturePath(surface, scenario, width);
  if (content !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return content;
  }
  if (!fs.existsSync(file)) return undefined;
  return fs.readFileSync(file, "utf8");
}
