/**
 * pi-forgery — status-line footer.
 *
 * The "status line / footer" surface the user asked for. Renders a single
 * line (or two when wide) with:
 *
 *   git branch · context tokens · active run status · calls · tokens · cost · duration
 *
 * Every value comes from the activity store or the live host context — no
 * fabricated telemetry. The controller also mirrors a compact string into
 * `ctx.ui.setStatus("forgery", …)` so Pi's *built-in* footer shows the live
 * run when another extension reclaims the custom footer.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ForgerySnapshot } from "../activity/types.js";
import {
  colorStatus,
  formatCost,
  formatDuration,
  formatPercent,
  formatTokens,
  safeText,
  statusLine,
  statusGlyph,
  truncate,
} from "./format.js";

export interface ForgeryFooterContext {
  /** Current git branch, or null if not in a repo. */
  gitBranch: () => string | null;
  /** Context usage percent of the active model, or null. */
  contextPercent: () => number | null;
  /** Context token count, or null when unknown (e.g. right after compaction). */
  contextTokens: () => number | null;
  /** The active model id, if any. */
  modelId: () => string | undefined;
}

/**
 * A one-line (or two-line when wide) status-line component.
 *
 * `snapshot` is a lazy getter — the controller recomputes it at most every
 * ~100 ms and calls `invalidate()` when the revision changes.
 */
export class ForgeryFooter implements Component {
  private theme: Theme;
  private snapshot: () => ForgerySnapshot;
  private footerCtx: ForgeryFooterContext;

  constructor(theme: Theme, snapshot: () => ForgerySnapshot, footerCtx: ForgeryFooterContext) {
    this.theme = theme;
    this.snapshot = snapshot;
    this.footerCtx = footerCtx;
  }

  invalidate(): void {
    /* the controller re-renders on revision change */
  }

  /**
   * The compact status string also written to `setStatus("forgery", …)`.
   * Used by Pi's built-in footer when a third-party extension owns the
   * custom footer slot.
   */
  statusString(): string {
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
      `◐ ${active.name}`,
      totals ? `${totals.calls} calls` : undefined,
      totals?.tokens ? `${formatTokens(totals.tokens)} tok` : undefined,
      totals?.cost ? formatCost(totals.cost) : undefined,
      formatDuration(snap.now - active.startedAt),
    ]);
  }

  render(width: number): string[] {
    const snap = this.snapshot();
    const theme = this.theme;
    const branch = this.footerCtx.gitBranch();
    const pct = this.footerCtx.contextPercent();
    const tokens = this.footerCtx.contextTokens();
    const model = this.footerCtx.modelId();

    const active = snap.runs.find((r) => r.status === "running");

    // Segment 1: git branch
    const branchSeg = branch
      ? theme.fg("muted", `⎇ ${safeText(branch)}`)
      : theme.fg("dim", "no-repo");

    // Segment 2: context
    const ctxSeg =
      pct !== null || tokens !== null
        ? theme.fg("muted", `ctx ${formatPercent(pct)}${tokens !== null ? ` · ${formatTokens(tokens)} tok` : ""}`)
        : theme.fg("dim", "ctx —");

    // Segment 3: model
    const modelSeg = model ? theme.fg("dim", model) : undefined;

    // Segment 4: live run status
    let runSeg: string;
    if (active) {
      const totals = snap.activeTotals;
      const parts = statusLine([
        `${colorStatus(theme, "running")} ${active.name}`,
        totals ? `${totals.calls} calls` : undefined,
        totals?.tokens ? `${formatTokens(totals.tokens)} tok` : undefined,
        totals?.cost ? formatCost(totals.cost) : undefined,
        formatDuration(snap.now - active.startedAt),
      ]);
      runSeg = parts;
    } else {
      const recent = snap.runs[0];
      if (recent) {
        runSeg = `${colorStatus(theme, recent.status)} ${recent.name} ${recent.status}`;
      } else {
        runSeg = theme.fg("dim", "idle");
      }
    }

    // Single line when wide, two lines when narrow.
    const single = ` ${[branchSeg, ctxSeg, modelSeg, runSeg].filter(Boolean).join("  ·  ")}`;
    const fitted = truncateToWidth(single, width, "…");
    if (fitted.length >= width - 2 && width > 60) {
      // Split into two lines: meta on top, run on bottom.
      const meta = ` ${[branchSeg, ctxSeg, modelSeg].filter(Boolean).join("  ·  ")}`;
      return [truncateToWidth(meta, width, "…"), truncateToWidth(runSeg, width, "…")];
    }
    return [fitted];
  }
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
