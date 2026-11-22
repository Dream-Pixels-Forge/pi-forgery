/**
 * pi-forgery — /forgery dashboard modal.
 *
 * A full-screen overlay with two views:
 *   - Activity: phase panels + entity list, status filter, step between runs
 *   - Settings: the live host call registry + agent runner config
 *
 * Opened via `ctx.ui.custom(overlay, {overlay: true, overlayOptions})`. The
 * component is `Focusable` so it owns the keyboard while open; Esc closes.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  Focusable,
  KeybindingsManager,
  KeyId,
  TUI,
} from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type {
  ForgeryAgentRecord,
  ForgeryRun,
  ForgerySnapshot,
  ForgerySubgoal,
} from "../activity/types";
import {
  colorSafe,
  colorStatus,
  fit,
  formatCost,
  formatDuration,
  formatTokens,
  oneLine,
  safeText,
  statusGlyph,
  truncate,
  panel,
  cols,
  agentElapsed,
  renderStatus,
} from "./format";

type DashboardView = "activity" | "settings";

export interface ForgeryDashboardOptions {
  /** The live snapshot getter owned by the controller. */
  snapshot: () => ForgerySnapshot;
  /** Close the overlay. */
  done: () => void;
  /** Host calls exposed to forgery programs (settings view). */
  hostCalls: string[];
  /** Agent runner config (settings view). */
  agentConfig: { maxConcurrent: number; piBinary: string };
}

export class ForgeryDashboard implements Component, Focusable {
  focused = true;

  private tui: TUI;
  private theme: Theme;
  private keybindings: KeybindingsManager;
  private view: DashboardView = "activity";
  /** Status filter: all / active / completed / failed */
  private filter: "all" | "active" | "completed" | "failed" = "all";
  /** Which run index (most-recent = 0) is focused. */
  private runIndex = 0;
  /** Which entity row is focused within the activity view. */
  private entityIndex = 0;
  /** Whether the help overlay is open. */
  private helpOpen = false;
  private opts: ForgeryDashboardOptions;

  /** Declarative keymap — drives both handling and the help bar so they can't drift. */
  private static readonly KEYS: Array<{
    keys: KeyId[];
    label: string;
    run: (d: ForgeryDashboard) => void;
  }> = [
    { keys: ["left", "["], label: "prev run", run: (d) => d.prevRun() },
    { keys: ["right", "]"], label: "next run", run: (d) => d.nextRun() },
    { keys: ["up", "k"], label: "select up", run: (d) => d.move(-1) },
    { keys: ["down", "j"], label: "select down", run: (d) => d.move(1) },
    { keys: ["tab"], label: "filter", run: (d) => d.cycleFilter() },
    { keys: ["f"], label: "filter", run: (d) => d.cycleFilter() },
    { keys: ["enter"], label: "details", run: (d) => d.toggleDetails() },
    { keys: ["?"], label: "help", run: (d) => (d.helpOpen = !d.helpOpen) },
    { keys: ["escape", "q"], label: "close", run: (d) => d.closeOrBack() },
    { keys: ["1"], label: "activity", run: (d) => (d.view = "activity") },
    { keys: ["2"], label: "settings", run: (d) => (d.view = "settings") },
  ];

  constructor(
    tui: TUI,
    theme: Theme,
    keybindings: KeybindingsManager,
    opts: ForgeryDashboardOptions,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.opts = opts;
  }

  invalidate(): void {
    /* nothing to do — render is re-called by TUI on requestRender */
  }

  handleInput(data: string): void {
    if (this.helpOpen) {
      // Any key closes the help overlay.
      this.helpOpen = false;
      this.tui.requestRender();
      return;
    }
    const binding = ForgeryDashboard.KEYS.find((b) =>
      b.keys.some((k) => matchesKey(data, k)),
    );
    if (binding) {
      binding.run(this);
    }
    this.tui.requestRender();
  }

  /** Move to the previous run, resetting the entity selection. */
  prevRun(): void {
    const runs = this.opts.snapshot().runs;
    if (runs.length === 0) return;
    this.runIndex = Math.max(0, this.runIndex - 1);
    this.entityIndex = 0;
  }

  /** Move to the next run, resetting the entity selection. */
  nextRun(): void {
    const runs = this.opts.snapshot().runs;
    if (runs.length === 0) return;
    this.runIndex = Math.min(runs.length - 1, this.runIndex + 1);
    this.entityIndex = 0;
  }

  /** Move the entity selection up/down, clamped to the filtered list. */
  move(delta: number): void {
    const entities = this.#filteredAgents(this.opts.snapshot().agents, this.filter);
    this.entityIndex = Math.max(0, Math.min(entities.length - 1, this.entityIndex + delta));
  }

  /** Cycle the status filter, resetting the entity selection. */
  cycleFilter(): void {
    const order: Array<"all" | "active" | "completed" | "failed"> = [
      "all",
      "active",
      "completed",
      "failed",
    ];
    const i = order.indexOf(this.filter);
    this.filter = order[(i + 1) % order.length];
    this.entityIndex = 0;
  }

  /** Toggle details for the focused entity (no-op until a details pane exists). */
  toggleDetails(): void {
    // details pane is deferred to a later subgoal; keep the binding stable.
  }

  /** Go back one settings level, or close the overlay at the root. */
  closeOrBack(): void {
    if (this.view === "settings") {
      this.view = "activity";
    } else {
      this.opts.done();
    }
  }

  /** Help bar generated from the keymap, compacted to fit `width`. */
  #helpBar(width: number): string {
    const parts = ForgeryDashboard.KEYS
      .filter((b) => b.label)
      .map((b) => {
        const key = b.keys[0] === "escape" || b.keys[0] === "q" ? "esc" : String(b.keys[0]);
        return `${key}=${b.label}`;
      });
    const joined = parts.join("  ·  ");
    return fit(joined, width);
  }

  render(width: number): string[] {
    if (this.helpOpen) return this.#renderHelp(width);
    if (this.view === "settings") {
      return this.#renderSettings(width);
    }
    return this.#renderActivity(width);
  }

  /** Render the help overlay listing every keybinding. */
  #renderHelp(width: number): string[] {
    const theme = this.theme;
    const lines: string[] = [
      theme.fg("text", theme.bold("⌨ /forgery — keybindings")),
      theme.fg("dim", "press any key or esc to close"),
      "",
    ];
    const colW = Math.max(10, ...ForgeryDashboard.KEYS.map((b) => b.label.length));
    ForgeryDashboard.KEYS.forEach((b) => {
      const keys = b.keys.join("/");
      lines.push(`  ${theme.fg("muted", keys.padEnd(colW))}  ${b.label}`);
    });
    lines.push("", theme.fg("dim", "press any key or esc to close"));
    return panel(lines, { title: "keybindings" }).map((l) => fit(l, width));
  }

  #renderActivity(width: number): string[] {
    const snap = this.opts.snapshot();
    const theme = this.theme;
    const runs = snap.runs;
    const active = runs.find((r) => r.status === "running");
    // Clamp runIndex to the current run list and reset entity selection if needed.
    this.runIndex = Math.max(0, Math.min(runs.length - 1, this.runIndex));
    const focus = runs[this.runIndex] ?? active ?? runs[0];
    const header = fit(
      [
        theme.fg("text", theme.bold("⌗ /forgery")),
        ` ${theme.fg("muted", "dashboard")}`,
        ` ${theme.fg("dim", "1=activity 2=settings · f=filter · ? help · esc close")}`,
      ].join(""),
      width,
    );

    const lines: string[] = [header];
    lines.push(fit(this.#helpBar(width), width));
    lines.push("");

    if (!focus) {
      lines.push(theme.fg("dim", "no runs yet"));
      lines.push(theme.fg("dim", `host calls: ${this.opts.hostCalls.length} · agents: ${snap.agents.length}`));
      return this.#pad(lines, width, 24);
    }

    // Phase panels.
    for (const phase of focus.phases.slice(0, 12)) {
      const glyph = colorStatus(theme, phase.status);
      const progress =
        phase.total !== undefined && phase.current !== undefined
          ? ` ${phase.current}/${phase.total}`
          : "";
      lines.push(
        `  ${glyph} ${theme.fg("text", theme.bold(phase.name))}${theme.fg("dim", progress)}${theme.fg(
          "dim",
          ` · ${formatDuration((phase.finishedAt ?? snap.now) - phase.startedAt)}`,
        )}`,
      );
    }

    // Call list (most recent first).
    const calls = focus.calls.slice(Math.max(0, focus.calls.length - 12)).reverse();
    if (calls.length > 0) {
      lines.push("");
      lines.push(theme.fg("muted", `calls (${calls.length})`));
      calls.forEach((call) => {
        const prefix = " ";
        const glyph = colorStatus(theme, call.status);
        const refPart = theme.fg("text", call.ref);
        const labelPart = theme.fg("dim", truncate(call.label ?? "", 20));
        const statusPart = theme.fg("dim", ` · ${call.status}`);
        let extraPart = "";
        if (call.preview) {
          extraPart = ` ${theme.fg("dim", truncate(call.preview, 20))}`;
        } else if (call.error) {
          extraPart = ` ${theme.fg("error", truncate(call.error, 20))}`;
        }
        const line = `${prefix} ${glyph} ${refPart} ${labelPart}${statusPart}${extraPart}`;
        lines.push(line);
      });
    }

    // Entity list (agents) — aligned table reused from the widget column grid (SG-04).
    const entities = this.#filteredAgents(snap.agents, this.filter);
    const tree = this.#buildAgentTree(entities);
    lines.push("");
    lines.push(
      theme.fg("muted", `agents (${entities.length}) · filter: ${this.filter}`),
    );
    // Header row (dim), numeric columns right-aligned.
    const headerCells: Array<{ text: string; width: number; align?: "left" | "right" }> = [
      { text: theme.fg("dim", "⬤"), width: 2 },
      { text: theme.fg("dim", "name"), width: 16, align: "left" },
      { text: theme.fg("dim", "activity"), width: 1 },
      { text: theme.fg("dim", "turns"), width: 5, align: "right" },
      { text: theme.fg("dim", "calls"), width: 5, align: "right" },
      { text: theme.fg("dim", "tokens"), width: 6, align: "right" },
      { text: theme.fg("dim", "cost"), width: 6, align: "right" },
      { text: theme.fg("dim", "time"), width: 6, align: "right" },
    ];
    const hFixed =
      headerCells.reduce((s, c) => s + c.width, 0) + 1 * Math.max(0, headerCells.length - 1);
    headerCells[2].width = Math.max(3, width - hFixed);
    lines.push(theme.fg("dim", cols(headerCells, 1)));

    // Totals across visible agents.
    const totals = {
      turns: entities.reduce((s, a) => s + (a.turns ?? 0), 0),
      calls: entities.reduce((s, a) => s + (a.toolCalls ?? 0), 0),
      tokens: entities.reduce((s, a) => s + (a.usage?.output ?? 0), 0),
      cost: entities.reduce((s, a) => s + (a.usage?.cost ?? 0), 0),
    };
    const totalTime =
      entities.reduce(
        (s, a) => s + (agentElapsed(a, snap.now) ?? 0),
        0,
      );

    const frame = Math.floor(snap.now / 80) % 10;
    tree.forEach(({ agent, depth }, i) => {
      const isFocused = i === this.entityIndex;
      const gutter = isFocused ? theme.fg("accent", "▌") : " ";
      const indent = depth > 0 ? `${"  ".repeat(depth - 1)}└─ ` : "";
      const glyph =
        agent.status === "running"
          ? renderStatus(theme, agent.status, frame, true)
          : colorStatus(theme, agent.status);
      const name = theme.fg("text", theme.bold(`${indent}${agent.name}`));
      const activity = agent.current
        ? theme.fg("dim", oneLine(agent.current))
        : theme.fg("dim", "—");
      const turns = `t${agent.turns ?? 0}`;
      const calls = String(agent.toolCalls ?? 0);
      const tokens = agent.usage?.output !== undefined ? formatTokens(agent.usage.output) : "—";
      const cost = agent.usage?.cost !== undefined ? formatCost(agent.usage.cost) : "—";
      const elapsed = agentElapsed(agent, snap.now);
      const time = elapsed !== undefined ? formatDuration(elapsed) : "—";

      const cells: Array<{ text: string; width: number; align?: "left" | "right" }> = [
        { text: glyph, width: 2 },
        { text: name, width: 16 },
        { text: activity, width: 1 },
        { text: turns, width: 5, align: "right" },
        { text: calls, width: 5, align: "right" },
        { text: tokens, width: 6, align: "right" },
        { text: cost, width: 6, align: "right" },
        { text: time, width: 6, align: "right" },
      ];
      const fixed =
        cells.reduce((s, c) => s + c.width, 0) + 1 * Math.max(0, cells.length - 1);
      // Account for the gutter + space prefix (2 visible cols) so the row never overflows.
      cells[2].width = Math.max(3, width - 2 - fixed);
      let row = cols(cells, 1);
      if (agent.status === "completed") {
        row = theme.fg("muted", row);
      }
      lines.push(`${gutter} ${row}`);
    });

    // Totals row across visible agents.
    const totalsRow: Array<{ text: string; width: number; align?: "left" | "right" }> = [
      { text: "", width: 2 },
      { text: theme.fg("dim", `total ${entities.length}`), width: 16 },
      { text: "", width: 1 },
      { text: theme.fg("dim", `t${totals.turns}`), width: 5, align: "right" },
      { text: theme.fg("dim", totals.calls.toString()), width: 5, align: "right" },
      { text: theme.fg("dim", formatTokens(totals.tokens)), width: 6, align: "right" },
      { text: theme.fg("dim", formatCost(totals.cost)), width: 6, align: "right" },
      { text: theme.fg("dim", formatDuration(totalTime)), width: 6, align: "right" },
    ];
    const tFixed =
      totalsRow.reduce((s, c) => s + c.width, 0) + 1 * Math.max(0, totalsRow.length - 1);
    totalsRow[2].width = Math.max(3, width - tFixed);
    lines.push(theme.fg("dim", "─".repeat(width)));
    lines.push(cols(totalsRow, 1));

    // Subgoal list (subgoals of the focused run).
    const focusSubgoals = focus?.subgoals ?? [];
    if (focusSubgoals.length > 0) {
      lines.push("");
      lines.push(
        theme.fg(
          "muted",
          `subgoals (${focusSubgoals.filter((s) => s.status === "completed").length}/${focusSubgoals.length})`,
        ),
      );
      focusSubgoals.slice(0, 10).forEach((subgoal) => {
        const glyph = colorStatus(theme, subgoal.status);
        const progress =
          subgoal.total !== undefined && subgoal.completed !== undefined
            ? ` ${theme.fg("dim", `${subgoal.completed}/${subgoal.total}`)}`
            : "";
        const current = subgoal.current ? ` ${theme.fg("dim", truncate(subgoal.current, 28))}` : "";
        lines.push(
          `    ${glyph} ${theme.fg("text", theme.bold(subgoal.name))}${theme.fg("dim", ` · ${subgoal.status}`)}${progress}${current}`,
        );
      });
    }

    return this.#pad(lines, width, 24);
  }

  #renderSettings(width: number): string[] {
    const theme = this.theme;
    const lines: string[] = [
      theme.fg("text", theme.bold("⌘ forgery settings")),
      theme.fg("dim", "read-only · host call registry + agent runner config"),
      "",
      theme.fg("muted", "host calls exposed to forgery programs:"),
      ...this.opts.hostCalls.map((c) => `  ${theme.fg("toolTitle", c)}`),
      "",
      theme.fg("muted", "agent runner:"),
      `  pi binary   ${theme.fg("text", this.opts.agentConfig.piBinary)}`,
      `  concurrency ${theme.fg("text", String(this.opts.agentConfig.maxConcurrent))}`,
      "",
      theme.fg("dim", "press 1 to return to activity, esc to close"),
    ];
    return this.#pad(lines, width, 24);
  }

  #filteredAgents(agents: ForgeryAgentRecord[], filter: "all" | "active" | "completed" | "failed"): ForgeryAgentRecord[] {
    if (filter === "all") return agents;
    switch (filter) {
      case "active":
        return agents.filter((a) => a.status === "running" || a.status === "queued");
      case "completed":
        return agents.filter((a) => a.status === "completed");
      case "failed":
        return agents.filter((a) => a.status === "failed" || a.status === "stopped" || a.status === "timed_out");
      default:
        return agents;
    }
  }

  /** Build a depth-first agent tree from a flat list, using parentId for nesting. */
  #buildAgentTree(
    agents: ForgeryAgentRecord[],
  ): { agent: ForgeryAgentRecord; depth: number }[] {
    const byId = new Map(agents.map((a) => [a.id, a]));
    const children = new Map<string, ForgeryAgentRecord[]>();
    const roots: ForgeryAgentRecord[] = [];
    for (const a of agents) {
      if (a.parentId && byId.has(a.parentId)) {
        const kids = children.get(a.parentId) ?? [];
        kids.push(a);
        children.set(a.parentId, kids);
      } else {
        roots.push(a);
      }
    }
    const result: { agent: ForgeryAgentRecord; depth: number }[] = [];
    const visit = (agent: ForgeryAgentRecord, depth: number): void => {
      result.push({ agent, depth });
      const kids = children.get(agent.id) ?? [];
      for (const kid of kids) visit(kid, depth + 1);
    };
    for (const root of roots) visit(root, 0);
    return result;
  }

  #pad(lines: string[], width: number, maxRows: number): string[] {
    const body = lines.slice(0, maxRows).map((l) => truncateToWidth(l, width, "…"));
    while (body.length < maxRows) body.push("");
    return body;
  }
}
