/**
 * pi-forgery — activity widget (above the editor).
 *
 * A compact box that auto-hides when idle and shows the active run's header
 * plus participant rows. Focus + expand reveals a 12-row activity transcript
 * of the focused participant.
 *
 * The widget is a *dumb* presenter: it only reads `snapshot: () =>
 * ForgerySnapshot`. The controller owns refresh.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import type { ForgeryAgentRecord, ForgerySnapshot, ForgerySubgoal } from "../activity/types";
import {
  agentRowCols,
  cols,
  colorSafe,
  colorStatus,
  frameAt,
  fit,
  formatCost,
  formatDuration,
  formatTokens,
  oneLine,
  panel,
  progressBar,
  renderStatus,
  safeText,
  statusGlyph,
  truncate,
} from "./format";

export const FORGERY_WIDGET_FOCUS_HINT = "focus + expand participant";
export const FORGERY_WIDGET_ACTIVITY_ROWS = 12;

/**
 * Rows the expanded activity pane may use, bounded to half the terminal.
 */
const WIDGET_TERMINAL_ROW_SHARE = 0.5;

export interface ForgeryWidgetInteraction {
  /** Expand the focused participant's transcript. */
  activity: (rowId: string, scroll: number) => string[] | undefined;
  /** Release focus back to the editor. */
  release: () => void;
  /** Ask the TUI to re-render. */
  requestRender: () => void;
}

export interface ForgeryWidgetRetention {
  /** ms after a run finishes that the widget stays visible. */
  retainMs?: number;
}

export class ForgeryWidget implements Component, Focusable {
  focused = false;
  /** Currently-expanded participant row id, if any. */
  expandedId?: string;
  /** Scroll lines back from the newest transcript line. */
  scroll = 0;
  /** The last rendered line array, hashed by `hasChanged()` to detect content changes. */
  #lastRendered: string[] = [];
  /** Width used by the last `render()` call, so `hasChanged()` compares at the same width. */
  #lastRenderWidth = 0;
  /** Whether spinners and transitions are animated. */
  #animations: boolean;
  /** Index into the last-rendered selectable rows (-1 = none). */
  selectedIndex = -1;
  /** The flat list of selectable rows from the last render, for handleInput. */
  #selectableRows: { id: string; type: "run" | "agent" | "subgoal" }[] = [];
  /** Whether the widget is currently visible (mounted but hidden internally, SG-21). */
  #visible = true;
  /** Whether the rendered content changed since last render (SG-21). */
  #dirty = true;
  /** Whether the rendered content changed since last render (SG-21). */
  get dirty(): boolean {
    return this.#dirty;
  }

  private theme: () => Theme;
  private snapshot: () => ForgerySnapshot;
  private maxRows: number;
  private retention?: ForgeryWidgetRetention;
  private interaction?: ForgeryWidgetInteraction;
  private clock: () => number;

  constructor(
    theme: () => Theme,
    snapshot: () => ForgerySnapshot,
    maxRows = 8,
    retention?: ForgeryWidgetRetention,
    interaction?: ForgeryWidgetInteraction,
    animations = true,
    clock = Date.now,
  ) {
    this.theme = theme;
    this.snapshot = snapshot;
    this.maxRows = maxRows;
    this.retention = retention;
    this.interaction = interaction;
    this.#animations = animations;
    this.clock = clock;
  }

  /** Show/hide the widget without mounting/unmounting (SG-21). */
  setVisible(v: boolean): void {
    this.#visible = v;
    if (v) this.#dirty = true;
  }

  /** Mark dirty if the snapshot's rendered content changed (SG-07 + SG-21). */
  update(snap: ForgerySnapshot): void {
    this.#dirty = this.#contentChanged(snap, this.#lastRenderWidth || this.#terminalWidth());
  }

  /** Build the selectable-row list and clamp the selection; returns the selected id. */
  #buildSelectableRows(snap: ForgerySnapshot): string | undefined {
    this.#selectableRows = [];
    const active = snap.runs.find((r) => r.status === "running");
    if (active) this.#selectableRows.push({ id: `run:${active.name}`, type: "run" });
    for (const a of snap.agents) this.#selectableRows.push({ id: a.id, type: "agent" });
    if (active) for (const s of active.subgoals) this.#selectableRows.push({ id: s.id, type: "subgoal" });
    // Clamp selection when rows disappear.
    if (this.selectedIndex >= this.#selectableRows.length) this.selectedIndex = -1;
    return this.#selectableRows[this.selectedIndex]?.id;
  }

  /** Whether the rendered content changed vs the last render (at terminal width). */
  #contentChanged(snap: ForgerySnapshot, width: number = this.#terminalWidth()): boolean {
    const theme = this.theme();
    const active = snap.runs.find((r) => r.status === "running");
    const frame = frameAt(this.clock());
    const maxRows = active
      ? Math.max(
          2,
          Math.min(this.maxRows, Math.floor((process.stdout.rows ?? 40) * WIDGET_TERMINAL_ROW_SHARE)),
        )
      : 1;
    const selectedId = this.#buildSelectableRows(snap);
    const lines = this.#cardLines(theme, snap, active, width, frame, maxRows, selectedId);
    return this.#linesHash(lines) !== this.#lastRenderedHash;
  }

  /** Whether the widget should be visible right now. */
  shouldShow(snapshot: ForgerySnapshot, retentionMs: number = 30_000): boolean {
    const active = snapshot.runs.find((r) => r.status === "running");
    if (active) return true;
    const finished = snapshot.runs[0];
    if (finished && finished.finishedAt && Date.now() - finished.finishedAt < retentionMs) return true;
    return snapshot.agents.some((a) => a.status === "running");
  }

  invalidate(): void {
    this.#lastRendered = [];
    this.#lastRenderedHash = "";
    this.#dirty = true;
  }

  hasChanged(): boolean {
    return this.#contentChanged(this.snapshot(), this.#lastRenderWidth || this.#terminalWidth());
  }

  /** Hash of the last rendered lines (updated by render/render). */
  #lastRenderedHash = "";

  #terminalWidth(): number {
    return Math.max(20, process.stdout.columns ?? 80);
  }

  #linesHash(lines: string[]): string {
    return JSON.stringify(lines);
  }

  handleInput(data: string): void {
    // Any input that moves selection or toggle expand dirties the render.
    this.#dirty = true;
    switch (data) {
      case "\u001b": // escape — collapse expanded, or release focus back to the editor
        if (this.expandedId) {
          this.expandedId = undefined;
          this.scroll = 0;
        } else {
          this.interaction?.release();
        }
        this.interaction?.requestRender();
        break;
      case "\r":
      case "\n": // Enter — toggle expand on the selected row
        this.scroll = 0;
        const selected = this.#selectableRows[this.selectedIndex];
        if (selected) {
          this.expandedId = this.expandedId === selected.id ? undefined : selected.id;
        }
        this.interaction?.requestRender();
        break;
      case "\u001b[A": // up
      case "k":
        this.scroll = 0;
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.interaction?.requestRender();
        break;
      case "\u001b[B": // down
      case "j":
        this.scroll = 0;
        this.selectedIndex = Math.min(
          this.#selectableRows.length - 1,
          this.selectedIndex + 1,
        );
        this.interaction?.requestRender();
        break;
    }
  }

  render(width: number): string[] {
    const snap = this.snapshot();
    const theme = this.theme();
    const active = snap.runs.find((r) => r.status === "running");
    const maxRows = active
      ? Math.max(
          2,
          Math.min(this.maxRows, Math.floor((process.stdout.rows ?? 40) * WIDGET_TERMINAL_ROW_SHARE)),
        )
      : 1;
    const frame = frameAt(this.clock());
    // Always build the selectable-row model so handleInput works even while
    // hidden; only render output when visible (SG-21).
    const selectedId = this.#buildSelectableRows(snap);
    if (!this.#visible) {
      this.#lastRendered = [];
      return [];
    }
    if (!this.#dirty) return this.#lastRendered;

    const lines = this.#cardLines(
      theme,
      snap,
      active,
      width,
      frame,
      maxRows,
      selectedId,
    );
    this.#lastRenderWidth = width;
    this.#lastRenderedHash = this.#linesHash(lines);
    this.#lastRendered = lines;
    this.#dirty = false;
    return lines;
  }

  /** Build the card (bordered when a run is active, plain idle line otherwise). */
  #cardLines(
    theme: Theme,
    snap: ForgerySnapshot,
    active: { name: string; startedAt: number; subgoals: ForgerySubgoal[] } | undefined,
    width: number,
    frame: number,
    maxRows: number,
    selectedId?: string,
  ): string[] {
    if (!active) {
      return [this.#idleLine(theme, width, snap)];
    }
    // Below 40 columns: drop borders, render flat lines that still fit.
    if (width < 40) {
      const flat = this.#cardBody(theme, snap, active, width, frame, maxRows, selectedId);
      return flat.map((l) => fit(l, width));
    }
    const header = this.#headerLine(theme, snap, active, width - 4, frame);
    const body = this.#cardBody(theme, snap, active, width - 4, frame, maxRows - 2, selectedId);
    const hint = this.focused
      ? fit(theme.fg("muted", `  ↑↓ select · ⏎ expand · esc back`), width - 4)
      : undefined;
    return panel(body, { title: header, bottom: hint });
  }

  /** Body lines of the card: agent rows then subgoal rows, bounded by maxRows. */
  #cardBody(
    theme: Theme,
    snap: ForgerySnapshot,
    active: { name: string; startedAt: number; subgoals: ForgerySubgoal[] },
    width: number,
    frame: number,
    maxRows: number,
    selectedId?: string,
  ): string[] {
    const lines: string[] = [];
    let remaining = maxRows;
    // Hint footer takes a row when focused; reserve it first.
    if (this.focused) remaining -= 1;
    const agentRows = this.#agentRows(theme, snap, width, frame, remaining, selectedId);
    if (agentRows.rows.length > 0) {
      lines.push(...agentRows.rows);
      remaining -= agentRows.rows.length;
      if (agentRows.more > 0 && remaining > 0) {
        lines.push(fit(theme.fg("muted", `  … +${agentRows.more} more (⏎ dashboard)`), width));
        remaining -= 1;
      }
    }
    if (remaining > 0) {
      const subgoalRows = this.#subgoalRows(theme, snap, active, width, frame, remaining, selectedId);
      if (subgoalRows.rows.length > 0) {
        lines.push(...subgoalRows.rows);
        remaining -= subgoalRows.rows.length;
      }
      if (subgoalRows.more > 0 && remaining > 0) {
        lines.push(fit(theme.fg("muted", `  … +${subgoalRows.more} more subgoals`), width));
        remaining -= 1;
      }
    }
    return lines;
  }

  // ── render pieces ──────────────────────────────────────────────────────

  #idleLine(theme: Theme, width: number, snap: ForgerySnapshot): string {
    const recent = snap.runs[0];
    if (recent) {
      const glyph = colorStatus(theme, recent.status);
      const detail = recent.error ? ` ${safeText(truncate(recent.error, 30))}` : "";
      return fit(
        ` ${glyph} ${theme.fg("muted", `forgery · ${recent.name} · ${recent.status}`)}${detail}`,
        width,
      );
    }
    return fit(` ${theme.fg("dim", "forgery · idle")}`, width);
  }

  #headerLine(
    theme: Theme,
    snap: ForgerySnapshot,
    active: { name: string; startedAt: number },
    width: number,
    frame: number,
  ): string {
    const totals = snap.activeTotals;
    const tokens = totals?.tokens ? ` ${formatTokens(totals.tokens)} tok` : "";
    const cost = totals?.cost ? ` ${formatCost(totals.cost)}` : "";
    const calls = totals ? ` ${totals.calls} calls` : "";
    const dur = active.startedAt ? ` ${formatDuration(snap.now - active.startedAt)}` : "";
    // Animated spinner while working; colored accent so "running" stands out.
    const glyph = renderStatus(theme, "running", frame, this.#animations);
    const line = ` ${glyph} ${theme.fg("text", theme.bold("forgery"))} ${theme.fg("muted", active.name)} ·${calls}${tokens}${cost}${dur}`;
    return fit(line, width);
  }

  #agentRows(
    theme: Theme,
    snap: ForgerySnapshot,
    width: number,
    frame: number,
    max: number,
    selectedId?: string,
  ): { rows: string[]; more: number } {
    // Build a parent→child tree so subagents render nested under their parent.
    const tree = this.#buildAgentTree(snap.agents);
    // Show only running/recent agents (top-level + their subagents), depth-first.
    const visible = tree.filter(({ agent }) => agent.status !== "completed" || agent.current);
    // Order: running → blocked/queued → failed → completed, most recent first within a group.
    const rank = (a: ForgeryAgentRecord): number => {
      switch (a.status) {
        case "running":
          return 0;
        case "queued":
          return 1;
        case "failed":
          return 2;
        default:
          return 3;
      }
    };
    const ordered = [...visible].sort(
      (a, b) => rank(a.agent) - rank(b.agent) || b.agent.updatedAt - a.agent.updatedAt,
    );
    const total = ordered.length;
    const shown = ordered.slice(0, max > 0 ? max : ordered.length);
    const rows = shown.map(({ agent, depth }) =>
      this.#agentRowCols(theme, agent, width, frame, depth, ordered.length, agent.id === selectedId),
    );
    const more = Math.max(0, total - shown.length);
    return { rows, more };
  }

  /** Render one agent as aligned columns: glyph · name · activity · calls · tokens · time. */
  #agentRowCols(
    theme: Theme,
    agent: ForgeryAgentRecord,
    width: number,
    frame: number,
    depth: number,
    _totalAgents: number,
    selected = false,
  ): string {
    return agentRowCols(theme, agent, width, frame, {
      depth,
      selected,
      animations: this.#animations,
      clock: () => this.clock(),
    });
  }

  /** Build a depth-first agent tree from the flat agent list, using parentId. */
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

  /** Expanded transcript pane for the focused row — content height, capped at `maxRows`. */
  #expandedPane(theme: Theme, width: number, maxRows: number): string[] {
    if (maxRows <= 0 || !this.expandedId) return [];
    const lines = this.interaction?.activity(this.expandedId, this.scroll) ?? [];
    if (lines.length === 0) return [];
    const body = lines.slice(0, maxRows).map((l) => fit(l, width));
    const divider = theme.fg("border", `── ${theme.bold(this.expandedId ?? "")} ──`);
    const bottom = theme.fg("border", "─".repeat(width));
    return [divider, ...body, bottom];
  }

  /** Subgoal tree for the active run — nested nodes with connectors + progress bars. */
  #subgoalRows(
    theme: Theme,
    snap: ForgerySnapshot,
    active: { subgoals: ForgerySubgoal[] },
    width: number,
    frame: number,
    max: number,
    selectedId?: string,
  ): { rows: string[]; more: number } {
    const subgoals = active.subgoals ?? [];
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
    const rows: string[] = [];
    const visited = new Set<string>();
    let shown = 0;
    const visit = (node: ForgerySubgoal, prefix: string, isLast: boolean): void => {
      if (shown >= max || visited.has(node.id)) return;
      visited.add(node.id);
      shown += 1;
      const connector = isLast ? "└─ " : "├─ ";
      const gutter = node.id === selectedId ? theme.fg("accent", "▌") : " ";
      const glyph = renderStatus(theme, node.status, frame, this.#animations);
      const bar = progressBar(node.completed, node.total, 5);
      const progress =
        node.total !== undefined && node.total > 0
          ? ` ${theme.fg("dim", `${bar} ${node.completed ?? 0}/${node.total}`)}`
          : "";
      const current = node.current ? ` ${theme.fg("dim", truncate(node.current, 32))}` : "";
      const line = `${prefix}${gutter} ${connector}${glyph} ${theme.fg("text", theme.bold(node.name))}${progress}${current}`;
      rows.push(fit(line, width - 2));
      const kids = children.get(node.id) ?? [];
      const kidsPrefix = prefix + (isLast ? "   " : "│  ");
      for (let i = 0; i < kids.length; i++) {
        if (shown >= max) break;
        visit(kids[i], kidsPrefix, i === kids.length - 1);
      }
    };
    for (let i = 0; i < roots.length; i++) {
      if (shown >= max) break;
      visit(roots[i], "", i === roots.length - 1);
    }
    const more = Math.max(0, subgoals.length - shown);
    return { rows, more };
  }
}
