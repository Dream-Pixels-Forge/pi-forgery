/**
 * pi-forgery — format helper tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  animatedStatusGlyph,
  formatCost,
  formatDuration,
  formatPercent,
  formatTokens,
  oneLine,
  safeText,
  statusGlyph,
  truncate,
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
  assert.equal(animatedStatusGlyph("idle", 0), statusGlyph("idle"));
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
  assert.equal(statusGlyph("running"), "◐");
  assert.equal(statusGlyph("completed"), "✓");
  assert.equal(statusGlyph("failed"), "✗");
  assert.equal(statusGlyph("cancelled"), "■");
  assert.equal(statusGlyph("stopped"), "■");
  assert.equal(statusGlyph("weird"), "·");
});
