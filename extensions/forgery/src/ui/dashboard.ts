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
import type { Component, Focusable, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ForgeryAgentRecord, ForgeryRun, ForgerySnapshot } from "../activity/types.js";
import {
  colorSafe,
  colorStatus,
  formatCost,
  formatDuration,
  formatTokens,
  oneLine,
  safeText,
  statusGlyph,
  truncate,
} from "./format.js";

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
  private opts: ForgeryDashboardOptions;

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
    if (matchesKey(data, "escape")) {
      this.opts.done();
      return;
    }
    if (this.view === "activity") {
      if (matchesKey(data, "tab") || matchesKey(data, "right")) {
        this.filter = this.filter === "all" ? "active" : this.filter === "active" ? "completed" : this.filter === "completed" ? "failed" : "all";
      } else if (matchesKey(data, "left")) {
        this.filter = this.filter === "all" ? "failed" : this.filter === "active" ? "all" : this.filter === "completed" ? "active" : this.filter === "failed" ? "completed" : "all";
      } else if (matchesKey(data, "]")) {
        this.runIndex = Math.max(0, this.runIndex - 1);
      } else if (matchesKey(data, "[")) {
        this.runIndex = Math.min(this.opts.snapshot().runs.length - 1, this.runIndex + 1);
      } else if (matchesKey(data, "up")) {
        this.entityIndex = Math.max(0, this.entityIndex - 1);
      } else if (matchesKey(data, "down")) {
        this.entityIndex = this.entityIndex + 1;
      }
    } else if (this.view === "settings") {
      // settings view is read-only; keys just close
      if (matchesKey(data, "enter")) this.opts.done();
    }
    // Switch view with 1/2
    if (matchesKey(data, "1")) this.view = "activity";
    if (matchesKey(data, "2")) this.view = "settings";
    this.tui.requestRender();
  }

  render(width: number): string[] {
    if (this.view === "settings") {
      return this.#renderSettings(width);
    }
    return this.#renderActivity(width);
  }

  // ── views ──────────────────────────────────────────────────────────────

  #renderActivity(width: number): string[] {
    const snap = this.opts.snapshot();
    const theme = this.theme;
    const runs = snap.runs;
    const active = runs.find((r) => r.status === "running");
    const focus = runs[Math.min(this.runIndex, runs.length - 1)] ?? active ?? runs[0];
    const header = [
      theme.fg("text", theme.bold("⌗ /forgery")),
      ` ${theme.fg("muted", "dashboard")}`,
      ` ${theme.fg("dim", "1=activity 2=settings · f=filter · [/] step run · esc close")}`,
    ].join("").slice(0, width);

    const lines: string[] = [header];

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

    // Entity list (agents).
    const entities = this.#filteredAgents(snap.agents, this.filter);
    lines.push("");
    lines.push(theme.fg("muted", `agents (${entities.length}) · filter: ${this.filter}`));
    entities.forEach((agent, i) => {
      const isFocused = i === this.entityIndex;
      const prefix = isFocused ? ">" : " ";
      const glyph = colorStatus(theme, agent.status);
      const tail = [
        agent.current ? ` ${theme.fg("dim", truncate(agent.current, 28))}` : "",
        agent.usage?.cost ? ` ${formatCost(agent.usage.cost)}` : "",
        agent.finishedAt ? ` ${formatDuration(snap.now - agent.startedAt)}` : "",
      ].join("");
      lines.push(
        `${prefix} ${glyph} ${theme.fg("text", theme.bold(agent.name))}${theme.fg("dim", ` · ${agent.status}`)}${tail}`,
      );
    });

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

  #pad(lines: string[], width: number, maxRows: number): string[] {
    const body = lines.slice(0, maxRows).map((l) => truncateToWidth(l, width, "…"));
    while (body.length < maxRows) body.push("");
    return body;
  }
}
