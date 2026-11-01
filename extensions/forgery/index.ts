/**
 * pi-forgery — extension factory.
 *
 * The default export Pi's loader invokes. Registers:
 *   - `forgery_exec` — the programmable tool
 *   - `/forgery` — the dashboard / status / agents / log / stop command
 *   - two shortcuts: ctrl+alt+f (dashboard), ctrl+alt+e (focus widget)
 *   - lifecycle hooks: session_start (bootstrap UI), session_shutdown (teardown)
 */

import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  detectCapabilities,
  getCapabilities,
  resetCapabilitiesCache,
  setCapabilityOverrides,
  setCapabilities,
  type ImageProtocol,
  type TerminalCapabilities,
} from "@earendil-works/pi-tui";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve as pathResolve, dirname as pathDirname } from "node:path";
import { ForgeryActivityStore } from "./src/activity/store";
import { AgentRunner } from "./src/agents/runner";
import { createForgeryExecTool, makeRegistry } from "./src/exec/tool";
import { showImage, showVideo } from "./src/exec/display";
import { ForgeryUiController } from "./src/ui/controller";
import { createEngine } from "./src/workflow/engine";

/** Module-level singletons — re-used across sessions in one process. */
let store: ForgeryActivityStore;
let runner: AgentRunner;
let ui: ForgeryUiController;
let hostCallNames: string[];

function ensureSingletons() {
  if (store) return;
  store = new ForgeryActivityStore();
  runner = new AgentRunner({ piBinary: "pi", maxConcurrent: 4 });
  // Seed the host-call registry once so the UI settings view can list them.
  const registry = makeRegistry(runner, store, undefined as unknown as ExtensionContext);
  hostCallNames = registry.list().sort();
  ui = new ForgeryUiController(store, runner, hostCallNames, {
    widget: true,
    footer: true,
    maxRows: 8,
    retainMs: 30_000,
  });
}

const FORGERY_DASHBOARD_SHORTCUT = "ctrl+alt+f";
const FORGERY_WIDGET_SHORTCUT = "ctrl+alt+e";

export default function forgery(pi: ExtensionAPI): void {
  ensureSingletons();

  // ── tool ───────────────────────────────────────────────────────────────
  const tool = createForgeryExecTool(store, runner);
  pi.registerTool(tool);

  // ── command ────────────────────────────────────────────────────────────
  pi.registerCommand("forgery", {
    description: "pi-forgery: dashboard, status, agents, log, stop",
    getArgumentCompletions: (prefix: string): { value: string; label: string; description?: string }[] | null => {
      const subs = ["dashboard", "status", "agents", "log", "stop", "settings", "image-protocol", "export", "import"];
      const list: { value: string; label: string; description?: string }[] = subs
        .filter((s) => s.startsWith(prefix.toLowerCase()))
        .map((s) => ({ value: s, label: s, description: subDescriptions[s] }));
      // Also offer running agent ids for `log` / `stop`.
      if (prefix.length > 0 && !subs.some((s) => s.startsWith(prefix.toLowerCase()))) {
        for (const agent of runner.listForUi()) {
          if (agent.id.startsWith(prefix.toLowerCase())) {
            list.push({ value: agent.id, label: agent.id, description: `agent · ${agent.name}` });
          }
        }
      }
      return list.length > 0 ? list : null;
    },
    handler: async (args: string, ctx: ExtensionContext) => {
      const [sub, ...rest] = args.trim().split(/\s+/);
      switch (sub) {
        case undefined:
        case "":
        case "dashboard":
        case "ui":
          ui.openDashboard(ctx);
          break;
        case "status":
          await status(ctx);
          break;
        case "agents": {
          const agents = runner.listForUi();
          if (agents.length === 0) {
            ctx.ui.notify("forgery: no agents recorded yet", "info");
          } else {
            ctx.ui.notify(
              `forgery agents (${agents.length}):\n${agents
                .map((a) => `  ${a.status} ${a.name} · ${a.task.slice(0, 40)}`)
                .join("\n")}`,
              "info",
            );
          }
          break;
        }
        case "log": {
          const agentId = rest[0];
          if (!agentId) {
            ctx.ui.notify("usage: /forgery log <agent-id>", "info");
            break;
          }
          const agent = runner.get(agentId);
          if (!agent) {
            ctx.ui.notify(`forgery: agent ${agentId} not found`, "warning");
            break;
          }
          const lines = [
            `${agent.name} · ${agent.status}`,
            agent.current ? `current: ${agent.current}` : "",
            agent.text ? `text: ${agent.text.slice(0, 400)}` : "",
            agent.error ? `error: ${agent.error}` : "",
            agent.usage?.cost ? `cost: $${agent.usage.cost}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          ctx.ui.notify(lines || "forgery: no log yet", "info");
          break;
        }
        case "stop": {
          const agentId = rest[0];
          if (!agentId) {
            ctx.ui.notify("usage: /forgery stop <agent-id>", "info");
            break;
          }
          const res = runner.stop(agentId);
          if (res) ctx.ui.notify(`forgery: stopped agent ${agentId}`, "info");
          else ctx.ui.notify(`forgery: agent ${agentId} not found`, "warning");
          break;
        }
        case "settings":
          ctx.ui.notify(
            "forgery settings (read-only)\n" +
              `  host calls: ${hostCallNames.length}\n` +
              `  pi binary:  ${runner.piBinary}\n` +
              `  concurrency: ${runner.concurrency}`,
            "info",
          );
          break;
        case "image-protocol": {
          const requested = rest[0]?.toLowerCase();
          const current = getCapabilities();
          if (!requested) {
            const source =
              process.env.PI_IMAGE_PROTOCOL ? "env PI_IMAGE_PROTOCOL" : "auto-detect";
            ctx.ui.notify(
              `forgery image protocol: ${current.images ?? "none"} (${source})`,
              "info",
            );
            break;
          }
          if (requested === "auto" || requested === "default") {
            // Clear any manual override and re-detect from environment.
            setCapabilities(detectCapabilities());
            ctx.ui.notify("forgery: image protocol reset to auto-detect", "info");
          } else if (requested === "kitty" || requested === "iterm2" || requested === "none") {
            setCapabilityOverrides({ images: requested === "none" ? null : requested });
            ctx.ui.notify(`forgery: image protocol set to ${requested}`, "info");
          } else {
            ctx.ui.notify(
              `forgery: unknown image protocol "${requested}" — try: kitty, iterm2, none, auto`,
              "warning",
            );
            break;
          }
          // Reset the cache so the next showImage/showVideo call re-reads capabilities.
          resetCapabilitiesCache();
          break;
        }
        case "image": {
          const imagePath = rest[0];
          if (!imagePath) {
            ctx.ui.notify("usage: /forgery image <path>", "info");
            break;
          }
          try {
            const result = await showImage(ctx.ui, ctx.cwd, imagePath);
            if (result.displayed) {
              ctx.ui.notify(
                `forgery: image displayed (${result.protocol}) · ${result.path}`,
                "info",
              );
            } else {
              ctx.ui.notify(
                `forgery: terminal cannot show inline images — ${result.path}`,
                "info",
              );
            }
          } catch (e) {
            ctx.ui.notify(
              `forgery: ${e instanceof Error ? e.message : String(e)}`,
              "error",
            );
          }
          break;
        }
        case "video": {
          const videoPath = rest[0];
          if (!videoPath) {
            ctx.ui.notify("usage: /forgery video <path>", "info");
            break;
          }
          try {
            const result = await showVideo(ctx.ui, ctx.cwd, videoPath);
            if (result.displayed) {
              ctx.ui.notify(
                `forgery: video displayed (${result.protocol}) · ${result.path} · ${result.framesShown} frames`,
                "info",
              );
            } else {
              ctx.ui.notify(
                `forgery: terminal cannot show inline video — ${videoPath}`,
                "info",
              );
            }
          } catch (e) {
            ctx.ui.notify(
              `forgery: ${e instanceof Error ? e.message : String(e)}`,
              "error",
            );
          }
          break;
        }
        case "export": {
          const filePath = rest[0];
          const runId = store.activeRunId();
          if (!runId) {
            ctx.ui.notify("forgery: no active run to export", "warning");
            break;
          }
          try {
            const snap = store.exportSnapshot();
            const target = filePath
              ? pathResolve(ctx.cwd, filePath)
              : pathResolve(ctx.cwd, ".pi", "forgery", `activity-${runId.slice(0, 8)}.json`);
            mkdirSync(pathDirname(target), { recursive: true });
            writeFileSync(target, snap, "utf8");
            ctx.ui.notify(
              `forgery: exported ${snap.length} bytes → ${target}`,
              "info",
            );
          } catch (e) {
            ctx.ui.notify(
              `forgery: export failed: ${e instanceof Error ? e.message : String(e)}`,
              "error",
            );
          }
          break;
        }
        case "import": {
          const filePath = rest[0];
          if (!filePath) {
            ctx.ui.notify("usage: /forgery import <path>", "info");
            break;
          }
          try {
            const target = pathResolve(ctx.cwd, filePath);
            const json = readFileSync(target, "utf8");
            store.importSnapshot(json);
            const snap = store.snapshot();
            ctx.ui.notify(
              `forgery: imported ${snap.runs.length} run(s), ${snap.agents.length} agent(s)`,
              "info",
            );
          } catch (e) {
            ctx.ui.notify(
              `forgery: import failed: ${e instanceof Error ? e.message : String(e)}`,
              "error",
            );
          }
          break;
        }
        case "workflow": {
          const [action, ...workflowArgs] = rest;
          const engine = createEngine(store, runner, ctx.cwd);
          switch (action) {
            case "run": {
              const [pipeline, target] = workflowArgs;
              if (!pipeline || !target) {
                ctx.ui.notify(
                  "usage: /forgery workflow run <pipeline> <target>",
                  "warning",
                );
                break;
              }
              const result = await engine.run(pipeline, target);
              if ("error" in result) {
                ctx.ui.notify(`forgery workflow failed: ${result.error}`, "error");
              } else {
                const total = result.phases.reduce((s, p) => s + p.findings.length, 0);
                ctx.ui.notify(
                  `forgery workflow ${result.status}: ${total} finding(s) across ${result.phases.length} phase(s)\n` +
                    `  consolidated: ${result.consolidatedArtifact ?? "-"}`,
                  "info",
                );
              }
              break;
            }
            case "status": {
              const [runId] = workflowArgs;
              const state = runId ? engine.get(runId) : undefined;
              if (!state) {
                ctx.ui.notify(
                  runId
                    ? `forgery: workflow run ${runId} not found`
                    : "usage: /forgery workflow status <run-id>",
                  "warning",
                );
                break;
              }
              ctx.ui.notify(
                `forgery workflow ${state.id.slice(0, 8)} · ${state.pipelineId} · ${state.status}\n` +
                  `  target: ${state.target}\n` +
                  `  phase: ${state.phaseIndex} / ${engine.pipeline(state.pipelineId)?.phases.length ?? "?"}\n` +
                  `  reports: ${state.reports.length}`,
                "info",
              );
              break;
            }
            case "list": {
              const states = engine.states();
              if (states.length === 0) {
                ctx.ui.notify("forgery: no workflow runs yet", "info");
                break;
              }
              ctx.ui.notify(
                "forgery workflow runs:\n" +
                  states
                    .slice(0, 8)
                    .map(
                      (s) =>
                        `  ${s.id.slice(0, 8)} · ${s.pipelineId} · ${s.status} · ${s.target}`,
                    )
                    .join("\n"),
                "info",
              );
              break;
            }
            case "stop": {
              const [runId] = workflowArgs;
              if (!runId) {
                ctx.ui.notify("usage: /forgery workflow stop <run-id>", "warning");
                break;
              }
              const stopped = engine.stop(runId);
              ctx.ui.notify(
                stopped
                  ? `forgery: stopped workflow ${runId.slice(0, 8)}`
                  : `forgery: workflow ${runId.slice(0, 8)} not running`,
                "info",
              );
              break;
            }
            case "resume": {
              const [runId, target] = workflowArgs;
              if (!runId) {
                ctx.ui.notify("usage: /forgery workflow resume <run-id> [target]", "warning");
                break;
              }
              const result = await engine.resume(runId, target);
              if ("error" in result) {
                ctx.ui.notify(`forgery: ${result.error}`, "warning");
              } else {
                ctx.ui.notify(
                  `forgery: resumed workflow ${result.runId} → ${result.status}`,
                  "info",
                );
              }
              break;
            }
            default:
              ctx.ui.notify(
                `forgery: unknown workflow action "${action}" — try: run, status, list, stop, resume`,
                "info",
              );
          }
          break;
        }
        default:
          ctx.ui.notify(`forgery: unknown subcommand "${sub}" — try: dashboard, status, agents, log, stop, workflow`, "info");
      }
    },
  });

  // ── shortcuts ──────────────────────────────────────────────────────────
  if (pi.registerShortcut) {
    pi.registerShortcut(FORGERY_DASHBOARD_SHORTCUT, {
      description: "Open the forgery dashboard",
      handler: (ctx: ExtensionContext) => ui.openDashboard(ctx),
    });
    pi.registerShortcut(FORGERY_WIDGET_SHORTCUT, {
      description: "Focus the forgery activity widget",
      handler: (ctx: ExtensionContext) => ui.focusWidget(ctx),
    });
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    // Reset the activity store on a fresh session; reseed host-call list.
    store.reset();
    ui.start(ctx);
  });

  pi.on("session_shutdown", async (_event: unknown, _ctx: ExtensionContext) => {
    ui.stop();
    // Don't reset the store here — a follow-up session may resume.
  });
}

// ── command sub-actions ──────────────────────────────────────────────────

const subDescriptions: Record<string, string> = {
  dashboard: "open the full-screen dashboard",
  status: "print a compact config + activity summary",
  agents: "list recorded one-shot agents",
  log: "show one agent's transcript (log <agent-id>)",
  stop: "stop one agent (stop <agent-id>)",
  settings: "show the read-only host-call + agent runner config",
  workflow: "EGM-style Goldfish review (run|status|list|stop|resume)",
  export: "export the activity snapshot to a JSON file (export [path])",
  import: "import an activity snapshot from a JSON file (import <path>)",
};

async function status(ctx: ExtensionContext): Promise<void> {
  const snap = store.snapshot();
  const active = snap.runs.find((r) => r.status === "running");
  const lines = [
    "forgery status",
    `  host calls   ${hostCallNames.length}`,
    `  pi binary    ${runner.piBinary}`,
    `  concurrency  ${runner.concurrency}`,
    `  runs         ${snap.runs.length} (active: ${active ? active.name : "none"})`,
    `  agents       ${snap.agents.length}`,
    active ? `  active       ${active.name} · ${active.calls.length} calls · ${formatDuration(snap.now - active.startedAt)}` : undefined,
  ].filter(Boolean);
  ctx.ui.notify(lines.join("\n"), "info");
}

// ── helpers ──────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 > 0 ? `${m}m${s % 60}s` : `${m}m`;
}
