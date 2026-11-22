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
import { isAbsolute, resolve as pathResolve, dirname as pathDirname } from "node:path";
import { Type } from "typebox";
import {
  defineTool,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import { ForgeryActivityStore } from "../activity/store";
import type { ForgerySubgoalStatus } from "../activity/types";
import { AgentRunner } from "../agents/runner";
import {
  EnhancedAgentRunner,
  createEnhancedAgentRunner,
  type EnhancedAgentRunRequest,
} from "../agents/enhanced-runner";
import {
  HostCallRegistry,
  runForgery,
  type HostExecCtx,
} from "./runtime";
import {
  ActivityAgentsSchema,
  ActivityExportSchema,
  ActivityImportSchema,
  ActivityRunsSchema,
  ActivitySnapshotSchema,
  ActivitySubgoalsSchema,
  AgentsList,
  AgentsRun,
  AgentsRunEnhanced,
  AgentsRunEnhancedResult,
  AgentsStop,
  AgentsRouteSchema,
  AgentsRouteResultSchema,
  CostBudgetSchema,
  CostEstimateSchema,
  CostOptimizationSchema,
  CostRecordSchema,
  CostReportSchema,
  WorkflowChainSchema,
  WorkflowGateSchema,
  DevLoopRun,
  DevLoopResultSchema,
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
  SubgoalsCreateSchema,
  SubgoalsListSchema,
  SubgoalsResultSchema,
  SubgoalsUpdateSchema,
  WorkflowResolve,
  WorkflowRun,
  WorkflowStatus,
  WorkflowStop,
} from "./schemas";
import {
  DevLoopRunner,
  runDevLoop,
  createPhaseRunners,
  type DevLoopConfig,
} from "../agents/dev-loop";
import { CostManager, createCostManager, type CostBudget } from "../agents/cost-manager";
import { ModelRouter } from "../agents/router";
import { loadConfig, type ForgeryConfig } from "../config";
import { createEngine } from "../workflow/engine";
import { WorkflowChain } from "../workflow/chain";
import { createResolver } from "../workflow/resolver";
import { showImage, showImages, showVideo, type ShowImageResult } from "./display";
import { box, formatCallSummary, formatDuration, oneLine } from "../ui/format";

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

  // Workflow chain — composes pipelines into sequential pipelines with gates.
  const workflowChain = new WorkflowChain(engine, activity);

  // Enhanced agent runner for high-accuracy one-shot agents
  const enhancedRunner = createEnhancedAgentRunner(runner);

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
        name: args.name ? String(args.name) : `agent · ${oneLine(task).slice(0, 32)}`,
        timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
        model: args.model ? String(args.model) : undefined,
        systemPrompt: args.systemPrompt ? String(args.systemPrompt) : undefined,
        parentId: hctx.runId,
        runId: hctx.runId,
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

  // ── Enhanced one-shot agents (high accuracy) ───────────────────────────

  registry.register({
    ref: "agents.runEnhanced",
    schema: AgentsRunEnhanced,
    kind: "agent",
    execute: async (args, hctx, _signal) => {
      const task = String(args.task ?? "");
      if (!task) return { error: "agents.runEnhanced: task is required" };

      // Build enhanced request
      const req: EnhancedAgentRunRequest = {
        task,
        cwd: hctx.cwd,
        model: args.model ? String(args.model) : undefined,
        timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
        systemPrompt: args.systemPrompt ? String(args.systemPrompt) : undefined,
        name: args.name ? String(args.name) : undefined,
        template: args.template as EnhancedAgentRunRequest["template"],
        outputSchema: args.outputSchema as EnhancedAgentRunRequest["outputSchema"],
        maxRetries: args.maxRetries ? Number(args.maxRetries) : undefined,
        qualityGates: args.qualityGates as EnhancedAgentRunRequest["qualityGates"],
        injectContext: args.injectContext !== undefined ? Boolean(args.injectContext) : true,
        allowedTools: args.allowedTools as EnhancedAgentRunRequest["allowedTools"],
        budget: args.budget as EnhancedAgentRunRequest["budget"],
        parentRunId: hctx.runId,
        parentId: hctx.runId,
      };

      const result = await enhancedRunner.runEnhanced(req);
      const agent = runner.get(result.id);
      if (agent) activity.addAgent(agent);
      const ok = result.status === "completed";

      // Update activity with metrics
      if (result.usage) {
        const run = activity.get(hctx.runId);
        if (run) {
          if (!run.metrics) run.metrics = { toolCalls: 0, tokens: 0, cost: 0 };
          run.metrics.toolCalls += 1;
          run.metrics.tokens += result.usage.output ?? 0;
        }
      }

      return {
        value: {
          id: result.id,
          status: result.status,
          text: result.text,
          usage: result.usage,
          attempts: result.attempts,
          validationErrors: result.validationErrors,
          qualityGateFailures: result.qualityGateFailures,
          structuredOutput: result.structuredOutput,
        },
        preview: `${result.status} (attempt ${result.attempts}) ${(result.text ?? "").slice(0, 40)}`,
        error: ok ? undefined : result.error ?? result.status,
      };
    },
  });

  // Convenience: pre-configured specialist agents
  const specialistTemplates = [
    { ref: "agents.coder", template: "coder" as const },
    { ref: "agents.researcher", template: "researcher" as const },
    { ref: "agents.reviewer", template: "reviewer" as const },
    { ref: "agents.planner", template: "planner" as const },
    { ref: "agents.tester", template: "tester" as const },
    { ref: "agents.documenter", template: "documenter" as const },
    { ref: "agents.debugger", template: "debugger" as const },
    { ref: "agents.architect", template: "architect" as const },
    { ref: "agents.security", template: "security" as const },
    { ref: "agents.design", template: "design" as const },
    { ref: "agents.git", template: "git" as const },
    { ref: "agents.sniper", template: "sniper" as const },
    { ref: "agents.teammate", template: "teammate" as const },
  ];

  for (const { ref, template } of specialistTemplates) {
    registry.register({
      ref,
      schema: Type.Object({
        task: Type.String({ description: `Task for the ${template} agent.` }),
        cwd: Type.Optional(Type.String()),
        model: Type.Optional(Type.String()),
        timeoutMs: Type.Optional(Type.Number()),
        systemPrompt: Type.Optional(Type.String()),
        outputSchema: Type.Optional(Type.Unknown()),
        maxRetries: Type.Optional(Type.Number({ minimum: 0, maximum: 5 })),
      }),
      kind: "agent",
      execute: async (args, hctx, _signal) => {
        const task = String(args.task ?? "");
        if (!task) return { error: `${ref}: task is required` };

        const req: EnhancedAgentRunRequest = {
          task,
          cwd: hctx.cwd,
          model: args.model ? String(args.model) : undefined,
          timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
          systemPrompt: args.systemPrompt ? String(args.systemPrompt) : undefined,
          template,
          outputSchema: args.outputSchema as EnhancedAgentRunRequest["outputSchema"],
          maxRetries: args.maxRetries ? Number(args.maxRetries) : undefined,
          parentRunId: hctx.runId,
          parentId: hctx.runId,
        };

        const result = await enhancedRunner.runEnhanced(req);
        const agent = runner.get(result.id);
        if (agent) activity.addAgent(agent);
        const ok = result.status === "completed";

        return {
          value: {
            id: result.id,
            status: result.status,
            text: result.text,
            usage: result.usage,
            attempts: result.attempts,
            validationErrors: result.validationErrors,
            qualityGateFailures: result.qualityGateFailures,
            structuredOutput: result.structuredOutput,
          },
          preview: `${template}: ${result.status} (attempt ${result.attempts}) ${(result.text ?? "").slice(0, 40)}`,
          error: ok ? undefined : result.error ?? result.status,
        };
      },
    });
  }

  // Parallel specialist agent execution
  registry.register({
    ref: "agents.runParallel",
    schema: Type.Object({
      agents: Type.Array(Type.Object({
        ref: Type.String({ enum: specialistTemplates.map(t => t.ref) }),
        task: Type.String(),
        outputSchema: Type.Optional(Type.Unknown()),
      }), { description: "Array of specialist agents to run in parallel." }),
    }),
    kind: "agent",
    execute: async (args, hctx, _signal) => {
      const agents = Array.isArray(args.agents) ? args.agents : [];
      if (agents.length === 0) return { error: "agents.runParallel: agents array required" };

      const requests: EnhancedAgentRunRequest[] = agents.map((a) => ({
        task: String(a.task),
        cwd: hctx.cwd,
        template: a.ref.replace("agents.", "") as EnhancedAgentRunRequest["template"],
        outputSchema: a.outputSchema as EnhancedAgentRunRequest["outputSchema"],
        parentRunId: hctx.runId,
        parentId: hctx.runId,
      }));

      const results = await enhancedRunner.runParallel(requests);
      for (const result of results) {
        const agent = runner.get(result.id);
        if (agent) activity.addAgent(agent);
      }

      return {
        value: results.map((r) => ({
          id: r.id,
          status: r.status,
          text: r.text,
          attempts: r.attempts,
          structuredOutput: r.structuredOutput,
        })),
        preview: `parallel: ${results.length} agents, ${results.filter(r => r.status === "completed").length} completed`,
      };
    },
  });

  // Sequential pipeline of specialist agents
  registry.register({
    ref: "agents.runPipeline",
    schema: Type.Object({
      steps: Type.Array(Type.Object({
        ref: Type.String({ enum: specialistTemplates.map(t => t.ref) }),
        task: Type.String(),
        outputSchema: Type.Optional(Type.Unknown()),
      }), { description: "Array of specialist agents to run sequentially (each passes context to next)." }),
    }),
    kind: "agent",
    execute: async (args, hctx, _signal) => {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      if (steps.length === 0) return { error: "agents.runPipeline: steps array required" };

      const requests: EnhancedAgentRunRequest[] = steps.map((s) => ({
        task: String(s.task),
        cwd: hctx.cwd,
        template: s.ref.replace("agents.", "") as EnhancedAgentRunRequest["template"],
        outputSchema: s.outputSchema as EnhancedAgentRunRequest["outputSchema"],
        parentRunId: hctx.runId,
        parentId: hctx.runId,
      }));

      const results = await enhancedRunner.runPipeline(requests);
      for (const result of results) {
        const agent = runner.get(result.id);
        if (agent) activity.addAgent(agent);
      }

      return {
        value: results.map((r) => ({
          id: r.id,
          status: r.status,
          text: r.text,
          attempts: r.attempts,
          structuredOutput: r.structuredOutput,
        })),
        preview: `pipeline: ${results.length} steps, ${results.filter(r => r.status === "completed").length} completed`,
      };
    },
  });

  // ── Production Development Loop (research-plan-test-code-review-learn) ─────

  registry.register({
    ref: "devloop.run",
    schema: DevLoopRun,
    kind: "agent",
    execute: async (args, hctx, _signal) => {
      const task = String(args.task ?? "");
      if (!task) return { error: "devloop.run: task is required" };

      const loopRunner = new DevLoopRunner(runner, activity, hctx.cwd, hctx.runId);
      const result = await loopRunner.run(task, {
        maxLoopIterations: args.maxLoopIterations ? Number(args.maxLoopIterations) : 3,
        maxPhaseRetries: args.maxPhaseRetries ? Number(args.maxPhaseRetries) : 2,
        enableLearning: args.enableLearning !== undefined ? Boolean(args.enableLearning) : true,
        qualityThreshold: args.qualityThreshold ? Number(args.qualityThreshold) : 0.8,
        phaseOrder: args.phaseOrder as DevLoopConfig["phaseOrder"],
        globalContext: args.globalContext ? String(args.globalContext) : undefined,
        budget: args.budget as DevLoopConfig["budget"],
      });

      // Record all agents from the loop
      for (const phase of result.phases) {
        const agent = runner.get(phase.result.id);
        if (agent) activity.addAgent(agent);
      }

      return {
        value: result,
        preview: `devloop: ${result.success ? "SUCCESS" : "PARTIAL"} after ${result.iterations} iterations, ${result.totalMetrics.phasesCompleted}/${result.phases.length} phases passed`,
        error: result.success ? undefined : `Loop completed with failures: ${result.phases.filter(p => !p.passed).map(p => p.phase).join(", ")}`,
      };
    },
  });

  // Individual phase runners for step-by-step control
  const phaseRunners = createPhaseRunners(runner, activity, undefined as any, undefined as any);

  for (const [phaseName, phaseRunner] of Object.entries({
    research: () => phaseRunners.research,
    plan: () => phaseRunners.plan,
    test: () => phaseRunners.test,
    code: () => phaseRunners.code,
    review: () => phaseRunners.review,
    learn: () => phaseRunners.learn,
  })) {
    registry.register({
      ref: `devloop.${phaseName}`,
      schema: Type.Object({
        task: Type.String({ description: `Task for ${phaseName} phase.` }),
        context: Type.Optional(Type.String({ description: "Context from previous phases." })),
        research: Type.Optional(Type.Unknown({ description: "Research output (for plan/test/code/review)." })),
        plan: Type.Optional(Type.Unknown({ description: "Plan output (for test/code/review)." })),
        tests: Type.Optional(Type.Unknown({ description: "Test output (for code/review)." })),
        code: Type.Optional(Type.Unknown({ description: "Code output (for review)." })),
        phases: Type.Optional(Type.Array(Type.Unknown(), { description: "All phases (for learn)." })),
      }),
      kind: "agent",
      execute: async (args, hctx, _signal) => {
        // This is a simplified version - the real phase runners need the enhanced runner
        const enhanced = new EnhancedAgentRunner(runner);
        const task = String(args.task ?? "");
        if (!task) return { error: `devloop.${phaseName}: task is required` };

        let prompt = task;
        if (args.context) prompt += `\n\nContext: ${args.context}`;
        if (args.research) prompt += `\n\nResearch: ${JSON.stringify(args.research)}`;
        if (args.plan) prompt += `\n\nPlan: ${JSON.stringify(args.plan)}`;
        if (args.tests) prompt += `\n\nTests: ${JSON.stringify(args.tests)}`;
        if (args.code) prompt += `\n\nCode: ${JSON.stringify(args.code)}`;
        if (args.phases) prompt += `\n\nPhases: ${JSON.stringify(args.phases)}`;

        const templateMap: Record<string, string> = {
          research: "researcher",
          plan: "planner",
          test: "tester",
          code: "coder",
          review: "reviewer",
          learn: "general",
        };

        const result = await enhanced.runEnhanced({
          task: prompt,
          cwd: hctx.cwd,
          template: templateMap[phaseName] as any,
          parentRunId: hctx.runId,
          parentId: hctx.runId,
          name: `devloop-${phaseName}`,
          maxRetries: 2,
        });

        const agent = runner.get(result.id);
        if (agent) activity.addAgent(agent);

        return {
          value: result,
          preview: `${phaseName}: ${result.status} (attempt ${result.attempts})`,
          error: result.status === "completed" ? undefined : result.error,
        };
      },
    });
  }

  // ── Cost Management host calls ───────────────────────────────────────

// Create a cost manager for this execution context
const costManager = createCostManager(activity);

// Model routing intelligence — recommends cheapest model with
// sufficient historical pass rate for a given task class.
const modelRouter = new ModelRouter(activity, costManager);

// Estimate cost before running
registry.register({
  ref: "cost.estimate",
  schema: CostEstimateSchema,
  kind: "tool",
  execute: async (args) => {
    const model = String(args.model ?? "default");
    const template = args.template ? String(args.template) : undefined;
    const taskDescription = String(args.taskDescription ?? "");
    const contextTokens = args.contextTokens ? Number(args.contextTokens) : 0;
    
    if (!taskDescription) return { error: "cost.estimate: taskDescription is required" };
    
    const estimate = costManager.estimateCost(model, taskDescription, template, contextTokens);
    return { value: estimate, preview: `estimate: ~$${estimate.estimatedCost.toFixed(4)} (${estimate.estimatedInputTokens}→${estimate.estimatedOutputTokens} tokens)` };
  },
});

// Get cost report for a run
registry.register({
  ref: "cost.report",
  schema: CostReportSchema,
  kind: "tool",
  execute: async (args, hctx) => {
    const runId = args.runId ? String(args.runId) : hctx.runId;
    const format = args.format ? String(args.format) : "text";
    
    const report = costManager.exportReport(runId);
    return { value: report, preview: `cost report: ${runId.slice(0, 8)}` };
  },
});

// Get optimization recommendations
registry.register({
  ref: "cost.optimize",
  schema: CostOptimizationSchema,
  kind: "tool",
  execute: async (args) => {
    const runId = String(args.runId ?? "");
    if (!runId) return { error: "cost.optimize: runId is required" };
    
    const recommendations = costManager.getOptimizationRecommendations(runId);
    return { value: recommendations, preview: `${recommendations.length} optimization(s) found` };
  },
});

// Set budget for current run
registry.register({
  ref: "cost.budget",
  schema: CostBudgetSchema,
  kind: "tool",
  execute: async (args, hctx) => {
    const runId = hctx.runId;
    const budget: CostBudget = {
      maxCostPerRun: args.maxCostPerRun ? Number(args.maxCostPerRun) : undefined,
      maxCostPerAgent: args.maxCostPerAgent ? Number(args.maxCostPerAgent) : undefined,
      maxCostPerPhase: args.maxCostPerPhase ? Number(args.maxCostPerPhase) : undefined,
      maxTokensPerRun: args.maxTokensPerRun ? Number(args.maxTokensPerRun) : undefined,
      maxTokensPerAgent: args.maxTokensPerAgent ? Number(args.maxTokensPerAgent) : undefined,
      warningThreshold: args.warningThreshold ? Number(args.warningThreshold) : undefined,
    };
    
    costManager.setBudget(runId, budget);
    return { value: { ok: true, budget }, preview: `budget set for ${runId.slice(0, 8)}` };
  },
});

// Get cost records for a run
registry.register({
  ref: "cost.records",
  schema: CostRecordSchema,
  kind: "tool",
  execute: async (args, hctx) => {
    const runId = args.runId ? String(args.runId) : hctx.runId;
    const agentId = args.agentId ? String(args.agentId) : undefined;
    
    const run = costManager.getRunCost(runId);
    if (!run) return { error: `cost.records: run ${runId} not found` };
    
    let records = run.agentCosts;
    if (agentId) records = records.filter((r: any) => r.agentId === agentId);
    
    return { value: records, preview: `${records.length} cost record(s) for ${runId.slice(0, 8)}` };
  },
});

// Get total costs across all runs
registry.register({
  ref: "cost.totals",
  schema: Type.Object({}),
  kind: "tool",
  execute: async () => {
    const totals = costManager.getTotalCosts();
    return { value: totals, preview: `global: $${totals.totalCost.toFixed(4)} | ${totals.runCount} runs | ${totals.agentCount} agents` };
  },
});

// ── Agent model routing ───────────────────────────────────────────────

registry.register({
  ref: "agents.route",
  schema: AgentsRouteSchema,
  kind: "tool",
  execute: async (args) => {
    const task = String(args.task ?? "");
    if (!task) return { error: "agents.route: task is required" };
    const candidates = Array.isArray(args.candidates) ? (args.candidates as string[]) : undefined;
    const minPassRate = args.minPassRate !== undefined ? Number(args.minPassRate) : 0.6;

    const result = modelRouter.route(task, candidates, minPassRate);
    return {
      value: result,
      preview: `route ${result.model} · ${(result.historicalPassRate * 100).toFixed(0)}% pass · $${result.expectedCost.toFixed(4)}`,
    };
  },
});

// ── Subgoal host calls ────────────────────────────────────────────────

  registry.register({
    ref: "subgoals.create",
    schema: SubgoalsCreateSchema,
    kind: "tool",
    execute: async (args, hctx) => {
      const goalId = args.goalId ? String(args.goalId) : hctx.runId;
      const subgoal = activity.subgoal({
        goalId,
        parentSubgoalId: args.parentSubgoalId ? String(args.parentSubgoalId) : undefined,
        name: String(args.name ?? ""),
        description: args.description ? String(args.description) : undefined,
        acceptanceCriteria: args.acceptanceCriteria as string[] | undefined,
        status: (args.status as ForgerySubgoalStatus | undefined) ?? "pending",
        current: args.current ? String(args.current) : undefined,
        total: args.total ? Number(args.total) : undefined,
        completed: args.completed ? Number(args.completed) : undefined,
      });
      return {
        value: subgoal,
        preview: `subgoal ${subgoal.name} · ${subgoal.status} · ${subgoal.id.slice(0, 8)}`,
      };
    },
  });

  registry.register({
    ref: "subgoals.update",
    schema: SubgoalsUpdateSchema,
    kind: "tool",
    execute: async (args) => {
      const subgoalId = String(args.subgoalId ?? "");
      if (!subgoalId) return { error: "subgoals.update: subgoalId is required" };
      const subgoal = activity.updateSubgoal(subgoalId, {
        status: args.status as ForgerySubgoalStatus | undefined,
        current: args.current ? String(args.current) : undefined,
        total: args.total ? Number(args.total) : undefined,
        completed: args.completed ? Number(args.completed) : undefined,
        output: args.output,
        error: args.error ? String(args.error) : undefined,
        usage: args.usage as { input?: number; output?: number; cost?: number } | undefined,
      });
      if (!subgoal) return { error: `subgoals.update: subgoal ${subgoalId} not found` };
      return {
        value: subgoal,
        preview: `subgoal ${subgoal.name} → ${subgoal.status}`,
      };
    },
  });

  registry.register({
    ref: "subgoals.list",
    schema: SubgoalsListSchema,
    kind: "tool",
    execute: async (args, hctx) => {
      const goalId = args.goalId ? String(args.goalId) : hctx.runId;
      const subgoals = activity.subgoalsForGoal(goalId);
      return {
        value: subgoals,
        preview: `${subgoals.length} subgoal(s) for ${goalId.slice(0, 8)}`,
      };
    },
  });

  registry.register({
    ref: "subgoals.finish",
    schema: Type.Object({
      subgoalId: Type.String({ description: "Subgoal id returned by subgoals.create." }),
      success: Type.Optional(Type.Boolean({ description: "Whether the subgoal succeeded (default true)." })),
      error: Type.Optional(Type.String({ description: "Error message if the subgoal failed." })),
    }),
    kind: "tool",
    execute: async (args) => {
      const subgoalId = String(args.subgoalId ?? "");
      if (!subgoalId) return { error: "subgoals.finish: subgoalId is required" };
      const subgoal = activity.finishSubgoal(subgoalId, args.success !== false, args.error ? String(args.error) : undefined);
      if (!subgoal) return { error: `subgoals.finish: subgoal ${subgoalId} not found` };
      return {
        value: subgoal,
        preview: `subgoal ${subgoal.name} → ${subgoal.status}`,
      };
    },
  });

// ── Activity query host calls ─────────────────────────────────────────

  registry.register({
    ref: "activity.snapshot",
    schema: ActivitySnapshotSchema,
    kind: "tool",
    execute: async (_args, hctx) => {
      const runId = hctx.runId;
      const run = activity.get(runId);
      // Return a read-only snapshot of the full activity surface.
      return {
        value: activity.snapshot(),
        preview: `snapshot: ${activity.runs().length} run(s), ${activity.agents().length} agent(s)`,
      };
    },
  });

  registry.register({
    ref: "activity.runs",
    schema: ActivityRunsSchema,
    kind: "tool",
    execute: async () => {
      return {
        value: activity.runs(),
        preview: `${activity.runs().length} run(s)`,
      };
    },
  });

  registry.register({
    ref: "activity.agents",
    schema: ActivityAgentsSchema,
    kind: "tool",
    execute: async () => {
      return {
        value: activity.agents(),
        preview: `${activity.agents().length} agent(s)`,
      };
    },
  });

  registry.register({
    ref: "activity.subgoals",
    schema: ActivitySubgoalsSchema,
    kind: "tool",
    execute: async (args, hctx) => {
      const goalId = args.goalId ? String(args.goalId) : hctx.runId;
      const subs = activity.subgoalsForGoal(goalId);
      return {
        value: subs,
        preview: `${subs.length} subgoal(s) for ${goalId.slice(0, 8)}`,
      };
    },
  });

// ── Activity export / import ─────────────────────────────────────────

  registry.register({
    ref: "activity.export",
    schema: ActivityExportSchema,
    kind: "tool",
    execute: async (args, hctx) => {
      const runId = args.runId ? String(args.runId) : hctx.runId;
      const snap = activity.get(runId) ? activity.snapshot() : null;
      if (!snap) return { error: `activity.export: no snapshot for run ${runId}` };
      const dir = args.path
        ? pathResolve(hctx.cwd, pathDirname(String(args.path)))
        : pathResolve(hctx.cwd, ".pi", "forgery");
      mkdirSync(dir, { recursive: true });
      const filePath = args.path
        ? pathResolve(hctx.cwd, String(args.path))
        : pathResolve(dir, `activity-${runId.slice(0, 8)}.json`);
      writeFileSync(filePath, JSON.stringify(snap, null, 2), "utf8");
      return {
        value: { path: filePath, runs: snap.runs.length, agents: snap.agents.length },
        preview: `exported ${snap.runs.length} run(s), ${snap.agents.length} agent(s) → ${filePath}`,
      };
    },
  });

  registry.register({
    ref: "activity.import",
    schema: ActivityImportSchema,
    kind: "tool",
    execute: async (args) => {
      const filePath = pathResolve(process.cwd(), String(args.path));
      let json: string;
      try {
        json = readFileSync(filePath, "utf8");
      } catch (e) {
        return { error: `activity.import: cannot read ${filePath}: ${e instanceof Error ? e.message : String(e)}` };
      }
      try {
        activity.importSnapshot(json);
      } catch (e) {
        return { error: `activity.import: invalid snapshot: ${e instanceof Error ? e.message : String(e)}` };
      }
      const snap = activity.snapshot();
      return {
        value: { runs: snap.runs.length, agents: snap.agents.length },
        preview: `imported ${snap.runs.length} run(s), ${snap.agents.length} agent(s)`,
      };
    },
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

  // ── Workflow chain (pipeline composition) ────────────────────────────

  registry.register({
    ref: "workflow.chain",
    schema: WorkflowChainSchema,
    kind: "agent",
    execute: async (args, hctx) => {
      const rawSteps = Array.isArray(args.steps) ? args.steps : [];
      if (rawSteps.length === 0) {
        return { error: "workflow.chain: steps array required" };
      }

      const normalized: Array<{ pipeline: string; target?: string; context?: string[]; mode?: string; gate?: "proceed" | "pause" | "abort" }> = rawSteps.map((s) => {
        const step = s as { pipeline?: unknown; target?: unknown; context?: unknown; mode?: unknown; gate?: unknown };
        return {
          pipeline: String(step.pipeline ?? ""),
          target: step.target ? String(step.target) : undefined,
          context: Array.isArray(step.context) ? step.context.filter((x): x is string => typeof x === "string") : undefined,
          mode: typeof step.mode === "string" ? step.mode : undefined,
          gate: (step.gate === "proceed" || step.gate === "pause" || step.gate === "abort") ? step.gate : undefined,
        };
      });

      const result = await workflowChain.run(normalized, hctx.runId);
      return {
        value: result,
        preview: `chain ${result.status}: ${result.steps.length} step(s)`,
        error: result.status === "failed" ? result.error : undefined,
      };
    },
  });

  registry.register({
    ref: "workflow.gate",
    schema: WorkflowGateSchema,
    kind: "tool",
    execute: async (args) => {
      const chainId = String(args.chainId ?? "");
      const gate = String(args.gate ?? "");
      if (!["proceed", "pause", "abort"].includes(gate)) {
        return { error: `workflow.gate: gate must be proceed | pause | abort, got ${gate}` };
      }
      const run = activity.get(chainId);
      if (!run) return { error: `workflow.gate: unknown chain run ${chainId}` };
      workflowChain.setGate(chainId, gate as "proceed" | "pause" | "abort");
      return {
        value: { chainId, gate },
        preview: `gate ${chainId.slice(0, 8)} → ${gate}`,
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
  /** When true, validates every host call's args against its schema and reports
   *  the planned call sequence without executing any host call. */
  dryRun: Type.Optional(Type.Boolean({ description: "Validate calls without executing (dry-run / pre-flight check)." })),
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

      const outcome = await runForgery(params.code, registry, activity, hctx, mergedSignal, Boolean(params.dryRun));

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
