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
import type { ForgerySnapshot } from "../activity/types";
import { ForgeryDashboard } from "./dashboard";
import { ForgeryFooter, type ForgeryFooterContext } from "./footer";
import { ForgeryWidget, type ForgeryWidgetInteraction } from "./widget";
import { formatCost, formatDuration, formatTokens, statusGlyph } from "./format";
import { GitBranchReader } from "../git";

const REFRESH_MS = 100;
const STATUS_KEY = "forgery";

export interface ForgeryUiOptions {
  /** Max widget rows. Defaults to 8. */
  maxRows?: number;
  /** Retain the widget after the last run finishes. Defaults to 30 s. */
  retainMs?: number;
  /** Enable the above-editor widget. Defaults to true. */
  widget?: boolean;
  /** Enable the custom footer. Defaults to true. */
  footer?: boolean;
}

export class ForgeryUiController {
  private store: ForgeryActivityStore;
  private runner: AgentRunner;
  private options: Required<ForgeryUiOptions>;

  private ui?: ExtensionUIContext;
  private footer?: ForgeryFooter;
  private widget?: ForgeryWidget;
  private refreshTimer?: NodeJS.Timeout;
  private unsubscribeStore?: () => void;
  private unsubscribeAgents?: () => void;
  private started = false;
  private hostCalls: string[];
  private gitBranchReader: GitBranchReader;

  constructor(
    store: ForgeryActivityStore,
    runner: AgentRunner,
    hostCalls: string[],
    options: ForgeryUiOptions = {},
  ) {
    this.store = store;
    this.runner = runner;
    this.hostCalls = hostCalls;
    this.gitBranchReader = new GitBranchReader();
    this.options = {
      maxRows: options.maxRows ?? 8,
      retainMs: options.retainMs ?? 30_000,
      widget: options.widget ?? true,
      footer: options.footer ?? true,
    };
  }

  /** Start the UI: subscribe + mount widget/footer. Idempotent. */
  start(ctx: ExtensionContext): void {
    if (this.started) return;
    this.started = true;
    this.ui = ctx.ui;

    this.unsubscribeStore = this.store.subscribe(() => this.scheduleRefresh());
    this.unsubscribeAgents = this.runner.subscribe(() => this.scheduleRefresh());

    this.#mountWidget(ctx);
    this.#mountFooter(ctx);
    this.refresh();
  }

  /** Stop the UI: unsubscribe + unmount. Idempotent. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.unsubscribeStore?.();
    this.unsubscribeAgents?.();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.ui?.setWidget("forgery", undefined, { placement: "aboveEditor" });
    if (this.options.footer) this.ui?.setFooter(undefined);
    this.ui?.setStatus(STATUS_KEY, undefined);
    this.ui = undefined;
    this.footer = undefined;
    this.widget = undefined;
  }

  /** Force a refresh now. */
  refresh(): void {
    if (!this.ui || !this.started) return;
    this.#syncAgentsToStore();
    const snap = this.store.snapshot();

    // Mirror a compact string into the built-in footer slot.
    const status = this.#statusString(snap);
    this.ui.setStatus(STATUS_KEY, status || undefined);

    if (this.footer) this.footer.invalidate();
    this.#syncWidget(snap);
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

  #syncAgentsToStore(): void {
    for (const agent of this.runner.listForUi()) {
      const existing = this.store.agent(agent.id);
      if (!existing) this.store.addAgent(agent);
      else this.store.updateAgent(agent.id, agent);
    }
  }

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
        if (agent.text) lines.push(`    ${agent.text.slice(0, 120)}`);
        if (agent.error) lines.push(`    ✗ ${agent.error}`);
        return lines;
      },
      release: () => {
        const tui = this.#tui();
        tui?.requestRender();
        void this.focusWidget(ctx);
      },
      requestRender: () => {
        this.#tui()?.requestRender();
      },
    };
    this.widget = new ForgeryWidget(
      ui.theme,
      () => this.store.snapshot(),
      this.options.maxRows,
      { retainMs: this.options.retainMs },
      interaction,
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

  #mountFooter(ctx: ExtensionContext): void {
    if (!this.options.footer || !this.ui) return;
    const ctxUsage = ctx.getContextUsage() as Record<string, unknown> | undefined;
    const ctxModel = ctx.model as { id?: string; effort?: string | number } | undefined;
    const footerCtx: ForgeryFooterContext = {
      gitBranch: () => this.gitBranchReader.getBranch(),
      contextPercent: () => (ctxUsage?.percent as number | undefined) ?? null,
      contextTokens: () => (ctxUsage?.tokens as number | undefined) ?? null,
      contextTokensMax: () =>
        ((ctxUsage?.maxTokens as number | undefined) ??
          (ctxUsage?.max as number | undefined)) ??
        null,
      modelId: () => ctxModel?.id,
      effort: () =>
        (ctxUsage?.effort as string | undefined) ??
        (typeof ctxModel?.effort === "string" ? ctxModel.effort : undefined) ??
        null,
      cwd: () => ctx.cwd ?? undefined,
      compactCount: () => (ctxUsage?.compactCount as number | undefined) ?? null,
      compactMax: () => (ctxUsage?.compactMax as number | undefined) ?? null,
      issuesOpen: () => (ctxUsage?.issuesOpen as number | undefined) ?? null,
      issuesClosed: () => (ctxUsage?.issuesClosed as number | undefined) ?? null,
      prsOpen: () => (ctxUsage?.prsOpen as number | undefined) ?? null,
      prsClosed: () => (ctxUsage?.prsClosed as number | undefined) ?? null,
      ciStatus: () => (ctxUsage?.ciStatus as string | undefined) ?? null,
    };
    this.footer = new ForgeryFooter(this.ui.theme, () => this.store.snapshot(), footerCtx);
    // Mount: setFooter takes a factory `(tui, theme, footerData) => Component`.
    const footerRef = this.footer;
    this.ui.setFooter(
      (_tui: TUI, _theme: Theme, _footerData: unknown): Component & { dispose?(): void } =>
        footerRef as unknown as Component & { dispose?(): void },
    );
  }

  #syncWidget(snap: ForgerySnapshot): void {
    if (!this.ui) return;
    const shouldShow = this.widget?.shouldShow(snap, this.options.retainMs);
    if (shouldShow && this.widget) {
      const widgetRef = this.widget;
      this.ui.setWidget(
        "forgery",
        (_tui: TUI, _theme: Theme): Component & { dispose?(): void } =>
          widgetRef as unknown as Component & { dispose?(): void },
        { placement: "aboveEditor" },
      );
    } else {
      this.ui.setWidget("forgery", undefined, { placement: "aboveEditor" });
    }
  }

  #statusString(snap: ForgerySnapshot): string {
    const active = snap.runs.find((r) => r.status === "running");
    if (!active) {
      const recent = snap.runs[0];
      if (recent) return `${statusGlyph(recent.status)} ${recent.name} ${recent.status}`;
      return "";
    }
    const totals = snap.activeTotals;
    return [
      `◐ ${active.name}`,
      totals ? `${totals.calls} calls` : undefined,
      totals?.tokens ? formatTokens(totals.tokens) : undefined,
      totals?.cost ? formatCost(totals.cost) : undefined,
      formatDuration(snap.now - active.startedAt),
    ]
      .filter(Boolean)
      .join(" · ");
  }
}
