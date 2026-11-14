/**
 * pi-forgery — status-line footer (Claude Code style).
 *
 * A single compact line — never two — with just the essentials:
 *
 *   model · branch · ctx N% · [agent ◐]
 *
 * Every value comes from the activity store or the live host context — no
 * fabricated telemetry. The controller also mirrors a compact status string
 * into `ctx.ui.setStatus("forgery", …)` so Pi's *built-in* footer shows the
 * live run when another extension reclaims the custom footer slot.
 */

import type { ContextUsage, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ForgerySnapshot } from "../activity/types";
import {
  animatedStatusGlyph,
  colorStatus,
  formatCost,
  formatPercent,
  formatTokens,
  safeText,
  statusGlyph,
  statusLine,
  truncate,
} from "./format";

export interface ForgeryFooterContext {
  /** Current git branch, or null if not in a repo. */
  gitBranch: () => string | null;
  /**
   * Live context usage for the active model, or null when unknown.
   * Read on every render — Pi recomputes it on each call.
   */
  contextUsage: () => ContextUsage | null;
  /** The active model id (e.g. "minimax/minimax-m3.1-flash"), or undefined. */
  modelId: () => string | undefined;
  /** Thinking/effort level (Pi's ThinkingLevel), or null. */
  effort: () => string | null;
}

/**
 * Claude Code–inspired status line: one compact line, essentials only.
 *
 * Segments: model · branch · ctx N% · [active agent with spinner].
 */
export class ForgeryFooter implements Component {
  private theme: () => Theme;
  private snapshot: () => ForgerySnapshot;
  private footerCtx: ForgeryFooterContext;
  /** Frame counter used to animate the "working" spinner while a run is active. */
  #frame = 0;

  constructor(theme: () => Theme, snapshot: () => ForgerySnapshot, footerCtx: ForgeryFooterContext) {
    this.theme = theme;
    this.snapshot = snapshot;
    this.footerCtx = footerCtx;
  }

  invalidate(): void {}

  /**
   * Compact status string mirrored into `setStatus("forgery", …)`.
   */
  statusString(): string {
    this.#frame += 1;
    const snap = this.snapshot();
    const active = snap.runs.find((r) => r.status === "running");
    if (!active) {
      const recent = snap.runs[0];
      if (recent) {
        return statusLine([
          `${statusGlyph(recent.status)} ${recent.name} ${recent.status}`,
          recent.error ? truncate(recent.error, 32) : undefined,
        ]);
      }
      return "forgery · idle";
    }
    const totals = snap.activeTotals;
    return statusLine([
      `${animatedStatusGlyph("running", this.#frame)} ${active.name}`,
      totals ? `${totals.calls} calls` : undefined,
      totals?.tokens ? `${formatTokens(totals.tokens)} tok` : undefined,
      totals?.cost ? formatCost(totals.cost) : undefined,
      formatDuration(snap.now - active.startedAt),
    ]);
  }

  render(width: number): string[] {
    const snap = this.snapshot();
    const theme = this.theme();
    // Advance the spinner frame on every render while a run is active.
    this.#frame += 1;

    const model = this.#readModel();
    const branch = (() => {
      try {
        return this.footerCtx.gitBranch();
      } catch {
        return null;
      }
    })();
    const usage = (() => {
      try {
        return this.footerCtx.contextUsage();
      } catch {
        return null;
      }
    })();
    const pct = usage?.percent ?? null;
    const effort = (() => {
      try {
        return this.footerCtx.effort();
      } catch {
        return null;
      }
    })();

    const active = snap.runs.find((r) => r.status === "running");

    // ── Segment 1: model (short name) ─────────────────────────────────
    const modelSeg = model
      ? theme.fg("accent", shortModel(model, effort))
      : theme.fg("dim", "no-model");

    // ── Segment 2: git branch ─────────────────────────────────────────
    const branchSeg = branch
      ? theme.fg("muted", `⎇ ${safeText(branch)}`)
      : theme.fg("dim", "no-repo");

    // ── Segment 3: context usage (percent only, no bar) ───────────────
    const ctxSeg =
      pct !== null
        ? theme.fg(
            pct >= 85 ? "error" : "muted",
            `ctx ${formatPercent(pct)}`,
          )
        : theme.fg("dim", "ctx —");

    // ── Segment 4: active run / agent with spinner ────────────────────
    let runSeg: string | undefined;
    if (active) {
      const totals = snap.activeTotals;
      const calls = totals ? ` · ${totals.calls} calls` : "";
      const dur = active.startedAt ? ` · ${formatDuration(snap.now - active.startedAt)}` : "";
      runSeg = `${theme.fg(
        "accent",
        animatedStatusGlyph("running", this.#frame),
      )} ${theme.fg("text", theme.bold(active.name))}${calls}${dur}`;
    } else {
      const recent = snap.runs[0];
      if (recent) {
        runSeg = `${colorStatus(theme, recent.status)} ${recent.name} ${recent.status}`;
      } else {
        runSeg = theme.fg("dim", "idle");
      }
    }

    // ── Assemble (always one line) ────────────────────────────────────
    const parts = [modelSeg, branchSeg, ctxSeg, runSeg].filter(Boolean);
    const single = parts.join("  ·  ");
    const fitted = truncateToWidth(single, width, "…");
    return [fitted];
  }

  /** Shorten a model id for display: "provider/model" → "model", drop effort tag. */
  #readModel(): string | undefined {
    try {
      return this.footerCtx.modelId();
    } catch {
      return undefined;
    }
  }
}

/** Milliseconds → "3m12s", "45s", "1h20m", "—" when undefined. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 > 0 ? `${m}m${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h${m % 60}m` : `${h}h`;
}

/** "provider/model-name" → "model-name", with optional effort tag (lw/med/hgh). */
function shortModel(modelId: string, effort: string | null | undefined): string {
  const name = modelId.includes("/") ? modelId.split("/").pop() ?? modelId : modelId;
  const effortTag =
    effort === "low"
      ? " (lw)"
      : effort === "medium"
        ? " (med)"
        : effort === "high"
          ? " (hgh)"
          : "";
  return `${name}${effortTag}`;
}

/**
 * Mount the footer on an ExtensionUIContext. Pass `undefined` to restore the
 * built-in footer.
 */
export function mountFooter(
  ui: {
    setFooter: (
      factory:
        | ((theme: Theme, ...a: unknown[]) => Component & { dispose?(): void })
        | undefined,
    ) => void;
    setStatus: (key: string, text: string | undefined) => void;
  },
  footer: ForgeryFooter | undefined,
): void {
  if (!footer) {
    ui.setFooter(undefined);
    return;
  }
  ui.setFooter((theme: Theme, ..._args: unknown[]) => footer);
}
