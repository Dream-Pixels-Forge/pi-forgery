/**
 * pi-forgery — config loader tests (v0.2).
 *
 * forgery.json is layered: defaults ← global (~/.pi/agent/forgery.json) ←
 * project (<cwd>/.pi/forgery.json). Invalid values fall back to defaults
 * instead of throwing — a bad config must never take the extension down.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfig,
  parseConfig,
} from "../src/config.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "forgery-config-"));
}

function writeProjectConfig(cwd: string, json: unknown): void {
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, ".pi", "forgery.json"), JSON.stringify(json), "utf8");
}

test("parseConfig: defaults when raw is empty", () => {
  const cfg = parseConfig(undefined);
  assert.deepEqual(cfg, {});
});

test("parseConfig: full valid override", () => {
  const cfg = parseConfig({
    agents: { maxConcurrent: 8, timeoutMs: 120000, defaultModel: "claude-sonnet" },
    budget: { maxCostPerRun: 0.5, maxTokensPerRun: 100000 },
    guardrails: { writePolicy: "confirm", bashPolicy: "block" },
    ui: { widget: false, footer: false, maxRows: 12, retainMs: 5000 },
  });
  assert.equal(cfg.agents!.maxConcurrent, 8);
  assert.equal(cfg.agents!.timeoutMs, 120000);
  assert.equal(cfg.agents!.defaultModel, "claude-sonnet");
  assert.equal(cfg.budget!.maxCostPerRun, 0.5);
  assert.equal(cfg.budget!.maxTokensPerRun, 100000);
  assert.equal(cfg.guardrails!.writePolicy, "confirm");
  assert.equal(cfg.guardrails!.bashPolicy, "block");
  assert.equal(cfg.ui!.widget, false);
  assert.equal(cfg.ui!.footer, false);
  assert.equal(cfg.ui!.maxRows, 12);
  assert.equal(cfg.ui!.retainMs, 5000);
});

test("parseConfig: invalid values keep defaults (no throw)", () => {
  const cfg = parseConfig({
    agents: { maxConcurrent: "lots", timeoutMs: -5 },
    budget: { maxCostPerRun: "free" },
    guardrails: { writePolicy: "nonsense" },
    ui: { maxRows: 0, widget: "yes" },
    unknownKey: { whatever: 1 },
  });
  // agents.maxConcurrent: invalid string -> default (4)
  assert.equal(cfg.agents!.maxConcurrent, 4);
  // agents.timeoutMs: invalid number (-5) -> clamped to minimum (1000)
  assert.equal(cfg.agents!.timeoutMs, 1000);
  // budget.maxCostPerRun: invalid string -> undefined (since no default in budget)
  assert.equal(cfg.budget!.maxCostPerRun, undefined);
  // guardrails.writePolicy: invalid string -> default ("off")
  assert.equal(cfg.guardrails!.writePolicy, "off");
  // ui.widget: invalid string -> default (true)
  assert.equal(cfg.ui!.widget, true);
  // ui.maxRows: invalid number (0) -> clamped to minimum (2)
  assert.equal(cfg.ui!.maxRows, 2);
});

test("parseConfig: partial sections merge with defaults", () => {
  const cfg = parseConfig({ agents: { maxConcurrent: 2 } });
  assert.equal(cfg.agents!.maxConcurrent, 2);
  assert.equal(cfg.agents!.timeoutMs, DEFAULT_CONFIG.agents.timeoutMs);
  assert.equal(cfg.guardrails!.writePolicy, DEFAULT_CONFIG.guardrails.writePolicy);
  assert.equal(cfg.ui!.widget, DEFAULT_CONFIG.ui.widget);
});

test("parseConfig: clamps out-of-range values", () => {
  const cfg = parseConfig({
    agents: { maxConcurrent: 100, timeoutMs: 1 },
    ui: { maxRows: 500, retainMs: -1000 },
  });
  // @ts-ignore
  assert.ok(cfg.agents!.maxConcurrent <= 32, "concurrency clamped to a sane cap");
  // @ts-ignore
  assert.ok(cfg.agents!.timeoutMs >= 1000, "timeout has a floor");
  // @ts-ignore
  assert.ok(cfg.ui!.maxRows <= 50, "widget rows clamped");
  // @ts-ignore
  assert.ok(cfg.ui!.retainMs >= 0, "retain is non-negative");
});

test("mergeConfig: override wins per-field", () => {
  const base = DEFAULT_CONFIG;
  const merged = mergeConfig(base, { agents: { maxConcurrent: 2 } });
  assert.equal(merged.agents.maxConcurrent, 2);
  assert.equal(merged.agents.timeoutMs, DEFAULT_CONFIG.agents.timeoutMs);
});

test("loadConfig: no config files → defaults", () => {
  const cwd = tempDir();
  try {
    const cfg = loadConfig(cwd, { home: tempDir() });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("loadConfig: project .pi/forgery.json overrides defaults", () => {
  const cwd = tempDir();
  try {
    writeProjectConfig(cwd, { agents: { maxConcurrent: 6 }, guardrails: { writePolicy: "confirm" } });
    const cfg = loadConfig(cwd, { home: tempDir() });
    assert.equal(cfg.agents.maxConcurrent, 6);
    assert.equal(cfg.guardrails.writePolicy, "confirm");
    assert.equal(cfg.agents.timeoutMs, DEFAULT_CONFIG.agents.timeoutMs);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("loadConfig: global config is the base, project overrides it", () => {
  const cwd = tempDir();
  const home = tempDir();
  try {
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(
      join(home, ".pi", "agent", "forgery.json"),
      JSON.stringify({ agents: { maxConcurrent: 3, timeoutMs: 90000 }, ui: { footer: false } }),
      "utf8",
    );
    writeProjectConfig(cwd, { agents: { maxConcurrent: 7 } });

    const cfg = loadConfig(cwd, { home });
    // project wins for maxConcurrent…
    assert.equal(cfg.agents.maxConcurrent, 7);
    // …global survives for the fields the project didn't touch…
    assert.equal(cfg.agents.timeoutMs, 90000);
    assert.equal(cfg.ui.footer, false);
    // …and defaults survive where neither file spoke.
    assert.equal(cfg.guardrails.writePolicy, "off");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("loadConfig: malformed JSON is ignored, not fatal", () => {
  const cwd = tempDir();
  try {
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "forgery.json"), "{ not valid json !!", "utf8");
    const cfg = loadConfig(cwd, { home: tempDir() });
    assert.deepEqual(cfg, DEFAULT_CONFIG);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
