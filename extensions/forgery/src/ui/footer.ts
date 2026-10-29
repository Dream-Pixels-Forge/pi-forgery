/**
 * pi-forgery — status-line footer.
 *
 * The "status line / footer" surface the user asked for. Renders a single
 * line (or two when wide) with:
 *
 *   git branch · context progress · model (effort) · working dir · ctx tokens
 *   · compacts · issues · PRs · CI · active run status · calls · tokens · cost · duration
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
  colorStatus,
  formatCost,
  formatDuration,
  formatPercent,
  formatTokens,
  safeText,
  statusLine,
  statusGlyph,
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
  /** Thinking/effort level: "low" | "medium" | "high", or null. */
  effort: () => string | null;
  /** Working directory, or null. */
  cwd: () => string | null;
  /** Compacts used so far (compact → context reset), or null. */
  compactCount: () => number | null;
  /** Max compacts before handoff is recommended, default 5. */
  compactMax: () => number | null;
  /** Open issue count, or null. */
  issuesOpen: () => number | null;
  /** Closed issue count, or null. */
  issuesClosed: () => number | null;
  /** Open PR count, or null. */
  prsOpen: () => number | null;
  /** Closed PR count, or null. */
  prsClosed: () => number | null;
  /** CI status: "pending" | "failed" | "green", or null. */
  ciStatus: () => string | null;
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

  /**
   * pi-tui calls this when the theme changes or the component must re-render
   * from scratch. The footer keeps no cached rendering state — it reads live
   * data on every render — so there is nothing to discard.
   */
  invalidate(): void {}

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

  /** Render a compact progress bar: "[████░░░░] 45%". */
  #progressBar(pct: number | null | undefined, width = 8): string {
    if (pct === null || pct === undefined) return "—";
    // Pi does not clamp `percent`, so an over-full context would otherwise
    // produce a negative repeat count.
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${formatPercent(pct)}`;
  }

  render(width: number): string[] {
    const snap = this.snapshot();
    const theme = this.theme;
    const branch = (() => {
      try {
        return this.footerCtx.gitBranch();
      } catch {
        return null;
      }
    })();
    const usage = this.footerCtx.contextUsage();
    const pct = usage?.percent ?? null;
    const tokens = usage?.tokens ?? null;
    const tokensMax = usage?.contextWindow ?? null;
    const model = this.footerCtx.modelId();
    const effort = this.footerCtx.effort();
    const cwd = this.footerCtx.cwd();
    const compactCount = this.footerCtx.compactCount();
    const compactMax = this.footerCtx.compactMax() ?? 5;
    const issuesOpen = this.footerCtx.issuesOpen();
    const issuesClosed = this.footerCtx.issuesClosed();
    const prsOpen = this.footerCtx.prsOpen();
    const prsClosed = this.footerCtx.prsClosed();
    const ciStatus = this.footerCtx.ciStatus();

    const active = snap.runs.find((r) => r.status === "running");

    // ── Segment 1: git branch ─────────────────────────────────────────
    const branchSeg = branch
      ? theme.fg("muted", `⎇ ${safeText(branch)}`)
      : theme.fg("dim", "no-repo");

    // ── Segment 2: context progress bar ──────────────────────────────
    const ctxSeg = pct !== null
      ? theme.fg(
          "muted",
          `ctx ${this.#progressBar(pct, 6)} ${formatPercent(pct)}${
            tokens !== null || tokensMax !== null
              ? ` · ${formatTokens(tokens)}/${formatTokens(tokensMax)}`
              : ""
          }`,
        )
      : theme.fg("dim", "ctx —");

    // ── Segment 3: model + effort ─────────────────────────────────────
    const modelShort = model ? model.split("/").pop() ?? model : undefined;
    const effortShort = effort
      ? {
          low: "lw",
          medium: "med",
          high: "hgh",
        }[effort] ?? effort
        : undefined;
    const modelSeg =
      modelShort || effort !== null
        ? theme.fg(
            "dim",
            `${modelShort ?? "?"}${effortShort ? ` (${effortShort})` : ""}`,
          )
        : undefined;

    // ── Segment 4: working directory (basename only) ─────────────────
    const cwdSeg =
      cwd
        ? theme.fg("muted", `📁 ${safeText(basename(cwd))}`)
        : undefined;

    // ── Segment 5: compacts ──────────────────────────────────────────
    const compactSeg =
      compactCount !== null
        ? theme.fg(
            "muted",
            `compacts ${compactCount}/${compactMax}${
              compactCount >= (compactMax ?? 5) ? " handoff!" : ""
            }`,
          )
        : undefined;

    // ── Segment 6: CI status ─────────────────────────────────────────
    const ciSeg =
      ciStatus === "blocker" || ciStatus === "failed"
        ? theme.fg("error", "CI ✗")
        : ciStatus === "major" || ciStatus === "green"
          ? theme.fg("success", "CI ✓")
          : ciStatus === "nit" || ciStatus === "pending"
            ? theme.fg("warning", "CI ◐")
            : ciStatus
              ? theme.fg("muted", `CI ${ciStatus}`)
              : undefined;

    // ── Segment 7: live run status ───────────────────────────────────
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
        const dur =
          recent.finishedAt && recent.startedAt
            ? ` ${formatDuration(recent.finishedAt - recent.startedAt)}`
            : "";
        runSeg = `${colorStatus(theme, recent.status)} ${recent.name} ${recent.status}${dur}`;
      } else {
        runSeg = theme.fg("dim", "idle");
      }
    }

    // ── Segment 8: issues/PRs ────────────────────────────────────────
    const issuesSeg =
      issuesOpen !== null || issuesClosed !== null || prsOpen !== null || prsClosed !== null
        ? theme.fg(
            "muted",
            `issues ${issuesOpen ?? "?"}/${issuesClosed ?? "?"} · PRs ${prsOpen ?? "?"}/${prsClosed ?? "?"}`,
          )
        : undefined;

    // ── Assemble ─────────────────────────────────────────────────────
    const partsLeft = [branchSeg, ctxSeg, modelSeg, cwdSeg, compactSeg, ciSeg, issuesSeg].filter(
      Boolean,
    );
    const partsRight = [runSeg].filter(Boolean);

    const singleLeft = partsLeft.join("  ·  ");
    const singleRight = partsRight.join("  ·  ");
    const single = `${singleLeft}${singleRight.length > 0 ? "  ·  " + singleRight : ""}`;
    const fitted = truncateToWidth(single, width, "…");
    // Wide enough for one line? Strip ANSI codes and stub-theme color tags
    // to measure visible width.
    const visibleLen = fitted
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/\[[a-z]+\]/g, "")
      .length;
    if (visibleLen <= width - 2 || width < 80) {
      return [fitted];
    }

    // Two-line layout: meta on top, run on bottom.
    const line1 = partsLeft.join("  ·  ");
    const line2 = partsRight.join("  ·  ");
    return [
      truncateToWidth(line1, width, "…"),
      truncateToWidth(line2, width, "…"),
    ];
  }
}

/** Return the basename of a path, or the input if it has no separator. */
function basename(p: string): string {
  const lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return lastSlash === -1 ? p : p.slice(lastSlash + 1);
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
