/**
 * pi-forgery — forgery_exec tool definition.
 *
 * The one programmable tool the LLM can call. It composes Pi core tools
 * and one-shot agents inside a TypeScript program. Independent calls run
 * in parallel; each call is recorded in the activity store.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve as pathResolve } from "node:path";
import { Type } from "typebox";
import {
  defineTool,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import { ForgeryActivityStore } from "../activity/store";
import { AgentRunner } from "../agents/runner";
import {
  HostCallRegistry,
  runForgery,
  type HostExecCtx,
} from "./runtime";
import {
  AgentsList,
  AgentsRun,
  AgentsStop,
  PiBash,
  PiEdit,
  PiExec,
  PiFind,
  PiGrep,
  PiLs,
  PiRead,
  PiShowImage,
  PiShowImages,
  PiShowVideo,
  PiWrite,
  WorkflowRun,
  WorkflowStatus,
  WorkflowStop,
  WorkflowResolve,
} from "./schemas";
import { loadConfig, type ForgeryConfig } from "../config";
import { createEngine } from "../workflow/engine";
import { createResolver } from "../workflow/resolver";
import { showImage, showImages, showVideo, type ShowImageResult } from "./display";
import { box, formatCallSummary, formatDuration } from "../ui/format";

const execFileAsync = promisify(execFile);

export interface ForgeryExecDetails {
  runId: string;
  calls: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Build a fresh host-call registry with all the host calls wired up to the
 * given runner/activity. This is re-used per tool invocation so we can
 * scope `liveCtx` to the current `ExtensionContext`.
 */
export function makeRegistry(
  runner: AgentRunner,
  activity: ForgeryActivityStore,
  liveCtx: ExtensionContext | undefined,
): HostCallRegistry {
  const registry = new HostCallRegistry();

  // Load config for guardrail policies
  const config = liveCtx ? loadConfig(liveCtx.cwd) : undefined;

  // Workflow engine (EGM-style Goldfish review), bound to this store/runner/cwd.
  const engine = createEngine(
    activity,
    runner,
    liveCtx?.cwd ?? process.cwd(),
  );

  // Shared exec helper (node:child_process — `ctx.exec` is not part of the
  // public ExtensionContext API).
  const execViaHost = async (command: string, args: string[], signal: AbortSignal, cwd: string) => {
    const preview = `${command} ${args.join(" ")}`.slice(0, 80);
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd,
        signal,
        maxBuffer: 50 * 1024 * 1024,
        encoding: "utf-8",
      });
      return { value: { stdout, stderr, code: 0 }, preview };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message, preview };
    }
  };

  // Helper to check if a bash command is destructive
  const isDestructiveBashCommand = (command: string): boolean => {
    const destructivePatterns = [
      /\brm\s/,           // rm command
      /\bsudo\s/,         // sudo command
      /\bforce\s*[-_]?push/, // force push
      /\bdd\s/,           // dd command
      /\bmkfs\s/,         // mkfs command
      /\bfdisk\s/,        // fdisk command
      /\bparted\s/,       // parted command
      /\b>:?\s*\/dev\//,  // writing to device files
      /\b>\s*\/etc\//,    // writing to /etc
      /\b>\s*\/usr\//,    // writing to /usr
      /\b>\s*\/bin\//,    // writing to /bin
      /\b>\s*\/sbin\//,   // writing to /sbin
      /\bchmod\s+-R\s/,   // recursive chmod
      /\bchown\s+-R\s/,   // recursive chown
    ];
    return destructivePatterns.some(pattern => pattern.test(command));
  };

  registry.register({
    ref: "pi.bash",
    schema: PiBash,
    kind: "tool",
    execute: async (args, _hctx, signal) => {
      if (!liveCtx) return { error: "no host context" };
      const command = String(args.command ?? "");
      
      // Check if this is a destructive bash command
      if (isDestructiveBashCommand(command)) {
        const bashPolicy = config?.guardrails?.bashPolicy ?? "off";
        
        // Handle guardrail policies
        if (bashPolicy === "block") {
          return { error: `bash command blocked by guardrails policy: ${command}` };
        }
        
        if (bashPolicy === "confirm") {
          const confirm = Boolean(args.confirm);
          if (!confirm) {
            return { error: `bash command requires confirmation due to guardrails policy. Set confirm: true to proceed: ${command}` };
          }
        }
        // If policy is "off" or confirm is true, proceed
      }
      
      return execViaHost("sh", ["-c", command], signal, liveCtx.cwd);
    },
  });

  registry.register({
    ref: "pi.exec",
    schema: PiExec,
    kind: "tool",
    execute: async (args, _hctx, signal) => {
      if (!liveCtx) return { error: "no host context" };
      const command = String(args.command ?? "");
      const argsArr = Array.isArray(args.args) ? (args.args as unknown[]).map(String) : [];
      return execViaHost(command, argsArr, signal, liveCtx.cwd);
    },
  });

  registry.register({
    ref: "pi.showImage",
    schema: PiShowImage,
    kind: "tool",
    execute: async (args, _hctx, _signal) => {
      if (!liveCtx) return { error: "no host context" };
      try {
        const result = await showImage(liveCtx.ui, liveCtx.cwd, String(args.path), {
          maxWidthCells: args.maxWidthCells ? Number(args.maxWidthCells) : undefined,
          maxHeightCells: args.maxHeightCells ? Number(args.maxHeightCells) : undefined,
        });
        if (!result.displayed && liveCtx.ui) {
          liveCtx.ui.notify(
            `forgery: inline images not supported in this terminal — ${result.path}`,
            "info",
          );
        }
        return { value: result, preview: `image ${result.protocol ?? "text"} ${result.path}` };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  registry.register({
    ref: "pi.showImages",
    schema: PiShowImages,
    kind: "tool",
    execute: async (args, _hctx, _signal) => {
      if (!liveCtx) return { error: "no host context" };
      const paths = Array.isArray(args.paths) ? (args.paths as string[]) : [];
      const results = await showImages(liveCtx.ui, liveCtx.cwd, paths, {
        maxWidthCells: args.maxWidthCells ? Number(args.maxWidthCells) : undefined,
        maxHeightCells: args.maxHeightCells ? Number(args.maxHeightCells) : undefined,
      });
      const allDisplayed = results.every((r) => r.displayed);
      if (!allDisplayed && liveCtx.ui) {
        liveCtx.ui.notify(
          "forgery: some images not supported in this terminal — shown as text paths",
          "info",
        );
      }
      return {
        value: { results, count: results.length },
        preview: `images: ${results.length} displayed`,
      };
    },
  });

  registry.register({
    ref: "pi.showVideo",
    schema: PiShowVideo,
    kind: "tool",
    execute: async (args, _hctx, _signal) => {
      if (!liveCtx) return { error: "no host context" };
      try {
        const result = await showVideo(liveCtx.ui, liveCtx.cwd, String(args.path), {
          maxWidthCells: args.maxWidthCells ? Number(args.maxWidthCells) : undefined,
          maxHeightCells: args.maxHeightCells ? Number(args.maxHeightCells) : undefined,
        });
        if (!result.displayed && liveCtx.ui) {
          liveCtx.ui.notify(
            `forgery: inline video not supported in this terminal — ${result.path}`,
            "info",
          );
        }
        return {
          value: result,
          preview: `video ${result.protocol ?? "text"} ${result.path} (${result.framesShown} frames)`,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  registry.register({
    ref: "pi.read",
    schema: PiRead,
    kind: "tool",
    execute: async (args) => {
      if (!liveCtx) return { error: "no host context" };
      const path = String(args.path ?? "");
      try {
        const text = fsRead(resolvePath(liveCtx.cwd, path));
        return { value: text, preview: path };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  registry.register({
    ref: "pi.write",
    schema: PiWrite,
    kind: "tool",
    execute: async (args) => {
      if (!liveCtx) return { error: "no host context" };
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      
      // Check write guardrail policy
      const writePolicy = config?.guardrails?.writePolicy ?? "off";
      
      // Handle guardrail policies
      if (writePolicy === "block") {
        return { error: `write operation blocked by guardrails policy: ${path}` };
      }
      
      if (writePolicy === "confirm") {
        const confirm = Boolean(args.confirm);
        if (!confirm) {
          return { error: `write operation requires confirmation due to guardrails policy. Set confirm: true to proceed: ${path}` };
        }
      }
      // If policy is "off" or confirm is true, proceed
      
      try {
        const full = resolvePath(liveCtx.cwd, path);
        fsWrite(full, content);
        return { value: { ok: true, path: full }, preview: path };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  registry.register({
    ref: "pi.edit",
    schema: PiEdit,
    kind: "tool",
    execute: async (args) => {
      if (!liveCtx) return { error: "no host context" };
      const path = String(args.path ?? "");
      const oldStr = String(args.old_string ?? "");
      const newStr = String(args.new_string ?? "");
      const replaceAll = Boolean(args.replace_all);
      
      // Check write guardrail policy (edit is also a write operation)
      const writePolicy = config?.guardrails?.writePolicy ?? "off";
      
      // Handle guardrail policies
      if (writePolicy === "block") {
        return { error: `edit operation blocked by guardrails policy: ${path}` };
      }
      
      if (writePolicy === "confirm") {
        const confirm = Boolean(args.confirm);
        if (!confirm) {
          return { error: `edit operation requires confirmation due to guardrails policy. Set confirm: true to proceed: ${path}` };
        }
      }
      // If policy is "off" or confirm is true, proceed
      
      try {
        const full = resolvePath(liveCtx.cwd, path);
        const text = fsRead(full);
        if (!text.includes(oldStr)) return { error: `old_string not found in ${path}` };
        const updated = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, newStr);
        fsWrite(full, updated);
        return { value: { ok: true, path: full }, preview: path };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  registry.register({
    ref: "pi.ls",
    schema: PiLs,
    kind: "tool",
    execute: async (args) => {
      if (!liveCtx) return { error: "no host context" };
      const path = String(args.path ?? ".");
      try {
        const full = resolvePath(liveCtx.cwd, path);
        const entries = fsLs(full);
        return { value: entries.join("\n"), preview: path };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  registry.register({
    ref: "pi.find",
    schema: PiFind,
    kind: "tool",
    execute: async (args) => {
      if (!liveCtx) return { error: "no host context" };
      const pattern = String(args.pattern ?? "");
      const base = args.path ? resolvePath(liveCtx.cwd, String(args.path)) : liveCtx.cwd;
      const results = findFiles(base, pattern);
      return { value: results.join("\n"), preview: pattern };
    },
  });

  registry.register({
    ref: "pi.grep",
    schema: PiGrep,
    kind: "tool",
    execute: async (args, _hctx, signal) => {
      if (!liveCtx) return { error: "no host context" };
      const pattern = String(args.pattern ?? "");
      const base = args.path ? resolvePath(liveCtx.cwd, String(args.path)) : liveCtx.cwd;
      const res = await execViaHost("grep", ["-rn", "--", pattern, base], signal, liveCtx.cwd);
      return res;
    },
  });

  registry.register({
    ref: "agents.run",
    schema: AgentsRun,
    kind: "agent",
    execute: async (args, hctx, _signal) => {
      const task = String(args.task ?? "");
      if (!task) return { error: "agents.run: task is required" };

      // Budget enforcement: check if running this agent would exceed cost/token limits
      try {
        const config = loadConfig(hctx.cwd);
        const run = activity.get(hctx.runId);
        
        // Get current accumulated usage for this run
        const currentUsage = run?.metrics ?? { toolCalls: 0, tokens: 0, cost: 0 };
        
        // Check token limit
        if (config.budget?.maxTokensPerRun !== undefined) {
          // We don't know exact token usage in advance, so we'll check after execution
          // but we can prevent execution if we're already over the limit
          if (currentUsage.tokens >= config.budget.maxTokensPerRun) {
            return { error: `agents.run: token budget exceeded (${currentUsage.tokens} >= ${config.budget.maxTokensPerRun})` };
          }
        }
        
        // Check cost limit
        if (config.budget?.maxCostPerRun !== undefined) {
          // We don't know exact cost in advance, so we'll check after execution
          // but we can prevent execution if we're already over the limit
          if (currentUsage.cost >= config.budget.maxCostPerRun) {
            return { error: `agents.run: cost budget exceeded (${currentUsage.cost} >= ${config.budget.maxCostPerRun})` };
          }
        }
      } catch (configError) {
        // If we can't load config, log but continue execution
        console.warn(`forgery: could not load config for budget enforcement: ${configError}`);
      }

      const result = await runner.run({
        task,
        cwd: hctx.cwd,
        name: "agent",
        timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
        model: args.model ? String(args.model) : undefined,
        systemPrompt: args.systemPrompt ? String(args.systemPrompt) : undefined,
      });
      const agent = runner.get(result.id);
      if (agent) activity.addAgent(agent);
      const ok = result.status === "completed";
      
      // Update activity with metrics from the agent run
      if (result.usage) {
        const run = activity.get(hctx.runId);
        if (run) {
          // Initialize metrics if not present
          if (!run.metrics) {
            run.metrics = { toolCalls: 0, tokens: 0, cost: 0 };
          }
          // Accumulate usage from this agent run
          // At this point, run.metrics is definitely defined
          run.metrics.toolCalls += 1; // count agent run as one tool call? 
          run.metrics.tokens += result.usage.output ?? 0; // Assuming output tokens
          // Note: We don't have cost in the usage from runner.run, so we'll need to estimate
          // For now, we'll leave cost as 0 or implement a rough estimation based on tokens
        }
      }
      
      return {
        value: { id: result.id, status: result.status, text: result.text, usage: result.usage },
        preview: `${result.status} (${(result.text ?? "").slice(0, 40)})`,
        error: ok ? undefined : result.error ?? result.status,
      };
    },
  });

  registry.register({
    ref: "agents.list",
    schema: AgentsList,
    kind: "agent",
    execute: async () => ({ value: runner.listForUi() }),
  });

  registry.register({
    ref: "agents.stop",
    schema: AgentsStop,
    kind: "agent",
    execute: async (args) => ({ value: runner.stop(String(args.id ?? "")) }),
  });

  // ── Workflow (EGM Goldfish review) host calls ─────────────────────────

  registry.register({
    ref: "workflow.run",
    schema: WorkflowRun,
    kind: "agent",
    execute: async (args) => {
      const pipeline = String(args.pipeline ?? "");
      const target = String(args.target ?? "");
      if (!pipeline || !target) {
        return { error: "workflow.run: pipeline and target are required" };
      }
      const result = await engine.run(
        pipeline,
        target,
        Array.isArray(args.context) ? (args.context as string[]) : [],
        String(args.mode ?? "REVIEW"),
      );
      if ("error" in result) {
        return { error: result.error, value: result };
      }
      return {
        value: {
          runId: result.runId,
          status: result.status,
          phases: result.phases.map((p) => ({
            phaseId: p.phaseId,
            phaseName: p.phaseName,
            findings: p.findings.length,
            totals: p.totals,
          })),
          consolidatedArtifact: result.consolidatedArtifact,
        },
        preview: `workflow ${result.status}: ${result.phases.reduce((s, p) => s + p.findings.length, 0)} findings`,
        error: result.status === "failed" ? result.error : undefined,
      };
    },
  });

  registry.register({
    ref: "workflow.status",
    schema: WorkflowStatus,
    kind: "agent",
    execute: async (args) => {
      const runId = args.runId ? String(args.runId) : undefined;
      if (runId) {
        const state = engine.get(runId);
        if (!state) return { error: `workflow.run: unknown run ${runId}` };
        return { value: state };
      }
      return { value: engine.states() };
    },
  });

  registry.register({
    ref: "workflow.stop",
    schema: WorkflowStop,
    kind: "agent",
    execute: async (args) => {
      const runId = String(args.runId ?? "");
      if (!runId) return { error: "workflow.stop: runId is required" };
      const stopped = engine.stop(runId);
      return { value: { runId, stopped } };
    },
  });

  registry.register({
    ref: "workflow.resolve",
    schema: WorkflowResolve,
    kind: "agent",
    execute: async (args) => {
      const runId = String(args.runId ?? "");
      if (!runId) return { error: "workflow.resolve: runId is required" };
      const findings = Array.isArray(args.findings) ? (args.findings as any[]) : [];
      const resolver = createResolver(activity, runner, liveCtx?.cwd ?? process.cwd(), engine);
      const result = await resolver.resolveFindings({ runId, findings });
      if (result.error) return { error: result.error };
      return {
        value: {
          runId: result.runId,
          applied: result.applied,
          contested: result.contested,
          reAudited: result.reAudited,
          reAuditCapReached: result.reAuditCapReached,
          reportPath: result.reportPath,
        },
        preview: `resolve ${result.applied} fix(es), ${result.contested} contest(s), re-audited: ${result.reAudited}`,
        error: undefined,
      };
    },
  });

  return registry;
}

// ── tiny node fs helpers ────────────────────────────────────────────────

function resolvePath(cwd: string, p: string): string {
  return isAbsolute(p) ? p : pathResolve(cwd, p);
}
function fsRead(p: string): string {
  return readFileSync(p, "utf8");
}
function fsWrite(p: string, content: string): void {
  mkdirSync(pathResolve(p, ".."), { recursive: true });
  writeFileSync(p, content, "utf8");
}
function fsLs(dir: string): string[] {
  return readdirSync(dir).map((n) => {
    try {
      const st = statSync(pathResolve(dir, n));
      return `${st.isDirectory() ? "d" : "-"} ${n}`;
    } catch {
      return `- ${n}`;
    }
  });
}

/** Minimal recursive glob (no dependency). */
function findFiles(base: string, pattern: string): string[] {
  const MAX = 200;
  const results: string[] = [];
  const walk = (dir: string, rest: string, depth: number): void => {
    if (results.length >= MAX || depth > 20) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (rest === "" || rest === "**") {
      for (const name of entries) {
        const full = pathResolve(dir, name);
        try {
          if (statSync(full).isDirectory() && rest === "**") walk(full, "**", depth + 1);
        } catch {
          /* ignore */
        }
        results.push(full);
      }
      return;
    }
    const seg = rest.split("/")[0];
    const rem = rest.includes("/") ? rest.split("/").slice(1).join("/") : "";
    const re = new RegExp(
      "^" +
        seg
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, "\u0001")
          .replace(/\*/g, ".*")
          .replace(/\u0001/g, ".*") +
        "$",
    );
    for (const name of entries) {
      if (!re.test(name)) continue;
      const full = pathResolve(dir, name);
      try {
        if (statSync(full).isDirectory()) {
          if (rem === "" || rem === "**") results.push(full);
          else walk(full, rem, depth + 1);
        } else if (rem === "") {
          results.push(full);
        }
      } catch {
        /* ignore */
      }
    }
  };
  walk(base, pattern, 0);
  return results.slice(0, MAX);
}

// ── the actual tool definition ──────────────────────────────────────────

const PARAMS = Type.Object({
  code: Type.String({
    description:
      "TypeScript program body that composes host tools. May call `pi.read`, `pi.bash`, `pi.edit`, `pi.write`, `pi.find`, `pi.grep`, `pi.ls`, `pi.exec`, `agents.run`, `agents.list`, `agents.stop`. Independent calls run in parallel with `Promise.all`. Return the value the model should see. Top-level await is allowed.",
    minLength: 1,
  }),
  display: Type.Optional(
    Type.Object({
      name: Type.Optional(Type.String({ description: "Short run name for the activity widget header." })),
      description: Type.Optional(Type.String({ description: "One-line description." })),
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({ description: "Program-level deadline in milliseconds.", minimum: 1, maximum: 3_600_000 }),
  ),
  runId: Type.Optional(Type.String({ description: "Run id to reuse for a resumed/continued run. Generated when omitted." })),
});

export function createForgeryExecTool(
  activity: ForgeryActivityStore,
  runner: AgentRunner,
): ToolDefinition<typeof PARAMS, ForgeryExecDetails> {
  return defineTool({
    name: "forgery_exec",
    label: "Forgery Exec",
    description:
      "Run a TypeScript program that composes Pi core tools and one-shot agents in parallel. Each call is recorded in the activity store and visible in the live footer/widget/dashboard. Return the program's value to the model.",
    promptSnippet:
      "Compose Pi tools and one-shot agents in a single TypeScript program, with parallel calls",
    promptGuidelines: [
      "Use forgery_exec when you need to orchestrate multiple tools or spawn agents.",
      "Independent host calls run in parallel: `await Promise.all([...])` for fan-out.",
      "Each `pi.*` call is validated and recorded; `agents.run` spawns a one-shot Pi subprocess.",
      "Return a JSON-serializable value — the model receives it verbatim.",
    ],
    parameters: PARAMS,
    executionMode: "sequential",
    async execute(
      toolCallId,
      params,
      signal,
      _onUpdate,
      ctx,
    ): Promise<AgentToolResult<ForgeryExecDetails>> {
      // Bind the live context to the registry for this execution.
      const liveCtx = ctx;
      const registry = makeRegistry(runner, activity, liveCtx);

      const runId = params.runId ?? toolCallId;
      const hctx: HostExecCtx = { runId, activity, cwd: ctx.cwd };

      // Build a merged signal that aborts on host abort OR deadline.
      const controlled = new AbortController();
      const hostAbort = () => controlled.abort();
      signal?.addEventListener("abort", hostAbort, { once: true });
      let timer: NodeJS.Timeout | undefined;
      if (params.timeoutMs) {
        timer = setTimeout(() => controlled.abort(), params.timeoutMs);
      }
      const mergedSignal = controlled.signal;

      ctx.ui.setStatus("forgery", "forgery_exec: running…");

      const outcome = await runForgery(params.code, registry, activity, hctx, mergedSignal);

      // Cleanup.
      signal?.removeEventListener("abort", hostAbort);
      if (timer) clearTimeout(timer);

      // Bridge into the activity store.
      const run = activity.get(runId);
      const calls = run ? run.calls.length : 0;
      const ok = outcome.ok;
      const details: ForgeryExecDetails = {
        runId,
        calls,
        ok,
        value: outcome.value,
        error: outcome.error,
      };
      // Build a beautiful boxed result with useful information.
      const runIdShort = runId.slice(0, 8);
      const durationMs = run ? Date.now() - run.startedAt : undefined;
      const lines: string[] = [];

      // Header: status + run id + duration.
      const statusLabel = ok ? "ok" : "failed";
      lines.push(
        `forgery_exec · ${runIdShort} · ${statusLabel}${
          durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ""
        } · ${calls} call${calls !== 1 ? "s" : ""}`,
      );
      lines.push("");

      // Per-call breakdown.
      if (run && run.calls.length > 0) {
        lines.push("calls:");
        for (const call of run.calls) {
          const callDur =
            call.finishedAt && call.startedAt
              ? call.finishedAt - call.startedAt
              : undefined;
          lines.push(
            `  ${formatCallSummary(call.ref, call.status, callDur, call.metrics)}`,
          );
        }
        lines.push("");
      }

      // Result value or error.
      if (ok) {
        const valueText = safeToolResultText(outcome.value);
        if (valueText) {
          lines.push("result:");
          for (const line of valueText.split("\n")) {
            lines.push(`  ${line}`);
          }
        } else {
          lines.push("result: (no return value)");
        }
      } else {
        lines.push("error:");
        lines.push(`  ${outcome.error ?? "unknown error"}`);
      }

      const boxed = box(lines, "forgery_exec");

      return {
        content: [{ type: "text" as const, text: boxed.join("\n") }],
        details,
      };
    },
  });
}

// ── small helpers ────────────────────────────────────────────────────────

/** Pretty-print the tool result value for the model. */
function safeToolResultText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
