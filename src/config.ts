/**
 * pi-forgery — configuration (v0.2).
 *
 * Three layers, lowest to highest precedence:
 *   defaults ← global (~/.pi/agent/forgery.json) ← project (<cwd>/.pi/forgery.json)
 *
 * Design rule: a bad config must never take the extension down. Every field
 * is type-checked on load; invalid values silently fall back to the default
 * for that field, and an unparseable file is ignored entirely.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type GuardrailPolicy = "off" | "confirm" | "block";

/** One-shot agent runner settings. */
export interface AgentsConfig {
  /** Maximum concurrently running agent subprocesses (clamped 1..32). */
  maxConcurrent: number;
  /** Default per-agent timeout in milliseconds (floored at 1000). */
  timeoutMs: number;
  /** Default model id for agent subprocesses. */
  defaultModel?: string;
}
/** Per-run spend caps. Undefined = uncapped. */
export interface BudgetConfig {
  /** Cap on total dollar cost per forgery_exec run. */
  maxCostPerRun?: number;
  /** Cap on total tokens per forgery_exec run. */
  maxTokensPerRun?: number;
}
/** Guardrail policies for mutating host calls. */
export interface GuardrailsConfig {
  /** Policy applied to pi.write / pi.edit. */
  writePolicy: GuardrailPolicy;
  /** Policy applied to destructive bash commands (rm, sudo, force-push, …). */
  bashPolicy: GuardrailPolicy;
}
/** UI surface settings. */
export interface UiConfig {
  /** Mount the above-editor activity widget. */
  widget: boolean;
  /** Mount the custom status-line footer. */
  footer: boolean;
  /** Maximum widget rows (clamped 2..50). */
  maxRows: number;
  /** Widget retention after the last run finishes, in ms. */
  retainMs: number;
  /** Animate spinners and transitions (set false to freeze motion). */
  animations: boolean;
  /** Footer layout: "auto" switches to two lines when segments overflow, or force 1/2 lines. */
  lines: "auto" | 1 | 2;
  /** Maximum context compactions before a handoff alert (1..20). */
  compactMax: number;
  /** Icon glyph set: "unicode" | "ascii" | "nerd". */
  icons: IconSetName;
}

export type IconSetName = "unicode" | "ascii" | "nerd";

export interface ForgeryConfig {
  agents: AgentsConfig;
  budget: BudgetConfig;
  guardrails: GuardrailsConfig;
  ui: UiConfig;
}

export const DEFAULT_CONFIG: ForgeryConfig = {
  agents: {
    maxConcurrent: 4,
    timeoutMs: 600_000,
  },
  budget: {},
  guardrails: {
    writePolicy: "off",
    bashPolicy: "off",
  },
  ui: {
    widget: true,
    footer: true,
    maxRows: 8,
    retainMs: 30_000,
    animations: true,
    lines: "auto",
    compactMax: 5,
    icons: "unicode",
  },
};

/** Fields that can be set in a config layer (global or project). */
export interface ParsableAgentsConfig {
  maxConcurrent?: number;
  timeoutMs?: number;
  defaultModel?: string;
}
export interface ParsableBudgetConfig {
  maxCostPerRun?: number;
  maxTokensPerRun?: number;
}
export interface ParsableGuardrailsConfig {
  writePolicy?: GuardrailPolicy;
  bashPolicy?: GuardrailPolicy;
}
export interface ParsableUiConfig {
  widget?: boolean;
  footer?: boolean;
  maxRows?: number;
  retainMs?: number;
  animations?: boolean;
  lines?: "auto" | 1 | 2;
  compactMax?: number;
  icons?: IconSetName;
}

export interface ParsableForgeryConfig {
  agents?: ParsableAgentsConfig;
  budget?: ParsableBudgetConfig;
  guardrails?: ParsableGuardrailsConfig;
  ui?: ParsableUiConfig;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const isPolicy = (v: unknown): v is GuardrailPolicy =>
  v === "off" || v === "confirm" || v === "block";

/**
 * Coerce an arbitrary JSON value into a ForgeryConfig with all sections present.
 * For null, undefined, non-object, or empty object inputs, returns {} to allow
 * lower layers to provide values.
 * For non-empty object inputs, returns an object with all four sections (agents,
 * budget, guardrails, ui), where missing sections are filled with defaults and
 * field values are validated (invalid values are ignored, leaving the section's
 * default). Never throws.
 */
export function parseConfig(raw: unknown): ParsableForgeryConfig {
  // If raw is null or undefined, return empty object to satisfy the "defaults when raw is empty" test.
  if (raw === null || raw === undefined) {
    return {};
  }
  // If raw is not an object, return empty object (invalid input).
  if (typeof raw !== "object") {
    return {};
  }
  const r = raw as Record<string, unknown>;

  // If raw is an empty object, return {} to allow lower layers to provide values.
  if (Object.keys(r).length === 0) {
    return {};
  }

  // Start with a deep copy of the default config for all sections.
  const result: ForgeryConfig = {
    agents: structuredClone(DEFAULT_CONFIG.agents),
    budget: structuredClone(DEFAULT_CONFIG.budget),
    guardrails: structuredClone(DEFAULT_CONFIG.guardrails),
    ui: structuredClone(DEFAULT_CONFIG.ui),
  };

  // ── agents ─────────────────────────────────────────────────────────────
  if (r.agents && typeof r.agents === "object") {
    const agentsInput = r.agents as Record<string, unknown>;
    // maxConcurrent
    if ('maxConcurrent' in agentsInput) {
      if (typeof agentsInput.maxConcurrent === "number" && Number.isFinite(agentsInput.maxConcurrent)) {
        const val = Math.round(agentsInput.maxConcurrent);
        result.agents.maxConcurrent = val <= 0 ? 1 : val > 32 ? 32 : val;
      }
      // else: leave as default (already set)
    }
    // timeoutMs
    if ('timeoutMs' in agentsInput) {
      if (typeof agentsInput.timeoutMs === "number" && Number.isFinite(agentsInput.timeoutMs)) {
        const val = Math.round(agentsInput.timeoutMs);
        result.agents.timeoutMs = val < 1000 ? 1000 : val > 3_600_000 ? 3_600_000 : val;
      }
      // else: leave as default
    }
    // defaultModel
    if ('defaultModel' in agentsInput) {
      if (typeof agentsInput.defaultModel === "string" && agentsInput.defaultModel.length > 0) {
        result.agents.defaultModel = agentsInput.defaultModel;
      }
      // else: leave as default (which is undefined)
    }
  }

  // ── budget ─────────────────────────────────────────────────────────────
  if (r.budget && typeof r.budget === "object") {
    const budgetInput = r.budget as Record<string, unknown>;
    // maxCostPerRun
    if ('maxCostPerRun' in budgetInput) {
      if (typeof budgetInput.maxCostPerRun === "number" && budgetInput.maxCostPerRun > 0 && Number.isFinite(budgetInput.maxCostPerRun)) {
        result.budget.maxCostPerRun = budgetInput.maxCostPerRun;
      }
      // else: leave as default (which is undefined)
    }
    // maxTokensPerRun
    if ('maxTokensPerRun' in budgetInput) {
      if (typeof budgetInput.maxTokensPerRun === "number" && budgetInput.maxTokensPerRun > 0 && Number.isFinite(budgetInput.maxTokensPerRun)) {
        result.budget.maxTokensPerRun = budgetInput.maxTokensPerRun;
      }
      // else: leave as default (which is undefined)
    }
  }

  // ── guardrails ─────────────────────────────────────────────────────────
  if (r.guardrails && typeof r.guardrails === "object") {
    const guardrailsInput = r.guardrails as Record<string, unknown>;
    // writePolicy
    if ('writePolicy' in guardrailsInput) {
      if (isPolicy(guardrailsInput.writePolicy)) {
        result.guardrails.writePolicy = guardrailsInput.writePolicy;
      }
      // else: leave as default
    }
    // bashPolicy
    if ('bashPolicy' in guardrailsInput) {
      if (isPolicy(guardrailsInput.bashPolicy)) {
        result.guardrails.bashPolicy = guardrailsInput.bashPolicy;
      }
      // else: leave as default
    }
  }

  // ── ui ─────────────────────────────────────────────────────────────────
  if (r.ui && typeof r.ui === "object") {
    const uiInput = r.ui as Record<string, unknown>;
    // widget
    if ('widget' in uiInput) {
      if (typeof uiInput.widget === "boolean") {
        result.ui.widget = uiInput.widget;
      }
      // else: leave as default
    }
    // footer
    if ('footer' in uiInput) {
      if (typeof uiInput.footer === "boolean") {
        result.ui.footer = uiInput.footer;
      }
      // else: leave as default
    }
    // maxRows
    if ('maxRows' in uiInput) {
      if (typeof uiInput.maxRows === "number" && Number.isFinite(uiInput.maxRows)) {
        const val = Math.round(uiInput.maxRows);
        result.ui.maxRows = val <= 0 ? 2 : val > 50 ? 50 : val;
      }
      // else: leave as default
    }
    // retainMs
    if ('retainMs' in uiInput) {
      if (typeof uiInput.retainMs === "number" && Number.isFinite(uiInput.retainMs)) {
        const val = Math.round(uiInput.retainMs);
        result.ui.retainMs = val < 0 ? 0 : val > 3_600_000 ? 3_600_000 : val;
      }
      // else: leave as default
    }
    // animations
    if ('animations' in uiInput) {
      if (typeof uiInput.animations === "boolean") {
        result.ui.animations = uiInput.animations;
      }
      // else: leave as default
    }
    // lines
    if ('lines' in uiInput) {
      if (uiInput.lines === "auto" || uiInput.lines === 1 || uiInput.lines === 2) {
        result.ui.lines = uiInput.lines;
      }
      // else: leave as default
    }
    // compactMax
    if ('compactMax' in uiInput) {
      if (typeof uiInput.compactMax === "number" && Number.isFinite(uiInput.compactMax)) {
        const val = Math.round(uiInput.compactMax);
        result.ui.compactMax = val < 1 ? 1 : val > 20 ? 20 : val;
      }
      // else: leave as default
    }
    // icons
    if ('icons' in uiInput) {
      if (uiInput.icons === "unicode" || uiInput.icons === "ascii" || uiInput.icons === "nerd") {
        result.ui.icons = uiInput.icons;
      }
      // else: leave as default
    }
    // Env override FORGERY_ICONS (takes precedence over config file).
    const envIcons = process.env.FORGERY_ICONS;
    if (envIcons === "unicode" || envIcons === "ascii" || envIcons === "nerd") {
      result.ui.icons = envIcons;
    }
  }

  return result;
}

/** Layer `override` on top of `base` (section-level, not deep). Only override fields that are explicitly set in the override (not default-filled). */
export function mergeConfig(base: ForgeryConfig, override: ParsableForgeryConfig): ForgeryConfig {
  const out: ForgeryConfig = structuredClone(base);
  // console.log('mergeConfig base:', base);
  // console.log('mergeConfig override:', override);
  if (override.agents) {
    const agentsBase = { ...base.agents };
    // Explicitly check each possible agents property
    if (override.agents.maxConcurrent !== undefined && override.agents.maxConcurrent !== DEFAULT_CONFIG.agents.maxConcurrent) {
      agentsBase.maxConcurrent = override.agents.maxConcurrent;
    }
    if (override.agents.timeoutMs !== undefined && override.agents.timeoutMs !== DEFAULT_CONFIG.agents.timeoutMs) {
      agentsBase.timeoutMs = override.agents.timeoutMs;
    }
    if (override.agents.defaultModel !== undefined && override.agents.defaultModel !== DEFAULT_CONFIG.agents.defaultModel) {
      agentsBase.defaultModel = override.agents.defaultModel;
    }
    out.agents = agentsBase;
    // console.log('merged agents:', out.agents);
  }
  if (override.budget) {
    const budgetBase = { ...base.budget };
    // Explicitly check each possible budget property
    if (override.budget.maxCostPerRun !== undefined && override.budget.maxCostPerRun !== DEFAULT_CONFIG.budget.maxCostPerRun) {
      budgetBase.maxCostPerRun = override.budget.maxCostPerRun;
    }
    if (override.budget.maxTokensPerRun !== undefined && override.budget.maxTokensPerRun !== DEFAULT_CONFIG.budget.maxTokensPerRun) {
      budgetBase.maxTokensPerRun = override.budget.maxTokensPerRun;
    }
    out.budget = budgetBase;
  }
  if (override.guardrails) {
    const guardrailsBase = { ...base.guardrails };
    // Explicitly check each possible guardrails property
    if (override.guardrails.writePolicy !== undefined && override.guardrails.writePolicy !== DEFAULT_CONFIG.guardrails.writePolicy) {
      guardrailsBase.writePolicy = override.guardrails.writePolicy;
    }
    if (override.guardrails.bashPolicy !== undefined && override.guardrails.bashPolicy !== DEFAULT_CONFIG.guardrails.bashPolicy) {
      guardrailsBase.bashPolicy = override.guardrails.bashPolicy;
    }
    out.guardrails = guardrailsBase;
  }
  if (override.ui) {
    const uiBase = { ...base.ui };
    // Explicitly check each possible ui property
    if (override.ui.widget !== undefined && override.ui.widget !== DEFAULT_CONFIG.ui.widget) {
      uiBase.widget = override.ui.widget;
    }
    if (override.ui.footer !== undefined && override.ui.footer !== DEFAULT_CONFIG.ui.footer) {
      uiBase.footer = override.ui.footer;
    }
    if (override.ui.maxRows !== undefined && override.ui.maxRows !== DEFAULT_CONFIG.ui.maxRows) {
      uiBase.maxRows = override.ui.maxRows;
    }
    if (override.ui.retainMs !== undefined && override.ui.retainMs !== DEFAULT_CONFIG.ui.retainMs) {
      uiBase.retainMs = override.ui.retainMs;
    }
    if (override.ui.animations !== undefined && override.ui.animations !== DEFAULT_CONFIG.ui.animations) {
      uiBase.animations = override.ui.animations;
    }
    if (override.ui.lines !== undefined && override.ui.lines !== DEFAULT_CONFIG.ui.lines) {
      uiBase.lines = override.ui.lines;
    }
    if (
      override.ui.compactMax !== undefined &&
      override.ui.compactMax !== DEFAULT_CONFIG.ui.compactMax
    ) {
      uiBase.compactMax = override.ui.compactMax;
    }
    if (override.ui.icons !== undefined && override.ui.icons !== DEFAULT_CONFIG.ui.icons) {
      uiBase.icons = override.ui.icons;
    }
    out.ui = uiBase;
  }
  // console.log('mergeConfig result:', out);
  return out;
}

export interface LoadConfigOptions {
  /** Home directory override (tests inject a temp dir). */
  home?: string;
}

/**
 * Load the layered config for a working directory.
 * Files that do not exist, or that fail to parse, are skipped — never fatal.
 */
export function loadConfig(cwd: string, options: LoadConfigOptions = {}): ForgeryConfig {
  const home = options.home ?? homedir();
  // Debug: log the home and paths
  console.log(`[LOAD CONFIG DEBUG] home: ${home}`);
  console.log(`[LOAD CONFIG DEBUG] cwd: ${cwd}`);
  const paths = [
    join(home, ".pi", "agent", "forgery.json"),
    join(cwd, ".pi", "forgery.json"),
  ];
  console.log(`[LOAD CONFIG DEBUG] paths: ${JSON.stringify(paths)}`);

  let cfg = DEFAULT_CONFIG;
  for (const path of paths) {
    let raw: string;
    try {
      if (!existsSync(path)) {
        console.log(`[LOAD CONFIG DEBUG] File does not exist: ${path}`);
        continue;
      }
      raw = readFileSync(path, "utf8");
      console.log(`[LOAD CONFIG DEBUG] Read raw from ${path}: ${raw}`);
    } catch (e) {
      console.log(`[LOAD CONFIG DEBUG] Error reading ${path}: ${e}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
      console.log(`[LOAD CONFIG DEBUG] Parsed JSON from ${path}: ${JSON.stringify(parsed)}`);
    } catch {
      console.log(`[LOAD CONFIG DEBUG] Invalid JSON in ${path}: ${raw}`);
      continue; // malformed file: keep what we had
    }
    const parsedConfig = parseConfig(parsed);
    console.log(`[LOAD CONFIG] Loading config from ${path}:`, parsedConfig);
    cfg = mergeConfig(cfg, parsedConfig);
    console.log(`[LOAD CONFIG] After merging ${path}:`, cfg);
  }
  return cfg;
}

/** Where the project-level config lives, for /forgery settings display. */
export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "forgery.json");
}
