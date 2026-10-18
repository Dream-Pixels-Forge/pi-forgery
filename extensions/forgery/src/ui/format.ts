/**
 * pi-forgery — pure text presenters.
 * No host, no theme. Every function here returns a plain string so it is
 * trivially unit-testable and usable from both TUI components and CLI.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";

/** 1234 → "1.2k", 123000 → "123k", <1000 → raw digits. */
export function formatTokens(count: number | null | undefined): string {
  if (count === null || count === undefined) return "—";
  if (count < 1000) return String(count);
  const k = count / 1000;
  if (k < 100) return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(k)}k`;
}

/** Format a dollar amount. Undefined/0 → "—". */
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined || cost === 0) return "—";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(1)}`;
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

/** Context usage percent → "42%" or "—". */
export function formatPercent(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p)}%`;
}

/** Strip control characters and collapse whitespace for safe terminal display. */
export function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : safeJson(value);
  return s.replace(/[\u0000-\u001F]/g, "");
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

/** Single-line: whitespace collapsed, trimmed. */
export function oneLine(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Truncate to N chars with an ellipsis. */
export function truncate(text: string, n: number): string {
  if (text.length <= n) return text;
  return `${text.slice(0, Math.max(0, n - 1))}…`;
}

/**
 * A two-segment status line, e.g. "branch ◂ tokens · phase · cost".
 * Keeps output stable across widths.
 */
export function statusLine(parts: Array<string | undefined>): string {
  return parts.filter((p) => p && p.length > 0).join(" · ");
}

// ── theme-colored helpers (only used by TUI components) ─────────────────

/** Status glyph + color for an activity/run status. */
export function statusGlyph(status: string): string {
  switch (status) {
    case "running":
      return "◐";
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "cancelled":
    case "stopped":
      return "■";
    default:
      return "·";
  }
}

/** Colored status glyph using a pi-coding-agent Theme. */
export function colorStatus(theme: Theme, status: string): string {
  const g = statusGlyph(status);
  switch (status) {
    case "running":
      return theme.fg("accent", g);
    case "completed":
      return theme.fg("success", g);
    case "failed":
      return theme.fg("error", g);
    case "cancelled":
    case "stopped":
      return theme.fg("warning", g);
    default:
      return theme.fg("dim", g);
  }
}

/** Colored, truncated, single-line label. */
export function colorSafe(theme: Theme, text: string): string {
  return theme.fg("text", safeText(text));
}
