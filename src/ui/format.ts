/**
 * pi-forgery — pure text presenters.
 * No host, no theme. Every function here returns a plain string so it is
 * trivially unit-testable and usable from both TUI components and CLI.
 */

import { homedir } from "node:os";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type {
  ForgeryAgentRecord,
  ForgeryActivityStatus,
  ForgeryRunStatus,
  ForgerySnapshot,
  ForgerySubgoal,
} from "../activity/types";
import { sliceByColumn, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** 1234 → "1.2k", 123000 → "123k", 1000000 → "1M", <1000 → raw digits. */
export function formatTokens(count: number | null | undefined): string {
  if (count === null || count === undefined) return "—";
  if (count < 1000) return String(count);
  const k = count / 1000;
  if (k < 1000) return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  const m = count / 1_000_000;
  return `${m.toFixed(1).replace(/\.0$/, "")}M`;
}

/** Braille spinner frames cycled to animate a "working" run/agent. */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Every status value rendered across widget, footer, dashboard and status string. */
export type UiStatus =
  | ForgeryAgentRecord["status"]
  | ForgerySubgoal["status"]
  | ForgeryRunStatus
  | ForgeryActivityStatus;

/**
 * Single source of truth for status glyph + color. `satisfies` makes adding a
 * new status to the unions a compile error until it is styled here.
 */
export const STATUS_STYLE = {
  queued: { glyph: "○", token: "dim" },
  pending: { glyph: "○", token: "muted" },
  running: { glyph: "⠋", token: "accent", animated: true },
  blocked: { glyph: "⊘", token: "warning" },
  completed: { glyph: "✓", token: "success" },
  failed: { glyph: "✗", token: "error" },
  timed_out: { glyph: "⏱", token: "error" },
  cancelled: { glyph: "■", token: "muted" },
  stopped: { glyph: "⏹", token: "muted" },
  unavailable: { glyph: "⚠", token: "warning" },
} as const satisfies Record<
  UiStatus,
  { glyph: string; token: ThemeColor; animated?: boolean }
>;

/** Selectable icon sets. The default `unicode` set uses only width-1 glyphs
 *  (no ambiguous emoji such as 📁). `icons(name)` resolves a set by name. */
export interface IconSet {
  running: string;
  done: string;
  failed: string;
  stopped: string;
  queued: string;
  folder: string;
  branch: string;
  spinner: string[];
}

export const ICONS: Record<"unicode" | "ascii" | "nerd", IconSet> = {
  unicode: {
    running: "●",
    done: "✓",
    failed: "✗",
    stopped: "■",
    queued: "○",
    folder: "▸",
    branch: "⎇",
    spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  },
  ascii: {
    running: "*",
    done: "+",
    failed: "x",
    stopped: "#",
    queued: ".",
    folder: ">",
    branch: "@",
    spinner: ["|", "/", "-", "\\"],
  },
  nerd: {
    running: "",
    done: "",
    failed: "",
    stopped: "",
    queued: "",
    folder: "",
    branch: "",
    spinner: ["", "", "", "", "", ""],
  },
} as const;

/** Resolve an icon set by name (default `unicode`). */
export function icons(name: "unicode" | "ascii" | "nerd" = "unicode"): IconSet {
  return ICONS[name];
}

/** Glyph for a status from the active icon set, falling back to STATUS_STYLE. */
export function statusGlyphFromSet(
  status: UiStatus,
  iconSet: IconSet,
  frameIndex: number,
): string {
  const style = STATUS_STYLE[status];
  if (status === "running") return iconSet.spinner[frameIndex % iconSet.spinner.length];
  switch (status) {
    case "queued":
      return iconSet.queued;
    case "completed":
      return iconSet.done;
    case "failed":
      return iconSet.failed;
    case "cancelled":
    case "stopped":
      return iconSet.stopped;
    default:
      return style.glyph;
  }
}

/** Frame index for the running spinner at wall-clock time `now` (80 ms per frame). */
export function frameAt(now: number): number {
  return Math.floor(now / 80) % SPINNER_FRAMES.length;
}

/** Colored status glyph, animated when the status is "running" and animations are on. */
export function renderStatus(
  theme: Theme,
  status: UiStatus,
  frameIndex: number,
  animated = true,
): string {
  const style = STATUS_STYLE[status];
  const glyph =
    status === "running" && animated
      ? SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]
      : style.glyph;
  return theme.fg(style.token, glyph);
}

/** Animated status glyph: running → next spinner frame, else the static glyph. */
export function animatedStatusGlyph(status: UiStatus, frameIndex: number): string {
  if (status === "running") return SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
  return STATUS_STYLE[status].glyph;
}

/** Format a dollar amount. Undefined/0 → "—". */
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined || cost === 0) return "—";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(1)}`;
}

/** Shorten a working directory to its short name: `$HOME` → `~`,
 *  any other path → just its last component (e.g. `/…/Dev/extension` → `extension`).
 *  Trailing slashes are ignored; `/` is returned as-is. */
export function shortenCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  const base = cwd.split("/").pop() ?? "";
  return base === "" ? cwd : base;
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

/** Elapsed time for an agent: frozen at finishedAt when done, else now - startedAt. */
export function agentElapsed(
  agent: Pick<ForgeryAgentRecord, "startedAt" | "finishedAt">,
  now: number,
): number | undefined {
  if (!agent.startedAt) return undefined;
  return (agent.finishedAt ?? now) - agent.startedAt;
}

/** Context usage percent → "42%" or "—". */
export function formatPercent(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p)}%`;
}

/** Mini progress bar: "▰▰▰▱▱" for completed/total over `cells` cells. Empty when total is 0/undefined. */
export function progressBar(
  completed: number | undefined,
  total: number | undefined,
  cells = 5,
): string {
  if (!total || total <= 0) return "";
  const ratio = Math.min(1, Math.max(0, completed ?? 0) / total);
  const filled = Math.round(ratio * cells);
  const empty = cells - filled;
  return "▰".repeat(filled) + "▱".repeat(empty);
}

/** Effort as a 3-dot meter: `●○○` low, `●●○` medium, `●●●` high.
 *  Unknown effort values render nothing. */
export function effortMeter(effort: string | null | undefined): string {
  if (effort === null || effort === undefined) return "";
  switch (effort) {
    case "low":
      return "●○○";
    case "medium":
      return "●●○";
    case "high":
      return "●●●";
    default:
      return "";
  }
}

/** Shorten a model id: strip date suffix, replace hyphens with spaces. */
export function shortModel(modelId: string): string {
  let name = modelId.includes("/") ? modelId.split("/").pop() ?? modelId : modelId;
  name = name.replace(/(?:-)?\d{8}$/, ""); // drop vendor date suffix
  return name.replace(/-/g, " ");
}

/** Render one agent as aligned columns: glyph · name · activity · calls · tokens · time.
 *
 * Layout (responsive — columns drop right-to-left as width shrinks):
 *   ▌ ⠹ ┌─ agent-name   doing something…         t3  12  1.2k   3s
 *   ▌ ✗ └─ child-agent  [error: timed out]        t1   4   800  1m2s
 *
 * Improvements over v1:
 *   - Tree connectors rendered per depth (├─ / └─ for siblings)
 *   - Error text shown in `error` color when status is failed/timed_out/stopped
 *   - Status badge chip for non-running states: "[failed]", "[queued]"
 *   - `name` column grows up to 20 chars (was capped at 12)
 *   - Activity column shows first 60 chars (was 44)
 *   - Completed rows dim the whole line (unchanged, but now includes error)
 */

/** Format recent tool call breadcrumbs: e.g. "[grep] ▸ [read: auth.ts] ▸ [edit: auth.ts]" */
export function formatToolBreadcrumbs(
  theme: Theme,
  calls: Array<{ tool: string; target?: string; status?: "running" | "done" | "failed" }>,
  maxWidth: number,
): string {
  if (calls.length === 0) return "";
  const parts: string[] = [];
  for (const c of calls) {
    const label = c.target ? `${c.tool}: ${c.target}` : c.tool;
    const color = c.status === "failed" ? "error" : c.status === "running" ? "accent" : "dim";
    parts.push(theme.fg(color, `[${label}]`));
  }
  const sep = theme.fg("dim", " ▸ ");
  // Try joining all, then progressively drop earliest if exceeding maxWidth
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join(sep);
    if (vw(candidate) <= maxWidth || i === parts.length - 1) {
      return fit(candidate, maxWidth);
    }
  }
  return fit(parts[parts.length - 1], maxWidth);
}


/**
 * Render a visual timeline / Gantt bar representing an agent's execution interval
 * within a total run span (runStart -> runEnd).
 */
export function formatTimelineBar(
  agentStart: number,
  agentEnd: number,
  runStart: number,
  runEnd: number,
  cells: number = 24,
): string {
  if (cells <= 0) return "";
  const span = Math.max(1, runEnd - runStart);
  const relStart = Math.max(0, Math.min(1, (agentStart - runStart) / span));
  const relEnd = Math.max(relStart, Math.min(1, (agentEnd - runStart) / span));

  const startIdx = Math.floor(relStart * cells);
  const endIdx = Math.max(startIdx + 1, Math.min(cells, Math.ceil(relEnd * cells)));

  const before = "░".repeat(Math.min(cells, startIdx));
  const active = "█".repeat(Math.max(0, Math.min(cells - startIdx, endIdx - startIdx)));
  const after = "░".repeat(Math.max(0, cells - (before.length + active.length)));

  return `[${before}${active}${after}]`;
}

export function agentRowCols(
  theme: Theme,
  agent: ForgeryAgentRecord,
  width: number,
  frame: number,
  opts: {
    /** Tree indent depth (0 = root). */
    depth?: number;
    /** Whether this node is the last sibling in its parent's children list (affects connector). */
    isLast?: boolean;
    /** Show the selection gutter marker. */
    selected?: boolean;
    /** Spinners on/off. */
    animations?: boolean;
    /** Clock for elapsed time. */
    clock?: () => number;
  } = {},
): string {
  const { depth = 0, isLast = true, selected = false, animations = true, clock = Date.now } = opts;

  const glyph =
    agent.status === "running"
      ? renderStatus(theme, agent.status, frame, animations)
      : colorStatus(theme, agent.status);

  const gutter = selected ? theme.fg("accent", "▌") : " ";

  // Build tree indent: each level adds 2 spaces of prefix, then connector.
  const indent = depth > 0
    ? `${"  ".repeat(depth - 1)}${isLast ? "└─" : "├─"} `
    : "";

  const rawName = `${indent}${agent.name}`;

  // Activity / error text
  const isErrored =
    agent.status === "failed" ||
    agent.status === "timed_out" ||
    agent.status === "stopped";

  let activityText: string;
  if (isErrored && agent.error) {
    activityText = theme.fg("error", oneLine(agent.error));
  } else if (agent.recentCalls && agent.recentCalls.length > 0) {
    // When recent breadcrumbs exist, render formatted breadcrumb stream
    activityText = formatToolBreadcrumbs(theme, agent.recentCalls, Math.max(12, width - 40));
  } else if (agent.current) {
    activityText = theme.fg("dim", oneLine(agent.current));
  } else if (isErrored) {
    activityText = theme.fg("error", `[${agent.status.replace("_", " ")}]`);
  } else if (agent.status === "queued") {
    activityText = theme.fg("dim", "[queued]");
  } else {
    activityText = theme.fg("dim", "—");
  }

  const elapsed = agentElapsed(agent, clock());
  const time = elapsed !== undefined ? formatDuration(elapsed) : "—";
  const calls = `t${agent.turns ?? 0}`;
  const toolCallStr = String(agent.toolCalls ?? 0);
  const tokens = agent.usage?.output !== undefined ? formatTokens(agent.usage.output) : "—";

  const glyphW = 2;
  // Name column: up to 20 visible chars (depth eats into this via indent)
  const nameW = Math.min(20, Math.max(4, vw(rawName)));
  const callsW = 4;   // "t0".."t99"
  const toolW  = 4;   // calls
  const tokensW = 6;
  const timeW  = 6;
  const gap = 1;

  const tryCols = (
    keepTime: boolean,
    keepTokens: boolean,
    keepCalls: boolean,
    keepToolCalls: boolean,
  ): string | null => {
    const cells: Array<{ text: string; width: number; align?: "left" | "right" }> = [
      { text: glyph, width: glyphW },
      { text: rawName, width: nameW },
      { text: activityText, width: 1 }, // flex — fills remaining space
    ];
    if (keepToolCalls) cells.push({ text: toolCallStr, width: toolW, align: "right" });
    if (keepCalls) cells.push({ text: calls, width: callsW, align: "right" });
    if (keepTokens) cells.push({ text: tokens, width: tokensW, align: "right" });
    if (keepTime) cells.push({ text: time, width: timeW, align: "right" });
    const fixedWidth =
      cells.reduce((s, c) => s + c.width, 0) + gap * Math.max(0, cells.length - 1);
    const activityW = width - fixedWidth;
    if (activityW < 4) return null;
    cells[2].width = activityW;
    return cols(cells, gap);
  };

  const row =
    tryCols(true,  true,  true,  true)  ??
    tryCols(false, true,  true,  true)  ??
    tryCols(false, false, true,  true)  ??
    tryCols(false, false, true,  false) ??
    tryCols(false, false, false, false) ??
    cols([{ text: glyph, width: glyphW }, { text: rawName, width: nameW }], gap);

  const content = fit(row, width - 2);
  const out = `${gutter} ${content}`;

  // Dim completed rows; keep failed/stopped rows in default colour for readability.
  if (agent.status === "completed") {
    return theme.fg("muted", out);
  }
  return out;
}

/** Strip control characters and collapse whitespace for safe terminal display. */
export function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : safeJson(value);
  return oneLine(s);
}

/** Render an object as compact JSON, falling back to String(value). */
export function safeJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Single-line: strip control chars, collapse whitespace, trim. */
export function oneLine(value: string | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

/** Width alias so UI code reads `vw(text)` instead of `visibleWidth(text)`. */
export const vw = visibleWidth;

/** Truncate to fit within `width` visible columns, never splitting ANSI. */
export function fit(text: string, width: number, ellipsis = "…"): string {
  if (visibleWidth(text) <= width) return text;
  const keep = Math.max(0, width - visibleWidth(ellipsis));
  return sliceByColumn(text, 0, keep, true) + ellipsis;
}

/** Pad `text` on the right to `width` visible columns. */
export function padEnd(text: string, width: number): string {
  const pad = Math.max(0, width - vw(text));
  return text + " ".repeat(pad);
}

/** Pad `text` on the left to `width` visible columns. */
export function padStart(text: string, width: number): string {
  const pad = Math.max(0, width - vw(text));
  return " ".repeat(pad) + text;
}

/** Truncate to fit within `width` visible columns, never splitting ANSI. */
export function truncate(text: string, width: number): string {
  return fit(text, width);
}

/**
 * Render a fixed column grid. Each cell is truncated/padded to its column
 * width; metric columns are right-aligned. `gap` is the space between cells.
 */
export function cols(
  cells: Array<{ text: string; width: number; align?: "left" | "right" }>,
  gap = 1,
): string {
  const sep = " ".repeat(gap);
  return cells
    .map((cell) => {
      const content = fit(cell.text, cell.width);
      return cell.align === "right" ? padStart(content, cell.width) : padEnd(content, cell.width);
    })
    .join(sep);
}

/**
 * A two-segment status line, e.g. "branch ◂ tokens · phase · cost".
 * Keeps output stable across widths.
 */
export function statusLine(parts: Array<string | undefined>): string {
  return parts.filter((p) => p && p.length > 0).join(" · ");
}

// ── theme-colored helpers (only used by TUI components) ─────────────────

/** Status glyph for an activity/run status (uncolored, for plain-text surfaces). */
export function statusGlyph(status: UiStatus): string {
  return STATUS_STYLE[status].glyph;
}

/** Colored status glyph using a pi-coding-agent Theme (static, no animation). */
export function colorStatus(theme: Theme, status: UiStatus): string {
  const style = STATUS_STYLE[status];
  return theme.fg(style.token, style.glyph);
}

/** Single source of truth for the status line / widget title text.
 * Pure in the snapshot + clock — no theme, no side effects. Every surface
 * (status bar, footer run segment, widget title) renders from this summary.
 */
export interface StatusSummary {
  /** Whether a run/agent is currently active. */
  active: boolean;
  /** Uncolored status glyph. */
  glyph: string;
  /** Run name, or "forgery" when idle/recent. */
  label: string;
  /** Call count, if any. */
  calls: number | undefined;
  /** Token count, if any. */
  tokens: number | undefined;
  /** Cost, if any. */
  cost: number | undefined;
  /** Elapsed ms for an active run, or frozen wall time for a finished run. */
  elapsed: number | undefined;
  /** Subgoal completed/total, if any subgoals exist. */
  subgoal?: { completed: number; total: number };
  /** Raw status string of the active/recent run. */
  status: string;
}

/** Build a status summary purely from the activity snapshot and clock. */
export function summarizeStatus(
  snap: ForgerySnapshot,
  clock: () => number,
): StatusSummary {
  const active = snap.runs.find((r) => r.status === "running");
  const target = active ?? snap.runs[0];
  if (target) {
    const callTotals = target.calls.reduce<{ tokens?: number; cost?: number }>((totals, call) => {
      if (call.metrics?.tokens !== undefined) {
        totals.tokens = (totals.tokens ?? 0) + call.metrics.tokens;
      }
      if (call.metrics?.cost !== undefined) {
        totals.cost = (totals.cost ?? 0) + call.metrics.cost;
      }
      return totals;
    }, {});
    const runTokens = target.metrics?.tokens;
    const runCost = target.metrics?.cost;
    return {
      active: active !== undefined,
      glyph: statusGlyph(target.status),
      label: target.name,
      calls: target.calls.length,
      tokens: runTokens !== undefined && runTokens !== 0
        ? runTokens
        : callTotals.tokens ?? runTokens,
      cost: runCost !== undefined && runCost !== 0
        ? runCost
        : callTotals.cost ?? runCost,
      elapsed: active
        ? target.startedAt !== undefined ? clock() - target.startedAt : undefined
        : target.finishedAt !== undefined ? target.finishedAt - target.startedAt : undefined,
      subgoal: target.subgoals.length > 0
        ? {
            completed: target.subgoals.filter((s) => s.status === "completed").length,
            total: target.subgoals.length,
          }
        : undefined,
      status: target.status,
    };
  }
  return {
    active: false,
    glyph: "",
    label: "forgery",
    calls: undefined,
    tokens: undefined,
    cost: undefined,
    elapsed: undefined,
    status: "",
  };
}

/** Shared run telemetry for the compact status string and custom footer. */
export function formatStatusMetrics(summary: StatusSummary): string {
  return statusLine([
    summary.calls !== undefined
      ? `${summary.calls} ${summary.calls === 1 ? "call" : "calls"}`
      : undefined,
    summary.tokens !== undefined ? `${formatTokens(summary.tokens)} tok` : undefined,
    summary.cost !== undefined && summary.cost !== 0 ? formatCost(summary.cost) : undefined,
    summary.elapsed !== undefined ? formatDuration(summary.elapsed) : undefined,
    summary.subgoal
      ? `subgoals ${summary.subgoal.completed}/${summary.subgoal.total}`
      : undefined,
  ]);
}

/** Compact status string from a summary.
 *  e.g. "⠹ forgery · 2 calls · 1m12s" or "✓ forgery completed · $0.42". */
export function formatStatusSummary(summary: StatusSummary): string {
  const metrics = formatStatusMetrics(summary);
  if (!summary.active) {
    if (!summary.status) return "forgery · idle";
    return statusLine([`${summary.glyph} ${summary.label} ${summary.status}`, metrics]);
  }
  return statusLine([`${summary.glyph} ${summary.label}`, metrics]);
}

/** Colored, truncated, single-line label. */
export function colorSafe(theme: Theme, text: string): string {
  return theme.fg("text", safeText(text));
}

// ── box drawing (for beautiful terminal output) ──────────────────────────

const BOX = {
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│",
};

/** Wrap lines in a width-aware box-drawing border. Returns the boxed lines. */
export function box(lines: string[], title?: string): string[] {
  if (lines.length === 0) return [];
  const pad = title ? 2 : 0;
  const contentWidth = Math.max(...lines.map((l) => vw(l)));
  const width = contentWidth + pad + 4; // 2 for borders + 2 for inner padding

  let top: string;
  if (title) {
    const titleLen = vw(title);
    const innerWidth = width - 4; // space between borders
    const available = innerWidth - titleLen - 2; // 2 for spaces around title
    const left = Math.max(0, Math.floor(available / 2));
    const right = Math.max(0, available - left);
    top = `${BOX.tl}${BOX.h.repeat(left)} ${title} ${BOX.h.repeat(right)}${BOX.tr}`;
  } else {
    top = BOX.tl + BOX.h.repeat(width - 2) + BOX.tr;
  }
  const body = lines.map((l) => BOX.v + " " + padEnd(l, width - 4) + " " + BOX.v);
  const bottom = BOX.bl + BOX.h.repeat(width - 2) + BOX.br;
  return [top, ...body, bottom];
}

const PANEL = {
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
  h: "─",
  v: "│",
};

/** Wrap lines in a rounded, width-aware panel with optional top title and bottom hint. */
export function panel(
  lines: string[],
  opts: { title?: string; bottom?: string } = {},
): string[] {
  const hasContent = lines.length > 0 || !!opts.title || !!opts.bottom;
  if (!hasContent) return [];
  const contentWidth = Math.max(...lines.map((l) => vw(l)));
  const titleW = opts.title ? vw(opts.title) + 2 : 0;
  const bottomW = opts.bottom ? vw(opts.bottom) + 2 : 0;
  const width = Math.max(contentWidth, titleW, bottomW) + 4; // 2 borders + 2 padding

  const inner = width - 4;
  const top = opts.title
    ? borderedTitle(PANEL, opts.title, inner, width)
    : PANEL.tl + PANEL.h.repeat(width - 2) + PANEL.tr;

  const body = lines.map((l) => PANEL.v + " " + padEnd(l, width - 4) + " " + PANEL.v);
  const btm = opts.bottom
    ? borderedTitle(PANEL, opts.bottom, inner, width)
    : PANEL.bl + PANEL.h.repeat(width - 2) + PANEL.br;
  return [top, ...body, btm];
}

/** Build a border line with a centered title (reused by box and panel). */
function borderedTitle(
  corners: { tl: string; tr: string; bl: string; br: string; h: string; v: string },
  title: string,
  inner: number,
  width: number,
): string {
  const titleLen = vw(title);
  const available = inner - titleLen - 2; // 2 for spaces around title
  const left = Math.max(0, Math.floor(available / 2));
  const right = Math.max(0, available - left);
  return `${corners.tl}${corners.h.repeat(left)} ${title} ${corners.h.repeat(right)}${corners.tr}`;
}

/** Format a single call's summary line for display. */
export function formatCallSummary(
  ref: string,
  status: UiStatus,
  durationMs: number | undefined,
  metrics?: { tokens?: number; cost?: number },
): string {
  const glyph = statusGlyph(status);
  const dur = durationMs !== undefined ? ` ${formatDuration(durationMs)}` : "";
  const tok = metrics?.tokens !== undefined ? ` ${formatTokens(metrics.tokens)} tok` : "";
  const cst = metrics?.cost !== undefined && metrics.cost > 0 ? ` ${formatCost(metrics.cost)}` : "";
  return `${glyph} ${ref}${dur}${tok}${cst}`;
}
