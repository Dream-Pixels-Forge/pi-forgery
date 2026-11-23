/**
 * pi-forgery — status-line footer (Claude Code style).
 *
 * A compact status line with priority-based responsive segments. Segments are
 * laid out left group (session: model, branch) / right group (activity:
 * context gauge, CI, run). On narrow terminals whole segments are dropped
 * (never mid-text), and alerts (CI failing, handoff) survive at any width.
 *
 * When `footer.lines` is `"auto"` and the segments overflow one line, the
 * footer switches to two lines: line 1 = session, line 2 = activity.
 *
 * Every value comes from the activity store or the live host context — no
 * fabricated telemetry. The controller also mirrors a compact status string
 * into `ctx.ui.setStatus("forgery", …)` so Pi's *built-in* footer shows the
 * live run when another extension reclaims the custom footer slot.
 */

import type { ContextUsage, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { ForgerySnapshot } from "../activity/types";
import type { UiStatus } from "./format";
import {
  effortMeter,
  fit,
  formatPercent,
  formatTokens,
  formatStatusMetrics,
  formatStatusSummary,
  progressBar,
  renderStatus,
  shortenCwd,
  shortModel,
  statusGlyph,
  summarizeStatus,
  vw,
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
  /** CI status: "passing" | "failing" | "running" | "none", or null. */
  ciStatus: () => string | null;
  /** Budget status for the active run: { pctUsed, overSoft, overHard }. */
  budgetStatus: () => { pctUsed: number; overSoft: boolean; overHard: boolean } | null;
  /** Working directory of the current session, or undefined when unknown. */
  cwd: () => string | undefined;
}

/** A footer segment: a piece of the status line with a priority and min width. */
interface FooterSegment {
  id: string;
  /** Lower number = kept longer when shrinking. 0 = alert, always kept. */
  priority: number;
  align: "left" | "right";
  /** Minimum visible width this segment needs to be shown at all. */
  minWidth: number;
  /** Render the segment; undefined means hide it. */
  render: () => string | undefined;
}

/** Context-percent colour thresholds. */
const CTX_WARN_PCT = 50;
const CTX_ERROR_PCT = 85;

/**
 * Claude Code–inspired status line with priority-based responsive segments.
 */
export class ForgeryFooter implements Component {
  private theme: () => Theme;
  private snapshot: () => ForgerySnapshot;
  private footerCtx: ForgeryFooterContext;
  /** Whether spinners and transitions are animated. */
  #animations: boolean;
  private clock: () => number;
  /** Footer layout: "auto" | 1 | 2. */
  #lines: "auto" | 1 | 2;
  /** Maximum context compactions before a handoff alert (1..20). */
  #compactMax: number;
  /** Timestamp when CI entered "pending" (check in progress), null when not pending. */
  #ciPendingSince: number | null = null;
  /** Timestamp when CI left "pending" (restore animation started), null when not restoring. */
  #ciRestoreStartMs: number | null = null;

  constructor(
    theme: () => Theme,
    snapshot: () => ForgerySnapshot,
    footerCtx: ForgeryFooterContext,
    animations = true,
    clock = Date.now,
    lines: "auto" | 1 | 2 = "auto",
    compactMax = 5,
  ) {
    this.theme = theme;
    this.snapshot = snapshot;
    this.footerCtx = footerCtx;
    this.#animations = animations;
    this.clock = clock;
    this.#lines = lines;
    this.#compactMax = compactMax;
  }

  invalidate(): void {}

  /**
   * Compact status string mirrored into `setStatus("forgery", …)`.
   * Single source of truth (SG-20): built from `summarizeStatus` so the
   * status bar, footer run segment, and widget title always agree.
   */
  statusString(): string {
    const snap = this.snapshot();
    return formatStatusSummary(summarizeStatus(snap, this.clock));
  }

  /** Build the segment list for the current snapshot. */
  #segments(snap: ForgerySnapshot, theme: Theme): FooterSegment[] {
    const usage = this.#readCtxUsage();
    const pct = usage?.percent ?? null;
    const tokens = usage?.tokens ?? null;
    const tokensMax = usage?.contextWindow ?? null;
    const active = snap.runs.find((r) => r.status === "running");
    const recent = snap.runs[0];
    const ciStatus = this.#readCiStatus();
    const model = this.#readModel();
    const effort = this.#readEffort();
    const branch = this.#readBranch();

    const segs: FooterSegment[] = [];

    // ── Left group: session ──────────────────────────────────────────

    segs.push({
      id: "model",
      priority: 3,
      align: "left",
      minWidth: 6,
      render: () => {
        if (!model) return theme.fg("dim", "no-model");
        const meter = effortMeter(effort);
        const text = meter ? `${shortModel(model)} ${meter}` : shortModel(model);
        return theme.fg("accent", text);
      },
    });

    segs.push({
      id: "branch",
      priority: 2,
      align: "left",
      minWidth: 6,
      render: () => {
        if (!branch) return theme.fg("dim", "no-repo");
        return theme.fg("muted", `⎇ ${branch.replace(/[^\x20-\x7E]/g, "")}`);
      },
    });

    segs.push({
      id: "cwd",
      priority: 3,
      align: "left",
      minWidth: 8,
      render: () => {
        const dir = this.#readCwd();
        if (!dir) return undefined;
        return theme.fg("muted", shortenCwd(dir));
      },
    });

    // ── Right group: activity ────────────────────────────────────────

    segs.push({
      id: "ctx",
      priority: 2,
      align: "right",
      minWidth: 8,
      render: () => {
        if (pct === null) return theme.fg("dim", "ctx —");
        const clamped = Math.max(0, Math.min(100, pct));
        const color =
          clamped >= CTX_ERROR_PCT ? "error" : clamped >= CTX_WARN_PCT ? "warning" : "muted";
        const bar = this.#gauge(clamped, theme, 6);
        let extra = `ctx ${bar}`;
        if (tokens !== null && tokensMax !== null) {
          extra += ` ${formatTokens(tokens)}/${formatTokens(tokensMax)}`;
        }
        const compacts = (active?.compacts ?? recent?.compacts ?? 0);
        if (compacts > 0) {
          extra += ` ↻${compacts}/${this.#compactMax}`;
        }
        return theme.fg(color, extra);
      },
    });

    // Handoff alert (priority 0 — survives at any width).
    segs.push({
      id: "handoff",
      priority: 0,
      align: "right",
      minWidth: 10,
      render: () => {
        const compacts = active?.compacts ?? recent?.compacts ?? 0;
        if (compacts >= this.#compactMax) {
          return theme.fg("error", "⚠ handoff");
        }
        return undefined;
      },
    });

    // CI status.
    segs.push({
      id: "ci",
      priority: ciStatus === "failing" ? 0 : ciStatus === "running" || ciStatus === "pending" ? 1 : 3,
      align: "right",
      minWidth: 6,
      render: () => {
        let status = ciStatus;
        if (status === "pending") status = "running";
        if (status === "passing") return theme.fg("success", "✓ CI");
        if (status === "failing") return theme.fg("error", "✗ CI");
        if (status === "running") {
          const frame = Math.floor(this.clock() / 80) % 10;
          const glyph = renderStatus(theme, "running", frame, this.#animations);
          return theme.fg("warning", `${glyph} CI`);
        }
        return undefined;
      },
    });

    // Budget alert (priority 0 — survives at any width).
    segs.push({
      id: "budget",
      priority: 0,
      align: "right",
      minWidth: 10,
      render: () => {
        const bs = this.#readBudgetStatus();
        if (!bs) return undefined;
        if (bs.overHard) {
          return theme.fg("error", `⚠ budget ${bs.pctUsed.toFixed(0)}%`);
        }
        if (bs.overSoft) {
          return theme.fg("warning", `⚠ budget ${bs.pctUsed.toFixed(0)}%`);
        }
        return undefined;
      },
    });

    // Active run / recent run segment: `◐ demo · 12 calls · 1.2k tok · $0.42 · 3m12s`.
    // Duration shows elapsed time for an active run, wall time for a finished one.
    segs.push({
      id: "run",
      priority: active ? 1 : recent ? 2 : 4,
      align: "right",
      minWidth: 8,
      render: () => {
        const target = active ?? recent;
        if (!target) return undefined;
        const glyph = active
          ? renderStatus(theme, "running", Math.floor(this.clock() / 80) % 10, this.#animations)
          : colorStatusForSnapshot(target.status, theme);
        const metrics = formatStatusMetrics(summarizeStatus(snap, this.clock));
        const statusText = active ? "" : ` ${target.status}`;
        return theme.fg(
          "text",
          `${glyph} ${theme.bold(target.name)}${metrics ? ` · ${metrics}` : ""}${statusText}`,
        );
      },
    });

    return segs;
  }

  /** Render at `width` columns, possibly splitting into two lines. */
  render(width: number): string[] {
    const snap = this.snapshot();
    const theme = this.theme();
    const segs = this.#segments(snap, theme);

    const measured = segs.map((s) => {
      const rendered = s.render() ?? "";
      return { ...s, rendered, width: vw(rendered) };
    });

    const left = measured.filter((s) => s.align === "left");
    const right = measured.filter((s) => s.align === "right");

    const joinWithGap = (parts: string[]): string => parts.filter(Boolean).join("  ·  ");

    const all = joinWithGap([...left.map((s) => s.rendered), ...right.map((s) => s.rendered)].filter(Boolean));
    if (vw(all) <= width || this.#lines === 1) {
      return [fit(all, width)];
    }

    // Two-line mode: line 1 = session (left group), line 2 = activity (right group).
    if (this.#lines === "auto" || this.#lines === 2) {
      const line1 = joinWithGap(left.map((s) => s.rendered));
      const line2 = joinWithGap(right.map((s) => s.rendered));
      if (vw(line1) <= width && vw(line2) <= width) {
        return [fit(line1, width), fit(line2, width)];
      }
    }

    // Still overflowing: drop segments by priority (right group first,
    // lowest priority = highest number dropped first), keeping alerts.
    const droppable = [...measured].filter((s) => s.priority > 0);
    droppable.sort((a, b) => b.priority - a.priority);
    let kept = measured.filter((s) => s.priority === 0);
    for (const seg of droppable) {
      const trial = [...kept, seg];
      const l = joinWithGap(trial.filter((s) => s.align === "left" && s.rendered).map((s) => s.rendered));
      const r = joinWithGap(trial.filter((s) => s.align === "right" && s.rendered).map((s) => s.rendered));
      const trialLine = joinWithGap([l, r].filter(Boolean));
      if (vw(trialLine) <= width) {
        kept = trial;
        break;
      }
      kept = trial;
    }

    const finalLeft = kept.filter((s) => s.align === "left" && s.rendered).map((s) => s.rendered);
    const finalRight = kept.filter((s) => s.align === "right" && s.rendered).map((s) => s.rendered);
    const finalLine = joinWithGap([...finalLeft, ...finalRight]);
    return [fit(finalLine, width)];
  }

  /** Compact progress bar with thresholds: `ctx ▰▰▰▱ 72%`. */
  #gauge(pct: number, theme: Theme, cells = 6): string {
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * cells);
    const empty = cells - filled;
    const color =
      clamped >= CTX_ERROR_PCT ? "error" : clamped >= CTX_WARN_PCT ? "warning" : "muted";
    return theme.fg(color, `[${"█".repeat(filled)}${"░".repeat(empty)}] ${formatPercent(clamped)}`);
  }

  /** Read live context usage, degrading on invalid context. */
  #readCtxUsage(): ContextUsage | null {
    try {
      return this.footerCtx.contextUsage();
    } catch {
      return null;
    }
  }

  /** Read live CI status, degrading on invalid context. */
  #readCiStatus(): string | null {
    try {
      return this.footerCtx.ciStatus();
    } catch {
      return null;
    }
  }

  /** Read live budget status, degrading on invalid context. */
  #readBudgetStatus(): { pctUsed: number; overSoft: boolean; overHard: boolean } | null {
    try {
      return this.footerCtx.budgetStatus();
    } catch {
      return null;
    }
  }

  /** Read live model id, degrading on invalid context. */
  #readModel(): string | undefined {
    try {
      return this.footerCtx.modelId();
    } catch {
      return undefined;
    }
  }

  /** Read live effort, degrading on invalid context. */
  #readEffort(): string | null {
    try {
      return this.footerCtx.effort();
    } catch {
      return null;
    }
  }

  /** Read live branch, degrading on invalid context. */
  #readBranch(): string | null {
    try {
      return this.footerCtx.gitBranch();
    } catch {
      return null;
    }
  }

  /** Read live working directory, degrading on invalid context. */
  #readCwd(): string | undefined {
    try {
      return this.footerCtx.cwd();
    } catch {
      return undefined;
    }
  }
}

/** Colour for a static (non-running) status glyph. */
function colorStatusForSnapshot(status: string, theme: Theme): string {
  const map: Record<string, string> = {
    completed: "success",
    failed: "error",
    cancelled: "muted",
    stopped: "muted",
    queued: "dim",
    pending: "muted",
    blocked: "warning",
    timed_out: "error",
    unavailable: "warning",
  };
  return theme.fg((map[status] ?? "dim") as ThemeColor, statusGlyph(status as UiStatus));
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
