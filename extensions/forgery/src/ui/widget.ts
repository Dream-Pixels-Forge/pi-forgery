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
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ForgeryAgentRecord, ForgerySnapshot, ForgerySubgoal } from "../activity/types";
import {
  animatedStatusGlyph,
  colorSafe,
  colorStatus,
  formatCost,
  formatDuration,
  formatTokens,
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
  /** Last rendered row count, used to detect "changed" for invalidation. */
  #lastRows = 0;
  /** Frame counter used to animate the "working" spinner while a run is active. */
  #frame = 0;

  private theme: () => Theme;
  private snapshot: () => ForgerySnapshot;
  private maxRows: number;
  private retention?: ForgeryWidgetRetention;
  private interaction?: ForgeryWidgetInteraction;

  constructor(
    theme: () => Theme,
    snapshot: () => ForgerySnapshot,
    maxRows = 8,
    retention?: ForgeryWidgetRetention,
    interaction?: ForgeryWidgetInteraction,
  ) {
    this.theme = theme;
    this.snapshot = snapshot;
    this.maxRows = maxRows;
    this.retention = retention;
    this.interaction = interaction;
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
    this.#lastRows = 0;
  }

  hasChanged(): boolean {
    const snap = this.snapshot();
    const active = snap.runs.find((r) => r.status === "running");
    const rows = active ? 2 : 1;
    return this.#lastRows !== rows;
  }

  handleInput(data: string): void {
    switch (data) {
      case "\u001b": // escape — release focus, collapse expanded
        this.expandedId = undefined;
        this.scroll = 0;
        this.interaction?.release();
        this.interaction?.requestRender();
        break;
      case "\r":
      case "\n":
        // Enter expands the focused participant.
        this.scroll = 0;
        this.interaction?.requestRender();
        break;
      case "\u001b[A": // up
      case "k":
        this.scroll = Math.max(0, this.scroll - 1);
        this.interaction?.requestRender();
        break;
      case "\u001b[B": // down
      case "j":
        this.scroll = this.scroll + 1;
        this.interaction?.requestRender();
        break;
    }
  }

  render(width: number): string[] {
    const snap = this.snapshot();
    const theme = this.theme();
    const active = snap.runs.find((r) => r.status === "running");
    const maxRows = Math.max(2, Math.min(this.maxRows, Math.floor((process.stdout.rows ?? 40) * WIDGET_TERMINAL_ROW_SHARE)));

    if (!active) {
      this.#lastRows = 1;
      return [this.#idleLine(theme, width, snap)];
    }

    // Advance the spinner frame on every render while a run is active.
    this.#frame += 1;

    // Header line.
    const header = this.#headerLine(theme, snap, active, width, this.#frame);

    // Participant rows (active agents).
    const agents = this.#participantRows(theme, snap, width, Math.max(0, maxRows - 1 - (this.expandedId ? 0 : 0)), this.#frame);

    // Subgoal rows (subgoals of the active run).
    const subgoals = this.#subgoalRows(theme, snap, active, width, this.#frame);

    // Expanded transcript pane.
    if (this.expandedId) {
      const lines = this.interaction?.activity(this.expandedId, this.scroll) ?? [];
      if (lines.length > 0) {
        const divider = theme.fg("border", `── ${theme.bold(this.expandedId)} ──`);
        const body = lines.slice(0, FORGERY_WIDGET_ACTIVITY_ROWS).map((l) => truncateToWidth(l, width));
        const pad = Math.max(0, FORGERY_WIDGET_ACTIVITY_ROWS - body.length);
        const withPadding = [...body, ...Array(pad).fill("")];
        this.#lastRows = 1 + agents.length + subgoals.length + 1 + withPadding.length + 1;
        return [header, ...agents, ...subgoals, divider, ...withPadding, theme.fg("border", "─".repeat(width))];
      }
    }

    this.#lastRows = 1 + agents.length + subgoals.length;
    return [header, ...agents, ...subgoals];
  }

  // ── render pieces ──────────────────────────────────────────────────────

  #idleLine(theme: Theme, width: number, snap: ForgerySnapshot): string {
    const recent = snap.runs[0];
    if (recent) {
      const glyph = colorStatus(theme, recent.status);
      const detail = recent.error ? ` ${safeText(truncate(recent.error, 30))}` : "";
      return ` ${glyph} ${theme.fg("muted", `forgery · ${recent.name} · ${recent.status}`)}${detail}`.slice(0, width);
    }
    return ` ${theme.fg("dim", "forgery · idle")}`.slice(0, width);
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
    const glyph = theme.fg("accent", animatedStatusGlyph("running", frame));
    const line = ` ${glyph} ${theme.fg("text", theme.bold("forgery"))} ${theme.fg("muted", active.name)} ·${calls}${tokens}${cost}${dur}`;
    return truncateToWidth(line, width, "…");
  }

  #participantRows(
    theme: Theme,
    snap: ForgerySnapshot,
    width: number,
    max: number,
    frame: number,
  ): string[] {
    const rows: string[] = [];
    // Active agents first, then running recent ones, then terminal.
    const agents = snap.agents.filter((a) => a.status !== "completed" || a.current);
    const agentRows = agents.slice(0, 3).map((a) => this.#agentRow(theme, a, width, frame));
    rows.push(...agentRows);
    return rows.slice(0, max > 0 ? max : rows.length);
  }

  #agentRow(theme: Theme, agent: ForgeryAgentRecord, width: number, frame: number): string {
    // Running agents get the animated spinner; everything else keeps a static glyph.
    const glyph =
      agent.status === "running"
        ? theme.fg("accent", animatedStatusGlyph("running", frame))
        : colorStatus(theme, agent.status);
    const current = agent.current ? ` ${theme.fg("dim", truncate(agent.current, 40))}` : "";
    const line = `  ${glyph} ${theme.fg("text", theme.bold(agent.name))}${current}`;
    return truncateToWidth(line, width, "…");
  }

  /** Subgoal rows for the active run — name + status glyph + completed/total. */
  #subgoalRows(
    theme: Theme,
    snap: ForgerySnapshot,
    active: { subgoals: ForgerySubgoal[] },
    width: number,
    frame: number,
  ): string[] {
    const rows: string[] = [];
    const subgoals = active.subgoals?.slice(0, 3) ?? [];
    for (const s of subgoals) {
      const glyph =
        s.status === "running"
          ? theme.fg("accent", animatedStatusGlyph("running", frame))
          : s.status === "completed"
            ? theme.fg("success", "✓")
            : s.status === "failed"
              ? theme.fg("error", "✗")
              : s.status === "blocked"
                ? theme.fg("warning", "◐")
                : colorStatus(theme, s.status);
      const progress =
        s.total !== undefined && s.completed !== undefined
          ? ` ${theme.fg("dim", `${s.completed}/${s.total}`)}`
          : "";
      const current = s.current ? ` ${theme.fg("dim", truncate(s.current, 32))}` : "";
      const line = `  ${glyph} ${theme.fg("text", theme.bold(s.name))}${progress}${current}`;
      rows.push(truncateToWidth(line, width, "…"));
    }
    return rows;
  }
}
