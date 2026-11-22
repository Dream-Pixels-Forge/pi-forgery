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

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
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
  ForgeryEvent,
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
  vw,
  progressBar,
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
  /** Available terminal rows (used for height-aware layout). */
  rows?: number;
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
  /** Scroll offset within the focused pane's entity list. */
  private scrollOffset = 0;
  /** Whether the help overlay is open. */
  private helpOpen = false;
  /** Available terminal rows (for height-aware layout). */
  private rows = 24;
  /** Event timeline filter: all / errors / agents / phases. */
  private eventFilter: "all" | "errors" | "agents" | "phases" = "all";
  /** Show relative time (+42s) instead of clock time in events. */
  private relativeTime = false;
  /** Scroll offset within the events timeline. */
  private eventScrollOffset = 0;
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
    { keys: ["enter"], label: "details", run: (d) => d.toggleDetails() },
    { keys: ["?"], label: "help", run: (d) => (d.helpOpen = !d.helpOpen) },
    { keys: ["escape", "q"], label: "close", run: (d) => d.closeOrBack() },
    { keys: ["1"], label: "activity", run: (d) => (d.view = "activity") },
    { keys: ["2"], label: "settings", run: (d) => (d.view = "settings") },
    { keys: ["pageUp"], label: "page up", run: (d) => d.scrollPage(-1) },
    { keys: ["pageDown"], label: "page down", run: (d) => d.scrollPage(1) },
    { keys: ["home"], label: "top", run: (d) => d.scrollTop() },
    { keys: ["end"], label: "bottom", run: (d) => d.scrollBottom() },
    { keys: ["t"], label: "relative time", run: (d) => d.toggleRelativeTime() },
    { keys: ["f"], label: "event filter", run: (d) => d.cycleEventFilter() },
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
    this.rows = opts.rows ?? 24;
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

  /** Cycle the event timeline filter: all → errors → agents → phases. */
  cycleEventFilter(): void {
    const order: Array<"all" | "errors" | "agents" | "phases"> = [
      "all",
      "errors",
      "agents",
      "phases",
    ];
    const i = order.indexOf(this.eventFilter);
    this.eventFilter = order[(i + 1) % order.length];
  }

  /** Toggle between absolute and relative time in the events timeline. */
  toggleRelativeTime(): void {
    this.relativeTime = !this.relativeTime;
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
    this.runIndex = Math.max(0, Math.min(runs.length - 1, this.runIndex));
    const focus = runs[this.runIndex] ?? active ?? runs[0];

    const lines: string[] = [];

    // Tab bar: every run, active highlighted with ‹ ›.
    lines.push(...this.#renderTabBar(width, runs, this.runIndex, theme, snap));
    lines.push("");

    if (!focus) {
      lines.push(theme.fg("dim", "no runs yet"));
      lines.push(theme.fg("dim", `host calls: ${this.opts.hostCalls.length} · agents: ${snap.agents.length}`));
      return panel(lines, { title: "⌗ /forgery" }).map((l) => fit(l, width));
    }

    // Summary block: goal, progress bar, agent counts, tokens, cost.
    lines.push(...this.#renderSummary(width, focus, snap, theme));
    lines.push("");

    // Body: agents then subgoals, stacked.
    const frame = Math.floor(snap.now / 80) % 10;
    const agents = snap.agents.filter((a) => a.runId === focus.id);
    const subgoals = focus.subgoals ?? [];

    const agentLines = this.#renderAgentLines(
      agents,
      theme,
      frame,
      this.entityIndex,
      snap,
      width,
    );
    const subgoalLines = this.#renderSubgoalLines(subgoals, theme, frame);

    // Height-aware layout: compute rows available for panes after header/summary.
    const headerLines = this.#renderTabBar(width, runs, this.runIndex, theme, snap).length + 1;
    const summaryLines = this.#renderSummary(width, focus, snap, theme).length + 1;
    const hintLines = 1;
    const paneRows = Math.max(3, this.rows - headerLines - summaryLines - hintLines - 2);

    const agentScroll = this.#scrollPane(agentLines, paneRows);
    const subgoalScroll = this.#scrollPane(subgoalLines, paneRows);
    lines.push(...agentScroll);
    if (agentScroll.length > 0 && subgoalScroll.length > 0) lines.push("");
    lines.push(...subgoalScroll);
    if (agentScroll.length < agentLines.length) {
      lines.push(theme.fg("muted", `  ↓ ${agentLines.length - agentScroll.length} more`));
    }
    if (subgoalScroll.length < subgoalLines.length) {
      lines.push(theme.fg("muted", `  ↓ ${subgoalLines.length - subgoalScroll.length} more`));
    }

    // Events pane (most recent events).
    const eventLines = this.#renderEvents(width, focus, snap, theme);
    if (eventLines.length > 0) {
      lines.push("");
      lines.push(...eventLines);
    }

    // Items pane (deliverables/artifacts produced by the run).
    const itemLines = this.#renderItems(width, focus, snap, theme);
    if (itemLines.length > 0) {
      lines.push("");
      lines.push(...itemLines);
    }

    const hint = theme.fg(
      "muted",
      `tab panes · ←→ runs · ↑↓ select · ⏎ details · ? help · esc close`,
    );
    return panel(lines, { title: "⌗ /forgery", bottom: fit(hint, width - 4) }).map((l) =>
      fit(l, width),
    );
  }

  /** Tab bar: every run, active highlighted with ‹ › and a status glyph. */
  #renderTabBar(
    width: number,
    runs: ForgeryRun[],
    runIndex: number,
    theme: Theme,
    snap: ForgerySnapshot,
  ): string[] {
    const shown = runs.slice(0, 6);
    const parts: string[] = [];
    shown.forEach((run, i) => {
      const isActive = i === runIndex;
      const glyph = colorStatus(theme, run.status);
      const name = theme.fg("text", theme.bold(run.name));
      if (isActive) {
        parts.push(theme.fg("accent", `‹ ${glyph} ${name} ›`));
      } else {
        parts.push(theme.fg("dim", `${glyph} ${name}`));
      }
    });
    const left = parts.join("  ");

    // Active run status on the right.
    const activeRun = runs.find((r) => r.status === "running");
    let right = "";
    if (activeRun) {
      const glyph = renderStatus(theme, "running", Math.floor(snap.now / 80) % 10, true);
      right = `${glyph} ${formatDuration(snap.now - activeRun.startedAt)}`;
    }
    const rightWidth = vw(right);
    const leftWidth = vw(left);
    const gap = Math.max(1, width - leftWidth - rightWidth);
    return [left + " ".repeat(gap) + right];
  }

  /** Summary block: goal, progress bar, agent counts, tokens, cost. */
  #renderSummary(
    width: number,
    focus: ForgeryRun,
    snap: ForgerySnapshot,
    theme: Theme,
  ): string[] {
    const lines: string[] = [];
    const subgoals = focus.subgoals ?? [];
    const completed = subgoals.filter((s) => s.status === "completed").length;
    const total = subgoals.length;
    const bar = progressBar(completed, total > 0 ? total : undefined, 10);
    const agents = snap.agents.filter((a) => a.runId === focus.id);
    const running = agents.filter((a) => a.status === "running").length;
    const completedAgents = agents.filter((a) => a.status === "completed").length;
    const failed = agents.filter(
      (a) =>
        a.status === "failed" || a.status === "stopped" || a.status === "timed_out",
    ).length;
    const tokens = snap.activeTotals?.tokens ?? 0;
    const cost = snap.activeTotals?.cost ?? 0;

    lines.push(theme.fg("muted", `goal  ${focus.name ?? "untitled"}`));
    lines.push(
      theme.fg(
        "dim",
        `${bar} ${completed}/${total} subgoals · ${agents.length} agents (${
          running
        }⠹ ${completedAgents}✓ ${failed}✗) · ${formatTokens(tokens)} · ${formatCost(cost)}`,
      ),
    );
    return lines;
  }

  /** Agent table rows (reuses the widget column grid, SG-04). */
  #renderAgentLines(
    agents: ForgeryAgentRecord[],
    theme: Theme,
    frame: number,
    entityIndex: number,
    snap: ForgerySnapshot,
    width: number,
  ): string[] {
    const lines: string[] = [];
    const headerCells: Array<{ text: string; width: number; align?: "left" | "right" }> = [
      { text: theme.fg("dim", "⬤"), width: 2 },
      { text: theme.fg("dim", "name"), width: 14, align: "left" },
      { text: theme.fg("dim", "activity"), width: 1 },
      { text: theme.fg("dim", "turns"), width: 5, align: "right" },
      { text: theme.fg("dim", "calls"), width: 5, align: "right" },
      { text: theme.fg("dim", "tokens"), width: 6, align: "right" },
      { text: theme.fg("dim", "cost"), width: 6, align: "right" },
      { text: theme.fg("dim", "time"), width: 6, align: "right" },
    ];
    const hFixed =
      headerCells.reduce((s, c) => s + c.width, 0) + 1 * Math.max(0, headerCells.length - 1);
    lines.push(theme.fg("dim", cols(headerCells, 1)));

    const tree = this.#buildAgentTree(agents);
    const frameSpinner = Math.floor(snap.now / 80) % 10;
    tree.forEach(({ agent, depth }, i) => {
      const isFocused = i === entityIndex;
      const gutter = isFocused ? theme.fg("accent", "▌") : " ";
      const indent = depth > 0 ? `${"  ".repeat(depth - 1)}└─ ` : "";
      const glyph =
        agent.status === "running"
          ? renderStatus(theme, agent.status, frameSpinner, true)
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
        { text: name, width: 14 },
        { text: activity, width: 1 },
        { text: turns, width: 5, align: "right" },
        { text: calls, width: 5, align: "right" },
        { text: tokens, width: 6, align: "right" },
        { text: cost, width: 6, align: "right" },
        { text: time, width: 6, align: "right" },
      ];
      const fixed =
        cells.reduce((s, c) => s + c.width, 0) + 1 * Math.max(0, cells.length - 1);
      cells[2].width = Math.max(3, width - fixed);
      let row = cols(cells, 1);
      if (agent.status === "completed") {
        row = theme.fg("muted", row);
      }
      lines.push(`${gutter} ${row}`);
    });
    return lines;
  }

  /** Subgoal rows (reuses the widget subgoal styling, SG-05). */
  #renderSubgoalLines(
    subgoals: ForgerySubgoal[],
    theme: Theme,
    frame: number,
  ): string[] {
    const lines: string[] = [];
    const byId = new Map(subgoals.map((s) => [s.id, s]));
    const children = new Map<string, ForgerySubgoal[]>();
    const roots: ForgerySubgoal[] = [];
    for (const s of subgoals) {
      if (s.parentSubgoalId && byId.has(s.parentSubgoalId)) {
        const kids = children.get(s.parentSubgoalId) ?? [];
        kids.push(s);
        children.set(s.parentSubgoalId, kids);
      } else {
        roots.push(s);
      }
    }
    let shownCount = 0;
    const visited = new Set<string>();
    const visit = (node: ForgerySubgoal, prefix: string, isLast: boolean): void => {
      if (shownCount >= 10 || visited.has(node.id)) return;
      visited.add(node.id);
      shownCount += 1;
      const connector = isLast ? "└─ " : "├─ ";
      const glyph = renderStatus(theme, node.status, frame, true);
      const bar = progressBar(node.completed, node.total, 5);
      const progress =
        node.total !== undefined && node.total > 0
          ? ` ${theme.fg("dim", `${bar} ${node.completed ?? 0}/${node.total}`)}`
          : "";
      const current = node.current ? ` ${theme.fg("dim", truncate(node.current, 28))}` : "";
      lines.push(
        `${prefix}${connector}${glyph} ${theme.fg("text", theme.bold(node.name))}${progress}${current}`,
      );
      const kids = children.get(node.id) ?? [];
      const kidsPrefix = prefix + (isLast ? "   " : "│  ");
      for (let i = 0; i < kids.length; i++) {
        if (shownCount >= 10) break;
        visit(kids[i], kidsPrefix, i === kids.length - 1);
      }
    };
    for (let i = 0; i < roots.length; i++) {
      if (shownCount >= 10) break;
      visit(roots[i], "", i === roots.length - 1);
    }
    return lines;
  }

  /** Events pane: reverse-chronological, scrollable timeline. */
  #renderEvents(
    width: number,
    focus: ForgeryRun,
    snap: ForgerySnapshot,
    theme: Theme,
  ): string[] {
    const lines: string[] = [];
    const events = [...focus.events]
      .filter((e) => this.#eventPassesFilter(e))
      .reverse()
      .slice(0, 20);
    if (events.length === 0) return lines;
    lines.push(theme.fg("muted", `events (${focus.events.length})`));
    const scroll = this.#scrollPane(
      events.map((e) => this.#renderEventLine(e, theme, snap.now)),
      this.rows - 4,
    );
    lines.push(...scroll);
    return lines;
  }

  /** Render a single event line. */
  #renderEventLine(event: ForgeryEvent, theme: Theme, now: number): string {
    const time = new Date(event.createdAt).toTimeString().slice(0, 5);
    const { glyph, color } = this.#eventGlyphColor(event.level);
    const timePart = this.relativeTime ? this.#relativeTime(event.createdAt, now) : time;
    return `  ${theme.fg(color, glyph)} ${theme.fg("dim", timePart)} ${theme.fg("text", event.message)}`;
  }

  /** Glyph + color for an event level. */
  #eventGlyphColor(level: string): { glyph: string; color: ThemeColor } {
    switch (level) {
      case "error":
        return { glyph: "✗", color: "error" };
      case "success":
        return { glyph: "✓", color: "success" };
      case "warning":
        return { glyph: "⚠", color: "warning" };
      case "info":
      default:
        return { glyph: "▸", color: "accent" };
    }
  }

  /** Glyph + color for an item kind. */
  #itemGlyphColor(kind: string): { glyph: string; color: ThemeColor } {
    switch (kind) {
      case "tool":
        return { glyph: "▶", color: "accent" };
      case "agent":
        return { glyph: "🤖", color: "muted" };
      case "extension":
        return { glyph: "⚙", color: "dim" };
      case "custom":
      default:
        return { glyph: "•", color: "muted" };
    }
  }

  /** Filter events by the current eventFilter. */
  #eventPassesFilter(event: ForgeryEvent): boolean {
    if (this.eventFilter === "all") return true;
    if (this.eventFilter === "errors") return event.level === "error";
    if (this.eventFilter === "agents") return event.message.includes("agent");
    if (this.eventFilter === "phases") return event.message.includes("phase");
    return true;
  }

  /** Items pane: deliverables/artifacts produced by the run. */
  #renderItems(
    width: number,
    focus: ForgeryRun,
    snap: ForgerySnapshot,
    theme: Theme,
  ): string[] {
    const lines: string[] = [];
    const items = focus.items;
    if (items.length === 0) return lines;
    lines.push(theme.fg("muted", `items (${items.length})`));
    items.slice(0, 10).forEach((item) => {
      const { glyph, color } = this.#itemGlyphColor(item.kind);
      const time = item.updatedAt ? new Date(item.updatedAt).toTimeString().slice(0, 5) : "";
      const progress =
        item.total !== undefined && item.completed !== undefined
          ? ` ${theme.fg("dim", `${item.completed}/${item.total}`)}`
          : "";
      lines.push(
        `  ${theme.fg(color, glyph)} ${theme.fg("dim", time)} ${theme.fg("text", item.label)}${progress}`,
      );
    });
    return lines;
  }

  /** Render relative time (+42s) from a timestamp. */
  #relativeTime(createdAt: number, now: number): string {
    const diff = now - createdAt;
    if (diff < 0) return `+0s`;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `+${s}s`;
    const m = Math.floor(s / 60);
    return `+${m}m${s % 60}s`;
  }

  /** Scroll a list of rendered lines to fit `height` rows, applying `this.scrollOffset`.
   *  Returns the visible slice and keeps `this.scrollOffset` clamped. */
  #scrollPane(lines: string[], height: number): string[] {
    const maxOffset = Math.max(0, lines.length - height);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
    return lines.slice(this.scrollOffset, this.scrollOffset + height);
  }

  /** Scroll the focused pane by `rows` (positive = down). */
  scrollPage(rows: number = 1): void {
    this.scrollOffset += rows;
  }

  /** Scroll to the top of the focused pane. */
  scrollTop(): void {
    this.scrollOffset = 0;
  }

  /** Scroll to the bottom of the focused pane. */
  scrollBottom(): void {
    this.scrollOffset = Number.MAX_SAFE_INTEGER;
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

/** A seek-safe scrolling viewport: keeps a selection visible within a fixed
 *  number of rows, with scroll indicators. Reused by the widget transcript
 *  (SG-22) and the dashboard panes. */
export class ScrollView {
  private offset = 0;
  constructor(
    /** Items to render. */
    readonly items: string[],
    /** Number of rows available. */
    readonly height: number,
    /** Index of the selected item. */
    public selectedIndex = 0,
  ) {}

  /** Number of items not visible above the fold. */
  get above(): number {
    return Math.max(0, this.offset);
  }
  /** Number of items not visible below the fold. */
  get below(): number {
    return Math.max(0, this.items.length - this.offset - this.height);
  }
  /** Whether anything is scrolled above the fold. */
  get canScrollUp(): boolean {
    return this.offset > 0;
  }
  /** Whether anything is scrolled below the fold. */
  get canScrollDown(): boolean {
    return this.offset < Math.max(0, this.items.length - this.height);
  }

  /** Scroll so that the given index is visible, clamping the offset. */
  reveal(index: number): void {
    if (index < 0) index = 0;
    if (index >= this.items.length) index = this.items.length - 1;
    if (index < this.offset) this.offset = index;
    else if (index >= this.offset + this.height) this.offset = index - this.height + 1;
    this.selectedIndex = index;
  }

  /** Scroll up/down by n rows, keeping the selection visible. */
  scrollBy(delta: number): void {
    this.selectedIndex = Math.max(0, Math.min(this.items.length - 1, this.selectedIndex + delta));
    this.reveal(this.selectedIndex);
  }

  /** Page up/down by roughly a page. */
  page(delta: number): void {
    this.scrollBy(delta * Math.max(1, this.height - 1));
  }

  /** Visible slice of items, ready to render. */
  visible(): string[] {
    return this.items.slice(this.offset, this.offset + this.height);
  }
}

