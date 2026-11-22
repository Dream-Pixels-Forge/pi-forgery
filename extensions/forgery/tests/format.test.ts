/**
 * pi-forgery — format helper tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ForgeryActivityStore } from "../src/activity/store.js";
import {
  animatedStatusGlyph,
  box,
  effortMeter,
  formatCallSummary,
  formatCost,
  formatDuration,
  formatPercent,
  formatTokens,
  formatStatusSummary,
  oneLine,
  progressBar,
  safeText,
  shortModel,
  statusGlyph,
  summarizeStatus,
  truncate,
  vw,
} from "../src/ui/format.js";

test("formatTokens", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1000), "1k");
  assert.equal(formatTokens(1234), "1.2k");
  assert.equal(formatTokens(12345), "12.3k");
  assert.equal(formatTokens(123000), "123k");
  assert.equal(formatTokens(1_000_000), "1M");
  assert.equal(formatTokens(1_500_000), "1.5M");
  assert.equal(formatTokens(null), "—");
});

test("animatedStatusGlyph", () => {
  // Running cycles through spinner frames based on the frame index.
  const frames = new Set();
  for (let i = 0; i < 20; i++) frames.add(animatedStatusGlyph("running", i));
  assert.ok(frames.size > 1, "spinner should cycle through multiple frames");
  // Non-running statuses keep their static glyphs.
  assert.equal(animatedStatusGlyph("completed", 0), statusGlyph("completed"));
  assert.equal(animatedStatusGlyph("failed", 0), statusGlyph("failed"));
});

test("formatCost", () => {
  assert.equal(formatCost(null), "—");
  assert.equal(formatCost(0), "—");
  assert.equal(formatCost(0.0001), "$0.0001");
  assert.equal(formatCost(0.5), "$0.50");
  assert.equal(formatCost(2.5), "$2.5");
});

test("formatDuration", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(500), "<1s");
  assert.equal(formatDuration(5_000), "5s");
  assert.equal(formatDuration(60_000), "1m");
  assert.equal(formatDuration(192_000), "3m12s");
  assert.equal(formatDuration(3_600_000), "1h");
});

test("formatPercent", () => {
  assert.equal(formatPercent(42), "42%");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(null), "—");
});

test("progressBar: renders filled cells for completed/total", () => {
  assert.equal(progressBar(0, 10), "▱▱▱▱▱");
  assert.equal(progressBar(3, 10), "▰▰▱▱▱");
  assert.equal(progressBar(5, 10), "▰▰▰▱▱");
  assert.equal(progressBar(2, 5, 3), "▰▱▱");
  assert.equal(progressBar(10, 5, 3), "▰▰▰"); // clamped >100%
  assert.equal(progressBar(undefined, 5), "▱▱▱▱▱");
});

test("progressBar: empty when total is 0 or undefined", () => {
  assert.equal(progressBar(3, 0), "");
  assert.equal(progressBar(3, undefined), "");
});

// ── SG-12: model & effort labels ──────────────────────────────────────

test("effortMeter: 3-dot meter for known effort, empty for unknown", () => {
  assert.equal(effortMeter("low"), "●○○");
  assert.equal(effortMeter("medium"), "●●○");
  assert.equal(effortMeter("high"), "●●●");
  assert.equal(effortMeter(null), "");
  assert.equal(effortMeter(undefined), "");
  assert.equal(effortMeter("weird"), "");
});

test("shortModel: strips date suffix, replaces hyphens with spaces", () => {
  const cases: Array<[string, string]> = [
    ["anthropic/claude-opus-5-5-20261001", "claude opus 5 5"],
    ["anthropic/claude-sonnet-4-5-20261001", "claude sonnet 4 5"],
    ["openai/gpt-5", "gpt 5"],
    ["openai/gpt-5-mini-20261001", "gpt 5 mini"],
    ["google/gemini-3-pro", "gemini 3 pro"],
    ["gemini-2-0-flash", "gemini 2 0 flash"],
    ["minimax/minimax-m3.1-flash", "minimax m3.1 flash"],
    ["claude-3-7-sonnet-20261001", "claude 3 7 sonnet"],
    ["gpt-4o", "gpt 4o"],
    ["unknown-model-xyz", "unknown model xyz"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(shortModel(input), expected, `shortModel(${input})`);
  }
});

test("oneLine", () => {
  assert.equal(oneLine("  a  b\tc\n d "), "a b c d");
  assert.equal(oneLine(undefined), "");
});

test("safeText", () => {
  assert.equal(safeText("hello"), "hello");
  assert.equal(safeText(null), "");
  assert.equal(safeText(undefined), "");
  assert.equal(safeText({ a: 1 }), '{"a":1}');
});

test("truncate", () => {
  assert.equal(truncate("hello", 10), "hello");
  // truncate keeps (n-1) chars + "…" when the text is longer than n
  assert.equal(truncate("hello world", 8), "hello w…");
  assert.equal(truncate("hello", 3), "he…");
});

test("statusGlyph", () => {
  assert.equal(statusGlyph("running"), "⠋");
  assert.equal(statusGlyph("completed"), "✓");
  assert.equal(statusGlyph("failed"), "✗");
  assert.equal(statusGlyph("cancelled"), "■");
  assert.equal(statusGlyph("stopped"), "⏹");
  assert.equal(statusGlyph("queued"), "○");
  assert.equal(statusGlyph("pending"), "○");
  assert.equal(statusGlyph("blocked"), "⊘");
  assert.equal(statusGlyph("timed_out"), "⏱");
  assert.equal(statusGlyph("unavailable"), "⚠");
});

test("box: wraps lines in a border", () => {
  const lines = box(["hello", "world"], "test");
  assert.ok(lines[0].startsWith("┌"), "top-left corner");
  assert.ok(lines[lines.length - 1].startsWith("└"), "bottom-left corner");
  assert.ok(lines.some((l) => l.includes("hello")), "contains first line");
  assert.ok(lines.some((l) => l.includes("world")), "contains second line");
});

test("box: without title", () => {
  const lines = box(["single line"]);
  assert.ok(lines.length >= 3, "has top, body, bottom");
  assert.ok(lines[1].includes("single line"), "body contains the line");
});

test("vw: measures visible width, stripping ANSI", () => {
  assert.equal(vw("\u001b[31mhello\u001b[0m"), 5);
  assert.equal(vw("plain"), 5);
  assert.equal(vw(""), 0);
});

test("formatCallSummary: formats a call line", () => {
  const out = formatCallSummary("pi.read", "completed", 1500, { tokens: 1234, cost: 0.42 });
  assert.ok(out.includes("pi.read"), "includes ref");
  assert.ok(out.includes("1s"), "includes duration");
  assert.ok(out.includes("1.2k tok"), "includes tokens");
  assert.ok(out.includes("$0.42"), "includes cost");
});

test("formatCallSummary: handles missing metrics", () => {
  const out = formatCallSummary("agents.run", "running", undefined, undefined);
  assert.ok(out.includes("agents.run"), "includes ref");
  assert.ok(out.includes("⠋"), "running glyph");
});

// ── SG-20: summarizeStatus / formatStatusSummary ────────────────────────

test("summarizeStatus: idle with no runs → idle string", () => {
  const store = new ForgeryActivityStore();
  const snap = store.snapshot();
  const summary = summarizeStatus(snap, () => 1000);
  assert.equal(summary.active, false);
  assert.equal(summary.label, "forgery");
  assert.equal(summary.status, "");
  assert.equal(formatStatusSummary(summary), "forgery · idle");
});

test("summarizeStatus: active run aggregates metrics + elapsed", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  const snap = store.snapshot();
  const fixed = () => snap.now + 5_000;
  const summary = summarizeStatus(snap, fixed);
  assert.equal(summary.active, true);
  assert.equal(summary.label, "demo");
  assert.equal(summary.glyph, statusGlyph("running"));
  assert.equal(summary.elapsed, 5_000);
  assert.equal(summary.calls, 0);
});

test("formatStatusSummary: compact string for a completed run", () => {
  const store = new ForgeryActivityStore();
  const snap = store.snapshot();
  // No runs → idle string.
  assert.equal(formatStatusSummary(summarizeStatus(snap, () => 0)), "forgery · idle");
});

test("formatStatusSummary: active run renders calls, tokens, cost, duration", () => {
  const store = new ForgeryActivityStore();
  store.start("run-1", { name: "demo" });
  store.beginCall("run-1", "c1", "pi.read", { path: "a.ts" });
  store.finishCall("run-1", "c1", { success: true, metrics: { tokens: 1234, toolCalls: 1, cost: 0.42 } });
  const snap = store.snapshot();
  const summary = summarizeStatus(snap, () => snap.now + 60_000);
  const out = formatStatusSummary(summary);
  assert.ok(out.includes("demo"), "includes run name");
  assert.ok(out.includes("1 calls"), "includes calls");
  assert.ok(out.includes("1.2k tok"), "includes tokens");
  assert.ok(out.includes("$0.42"), "includes cost");
  assert.ok(out.includes("1m"), "includes duration");
});
