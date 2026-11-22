/**
 * pi-forgery — UI controller.
 *
 * Mounts/unmounts the activity widget and the custom footer, opens the
 * dashboard overlay, and refreshes them on activity-store / agent-runner
 * revision changes (debounced to ~100 ms). Also mirrors a compact status
 * string into `setStatus("forgery", …)` so Pi's *built-in* footer shows
 * live state when another extension reclaims the custom footer slot.
 *
 * The controller is pure: it only talks to `ExtensionUIContext` + the
 * TUI handed to the `ui.custom` factory. No host, no fs, no timers that
 * outlive `stop()`.
 */

import type { ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { ForgeryActivityStore } from "../activity/store";
import { AgentRunner } from "../agents/runner";
import type { CostManager } from "../agents/cost-manager";
import type { ForgerySnapshot } from "../activity/types";
import { ForgeryDashboard } from "./dashboard";
import { ForgeryFooter, type ForgeryFooterContext } from "./footer";
import { ForgeryWidget, type ForgeryWidgetInteraction } from "./widget";
import {
  formatStatusSummary,
  summarizeStatus,
} from "./format";
import { GitBranchReader } from "../git";
import { GitHubStatsReader } from "../git/githubStats";
import { ContextUsageReader } from "./contextUsageReader";

const REFRESH_MS = 100;
/** How often the TUI is asked for a frame so live readouts keep ticking. */
const HEARTBEAT_MS = 1000;
const STATUS_KEY = "forgery";
/** Context percent above which we auto-compact the active run. */
const COMPACT_THRESHOLD_PCT = 85;
/** Minimum ms between automatic compactions to avoid refresh loops. */
const COMPACT_COOLDOWN_MS = 60_000;

export interface ForgeryUiOptions {
  /** Max widget rows. Defaults to 8. */
  maxRows?: number;
  /** Retain the widget after the last run finishes. Defaults to 30 s. */
  retainMs?: number;
  /** Enable the above-editor widget. Defaults to true. */
  widget?: boolean;
  /** Enable the custom footer. Defaults to true. */
  footer?: boolean;
  /** Animate spinners and transitions. Defaults to true. */
  animations?: boolean;
  /** Footer layout: "auto" | 1 | 2. Defaults to "auto". */
  lines?: "auto" | 1 | 2;
  /** Maximum context compactions before a handoff alert (1..20). Defaults to 5. */
  compactMax?: number;
}

export class ForgeryUiController {
  private store: ForgeryActivityStore;
  private runner: AgentRunner;
  private costManager: CostManager;
  private options: Required<ForgeryUiOptions>;

  private ui?: ExtensionUIContext;
  /** The live extension context — read on demand, never captured by value. */
  private ctx?: ExtensionContext;
  private hostCalls: string[];
  private footer?: ForgeryFooter;
  private widget?: ForgeryWidget;
  private refreshTimer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private unsubscribeStore?: () => void;
  private unsubscribeAgents?: () => void;
  private started = false;
  /** Runs currently over soft budget threshold — tracked to avoid duplicate events. */
  #budgetWarned = new Set<string>();
  /** Runs currently over hard budget — tracked to avoid duplicate stop events. */
  #budgetStopped = new Set<string>();
  private gitBranchReader: GitBranchReader;
  private githubStats: GitHubStatsReader;
  private contextUsageReader: ContextUsageReader;
  /** Request a TUI re-render when async cache refreshes. */
  #requestRender = (): void => {
    this.#tui()?.requestRender();
  };
  /** Timestamp of the last auto-compaction, to enforce the cooldown. */
  #lastCompactAt = 0;
  /** Wall-clock source for deterministic status rendering (SG-14/SG-20). */
  #clock = Date.now;

  constructor(
    store: ForgeryActivityStore,
    runner: AgentRunner,
    costManager: CostManager,
    hostCalls: string[],
    options: ForgeryUiOptions = {},
  ) {
    this.store = store;
    this.runner = runner;
    this.costManager = costManager;
    this.hostCalls = hostCalls;
    this.gitBranchReader = new GitBranchReader(this.#requestRender);
    this.githubStats = new GitHubStatsReader(undefined, this.#requestRender);
    this.contextUsageReader = new ContextUsageReader(() => this.ctx);
    this.options = {
      maxRows: options.maxRows ?? 8,
      retainMs: options.retainMs ?? 30_000,
      widget: options.widget ?? true,
      footer: options.footer ?? true,
      animations: options.animations ?? true,
      lines: options.lines ?? "auto",
      compactMax: options.compactMax ?? 5,
    };
  }

  /** Start the UI: subscribe + mount widget/footer. Idempotent. */
  start(ctx: ExtensionContext): void {
    // Always take the newest context: Pi invalidates the previous one on
    // newSession/fork/switchSession/reload, and the footer reads it live.
    this.ctx = ctx;
    if (this.started) return;
    this.started = true;
    this.ui = ctx.ui;

    this.unsubscribeStore = this.store.subscribe(() => this.scheduleRefresh());
    this.unsubscribeAgents = this.runner.subscribe(() => this.scheduleRefresh());

    // Defer widget/footer mounting to the next microtask so pi can finish
    // its initial render cycle. This prevents blocking execSync calls
    // (git branch, gh CLI) from freezing the UI on launch.
    queueMicrotask(() => {
      if (!this.started || !this.ui) return;
      this.#mountWidget(ctx);
      this.#mountFooter(ctx);
      this.refresh();
      // pi-tui renders on demand, so ask for a frame once a second — otherwise
      // elapsed time and context usage freeze whenever nothing else changes.
      this.heartbeat = setInterval(() => this.#tick(), HEARTBEAT_MS);
      this.heartbeat.unref?.();
    });
  }

  /** Stop the UI: unsubscribe + unmount. Idempotent. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.unsubscribeStore?.();
    this.unsubscribeAgents?.();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.ui?.setWidget("forgery", undefined, { placement: "aboveEditor" });
    if (this.options.footer) this.ui?.setFooter(undefined);
    this.ui?.setStatus(STATUS_KEY, undefined);
    this.ui = undefined;
    this.ctx = undefined;
    this.footer = undefined;
    this.widget = undefined;
  }

  /** Force a refresh now. */
  refresh(): void {
    if (!this.ui || !this.started) return;
    this.#syncAgentsToStore();
    const snap = this.store.snapshot();

    // Mid-run budget enforcement: warn at 80%, hard-stop at 100%.
    this.#checkBudgets(snap);

    // Auto-compact the active run when context usage is high, respecting the
    // cooldown so a compact (which bumps the store revision) cannot retrigger
    // refresh in an infinite loop.
    this.#maybeCompact(snap);

    // Mirror a compact string into the built-in footer slot. This is also the
    // cheapest host call that asks the TUI for a frame.
    const status = this.#statusString(snap);
    this.ui.setStatus(STATUS_KEY, status || undefined);

    this.#syncWidget(snap);
  }

  /**
   * Auto-compact the active run when context usage exceeds the threshold.
   * Only compacts once per cooldown window to avoid refresh loops.
   */
  #maybeCompact(snap: ForgerySnapshot): void {
    const now = Date.now();
    if (now - this.#lastCompactAt < COMPACT_COOLDOWN_MS) return;
    // Nothing to compact without an active run — avoid reading live host
    // context (a potentially blocking getter) during session start / idle.
    const activeId = this.store.activeRunId();
    if (!activeId) return;
    const usage = this.#read((c) => c.getContextUsage());
    const pct = usage?.percent ?? 0;
    if (pct < COMPACT_THRESHOLD_PCT) return;
    this.store.compact(activeId);
    this.#lastCompactAt = now;
  }

  /** Mid-run budget enforcement: warn at soft threshold, hard-stop at hard. */
  #checkBudgets(snap: ForgerySnapshot): void {
    for (const run of snap.runs) {
      if (run.status !== "running") continue;
      const bs = this.costManager.budgetStatus(run.id);
      if (!bs) continue;

      if (bs.overHard && !this.#budgetStopped.has(run.id)) {
        this.#budgetStopped.add(run.id);
        this.store.finish(run.id, false, "budget exceeded");
        this.store.event(run.id, {
          message: `budget exceeded ($${run.metrics?.cost?.toFixed(4) ?? "0"} / max) — run stopped`,
          level: "error",
          data: { kind: "budget-exceeded", runId: run.id },
        });
        continue;
      }

      if (bs.overSoft && !this.#budgetWarned.has(run.id)) {
        this.#budgetWarned.add(run.id);
        this.store.event(run.id, {
          message: `budget warning: ${bs.pctUsed.toFixed(0)}% of max cost used`,
          level: "warning",
          data: { kind: "budget-warning", runId: run.id, pctUsed: bs.pctUsed },
        });
      }
    }
  }

  /** Ask the TUI for a frame so live readouts keep ticking. */
  #tick(): void {
    if (!this.ui || !this.started) return;
    const snap = this.store.snapshot();
    // Only poll while something is actually running: that is the only case
    // where a readout can change without Pi rendering on its own.
    const live =
      snap.runs.some((r) => r.status === "running") ||
      snap.agents.some((a) => a.status === "running") ||
      snap.runs.some((r) =>
        r.subgoals.some((s) => s.status === "running" || s.status === "blocked"),
      );
    if (!live) return;
    this.#checkBudgets(snap);
    this.ui.setStatus(STATUS_KEY, this.#statusString(snap) || undefined);
  }

  /**
   * Open the dashboard overlay. Uses `ui.custom` — the factory receives the
   * TUI, theme, keybindings, and a `done` resolver. The dashboard is shown
   * as a full-screen overlay; Esc or Enter closes it via `done()`.
   */
  openDashboard(ctx: ExtensionContext): void {
    const ui = ctx.ui;
    if (ctx.mode !== "tui") {
      ui.notify("/forgery dashboard requires a TUI host", "warning");
      return;
    }
    void ui.custom<void>(
      (tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (v: void) => void) => {
        const dash = new ForgeryDashboard(tui, theme, keybindings, {
          snapshot: () => this.store.snapshot(),
          done: () => done(undefined),
          hostCalls: this.hostCalls,
          agentConfig: {
            maxConcurrent: this.runner.concurrency,
            piBinary: this.runner.piBinary,
          },
        });
        tui.showOverlay(dash, {
          width: "94%",
          minWidth: 48,
          maxHeight: "90%",
          anchor: "center",
          margin: 1,
        });
        return dash;
      },
      { overlay: true },
    );
  }

  /** Focus the above-editor widget so a participant can be expanded. */
  focusWidget(ctx: ExtensionContext): void {
    if (!this.ui || !this.widget) {
      this.ui?.notify("no widget to focus (idle)", "info");
      return;
    }
    const tui = this.#tui();
    if (!tui) {
      this.ui.notify("no TUI handle to focus the widget", "warning");
      return;
    }
    tui.setFocus(this.widget);
    this.widget.focused = true;
    tui.requestRender();
  }

  /** Debounce store/agent revisions into a single render. */
  private scheduleRefresh(): void {
    if (!this.started || !this.ui) return;
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, REFRESH_MS);
  }

  // ── private ────────────────────────────────────────────────────────────

  #tui(): TUI | undefined {
    return (this.ui as unknown as { tui?: TUI }).tui;
  }

  /**
   * Read a live value off the current extension context. Pi throws from
   * context getters once the context has been invalidated (newSession, fork,
   * switchSession, reload), so a failure degrades to "unknown" rather than
   * breaking the TUI render path.
   */
  #read<T>(fn: (ctx: ExtensionContext) => T): T | undefined {
    try {
      return this.ctx ? fn(this.ctx) : undefined;
    } catch {
      return undefined;
    }
  }

  #syncAgentsToStore(): void {
    for (const agent of this.runner.listForUi()) {
      const existing = this.store.agent(agent.id);
      if (!existing) this.store.addAgent(agent);
      else this.store.updateAgent(agent.id, agent);
    }
  }

  /** Note: subgoals are owned by the forgery_exec program via host calls
   *  (subgoals.create/update/finish). The controller only reads them from the
   *  store snapshot — no separate sync source exists for subgoals.
   */

  #mountWidget(ctx: ExtensionContext): void {
    if (!this.options.widget || !this.ui) return;
    const ui = this.ui;
    const interaction: ForgeryWidgetInteraction = {
      activity: (rowId, _scroll) => {
        const agent = this.runner.get(rowId);
        if (!agent) return undefined;
        const lines: string[] = [];
        lines.push(`  ${agent.name} · ${agent.status}`);
        if (agent.current) lines.push(`    ${agent.current}`);
        if (agent.text) lines.push(agent.text);
        if (agent.error) lines.push(`  ✗ ${agent.error}`);
        return lines;
      },
      release: () => {
        // Hand focus back to the editor (clear widget focus) instead of
        // re-focusing the widget, which previously left the user stuck.
        if (this.widget) this.widget.focused = false;
        const tui = this.#tui();
        tui?.requestRender();
      },
      requestRender: () => {
        this.#tui()?.requestRender();
      },
    };
    this.widget = new ForgeryWidget(
      () => ui.theme,
      () => this.store.snapshot(),
      this.options.maxRows,
      { retainMs: this.options.retainMs },
      interaction,
      this.options.animations,
    );
    // Mount: setWidget takes a factory `(tui, theme) => Component & {dispose?}`.
    // Our widget is already constructed; wrap it in a stable factory so the
    // TUI can re-mount it (e.g. on theme change) without rebuilding.
    const widgetRef = this.widget;
    ui.setWidget(
      "forgery",
      (_tui: TUI, _theme: Theme): Component & { dispose?(): void } =>
        widgetRef as unknown as Component & { dispose?(): void },
      { placement: "aboveEditor" },
    );
  }

  #mountFooter(_ctx: ExtensionContext): void {
    if (!this.options.footer || !this.ui) return;
    const footerCtx: ForgeryFooterContext = {
      gitBranch: () => this.gitBranchReader.getBranch(),
      // Context usage is read via a throttled reader to avoid blocking the
      // UI render loop on every frame. The reader caches the host's
      // getContextUsage() for throttleInterval ms.
      contextUsage: () => this.contextUsageReader.get(),
      modelId: () => this.#read((c) => c.model?.id),
      effort: () => this.#read((c) => c.thinkingLevel) ?? null,
      ciStatus: () => this.githubStats.ciStatus(),
      budgetStatus: () => {
        const activeId = this.store.activeRunId();
        if (!activeId) return null;
        return this.costManager.budgetStatus(activeId);
      },
      cwd: () => this.#read((c) => c.cwd),
    };
    this.footer = new ForgeryFooter(
      () => this.ui!.theme,
      () => this.store.snapshot(),
      footerCtx,
      this.options.animations,
      Date.now,
      this.options.lines,
      this.options.compactMax,
    );
    // Mount: setFooter takes a factory `(tui, theme, footerData) => Component`.
    const footerRef = this.footer;
    this.ui.setFooter(
      (_tui: TUI, _theme: Theme, _footerData: unknown): Component & { dispose?(): void } =>
        footerRef as unknown as Component & { dispose?(): void },
    );
  }

  #syncWidget(snap: ForgerySnapshot): void {
    if (!this.ui || !this.widget) return;
    // Mount once (SG-21): visibility is internal, we never call setWidget
    // again after the initial mount — toggling it caused flicker and lost
    // focus/selection state.
    const shouldShow = this.widget.shouldShow(snap, this.options.retainMs);
    this.widget.setVisible(shouldShow);
    this.widget.update(snap);
    if (this.widget.dirty) this.#tui()?.requestRender();
  }

  #statusString(snap: ForgerySnapshot): string {
    return formatStatusSummary(summarizeStatus(snap, this.#clock));
  }
}
