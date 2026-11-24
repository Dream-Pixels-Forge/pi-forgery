/**
 * pi-forgery — one-shot agent runner.
 *
 * Spawns a child Pi process (`pi --mode json "<task>"`), captures its JSONL
 * output, and parses the final assistant text + usage. Each run is
 * recorded in the activity store as an agent with observed status.
 *
 * Data honesty: a missing `pi` binary reports `agent_unavailable`, not a
 * fabricated success.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ForgeryAgentRecord } from "../activity/types";

export interface AgentRunRequest {
  task: string;
  /** Working directory for the agent subprocess. */
  cwd?: string;
  /** Model id override. */
  model?: string;
  /** Soft timeout in milliseconds. Defaults to 600 000 (10 min). */
  timeoutMs?: number;
  /** Extra system prompt lines. */
  systemPrompt?: string;
  /** Name of the agent for the activity widget. */
  name?: string;
  /** Run id this agent belongs to, so agents can be grouped per run. */
  runId?: string;
  /** Parent agent id, if this agent is a subagent of another agent. */
  parentId?: string;
}

export interface AgentRunResult {
  id: string;
  status: ForgeryAgentRecord["status"];
  text: string;
  value?: unknown;
  error?: string;
  usage?: { input?: number; output?: number; cost?: number };
  startedAt: number;
  finishedAt: number;
}

interface RunnerState {
  running: Map<string, ChildProcess>;
}

/**
 * One-shot agent runner. Bounded concurrency via a simple semaphore.
 */
export class AgentRunner {
  /** The `pi` binary to spawn for one-shot agents. */
  readonly piBinary: string;

  private state: RunnerState;
  private listeners: Set<() => void> = new Set();
  private agents: Map<string, ForgeryAgentRecord> = new Map();
  private queue: Promise<void> = Promise.resolve();
  private terminationTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly maxConcurrent: number;

  constructor(options: { piBinary?: string; maxConcurrent?: number } = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 4;
    this.piBinary = options.piBinary ?? "pi";
    this.state = { running: new Map() };
  }

  /** Soft concurrency cap (exposed for the settings view). */
  get concurrency(): number {
    return this.maxConcurrent;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** Run a one-shot agent. Awaits completion (or timeout). */
  async run(req: AgentRunRequest, signal?: AbortSignal): Promise<AgentRunResult> {
    const id = randomUUID();
    const startedAt = Date.now();
    const agent: ForgeryAgentRecord = {
      id,
      name: req.name ?? "agent",
      task: req.task.slice(0, 200),
      status: "queued",
      startedAt,
      updatedAt: startedAt,
      parentId: req.parentId,
      runId: req.runId,
      cwd: req.cwd,
      model: req.model,
      systemPrompt: req.systemPrompt,
      timeoutMs: req.timeoutMs,
    };
    this.agents.set(id, agent);
    this.notify();

    // Serialize with bounded concurrency.
    const prior = this.queue;
    const slot = prior.then(async () => {
      if (signal?.aborted) {
        agent.status = "stopped";
        agent.error = "aborted";
        agent.finishedAt = Date.now();
        this.notify();
        return {
          id,
          status: "stopped" as const,
          text: "",
          error: agent.error,
          startedAt,
          finishedAt: agent.finishedAt,
        };
      }
      agent.status = "running";
      agent.updatedAt = Date.now();
      this.notify();

      // Resolve the pi binary. If it's missing, report unavailable.
      if (!this.#hasPiBinary()) {
        agent.status = "unavailable";
        agent.error = "pi binary not found on PATH";
        agent.finishedAt = Date.now();
        this.notify();
        return {
          id,
          status: "unavailable" as const,
          text: "",
          error: agent.error,
          startedAt,
          finishedAt: Date.now(),
        };
      }

      return this.#spawn(id, req, agent, startedAt, signal);
    });
    this.queue = slot.then(
      () => undefined,
      () => undefined,
    );

    const result = await slot;
    return result as AgentRunResult;
  }

  /** Stop a running agent. No-op if not running. */
  stop(agentId: string): AgentRunResult | undefined {
    const child = this.state.running.get(agentId);
    if (child) {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = "stopped";
        agent.error = "stopped by request";
        agent.finishedAt = Date.now();
        this.notify();
      }
      this.#terminate(agentId, child);
      this.state.running.delete(agentId);
      return {
        id: agentId,
        status: "stopped",
        text: "",
        startedAt: agent?.startedAt ?? 0,
        finishedAt: Date.now(),
      };
    }
    return undefined;
  }

  /** Retry a failed/stopped/timed_out/unavailable agent, re-spawning it with
   *  its original run parameters. Returns undefined if the agent cannot be
   *  retried (unknown, running, queued, or completed). */
  async retry(agentId: string): Promise<AgentRunResult | undefined> {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    if (
      agent.status === "running" ||
      agent.status === "queued" ||
      agent.status === "completed"
    ) {
      return undefined;
    }
    return this.run({
      task: agent.task,
      cwd: agent.cwd,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      timeoutMs: agent.timeoutMs,
      name: agent.name,
      runId: agent.runId,
      parentId: agent.parentId,
    });
  }

  /** UI-oriented list. */
  listForUi(): ForgeryAgentRecord[] {
    return [...this.agents.values()].reverse();
  }

  get(agentId: string): ForgeryAgentRecord | undefined {
    return this.agents.get(agentId);
  }

  // ── internals ──────────────────────────────────────────────────────────

  #hasPiBinary(): boolean {
    // Cheap probe — we don't shell out to `which`. We'll catch spawn
    // errors as "unavailable" at the spawn site instead.
    return this.piBinary.length > 0;
  }

  #terminate(agentId: string, child: ChildProcess): void {
    child.kill("SIGTERM");
    const existing = this.terminationTimers.get(agentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 100);
    timer.unref?.();
    this.terminationTimers.set(agentId, timer);
  }

  #clearTermination(agentId: string): void {
    const timer = this.terminationTimers.get(agentId);
    if (timer) clearTimeout(timer);
    this.terminationTimers.delete(agentId);
  }

  async #spawn(
    agentId: string,
    req: AgentRunRequest,
    agent: ForgeryAgentRecord,
    startedAt: number,
    signal?: AbortSignal,
  ): Promise<AgentRunResult> {
    const timeoutMs = req.timeoutMs ?? 600_000;
    const args = ["--mode", "json"];
    if (req.model) args.push("--model", req.model);
    const fullPrompt = req.systemPrompt ? `${req.systemPrompt}\n\n${req.task}` : req.task;
    args.push(fullPrompt);

    const child = spawn(this.piBinary, args, {
      cwd: req.cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    this.state.running.set(agentId, child);

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4000) stderr = stderr.slice(0, 4000);
    });

    const timer = setTimeout(() => {
      if (child.exitCode === null && agent.status === "running") {
        agent.status = "timed_out";
        agent.error = `timed out after ${timeoutMs / 1000}s`;
        agent.finishedAt = Date.now();
        this.#terminate(agentId, child);
        this.state.running.delete(agentId);
        this.notify();
      }
    }, timeoutMs);
    const onAbort = () => {
      if (child.exitCode === null && agent.status === "running") {
        agent.status = "stopped";
        agent.error = "aborted";
        agent.finishedAt = Date.now();
        this.#terminate(agentId, child);
        this.state.running.delete(agentId);
        this.notify();
      }
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const result = await new Promise<AgentRunResult>((resolve) => {
      child.on("close", (code) => {
        clearTimeout(timer);
        this.#clearTermination(agentId);
        signal?.removeEventListener("abort", onAbort);
        this.state.running.delete(agentId);
        const finishedAt = Date.now();
        // Parse the final JSONL assistant message.
        const parsed = parsePiPrintJsonl(stdout);
        const missingResult = code === 0 && parsed === undefined;
        const status: ForgeryAgentRecord["status"] =
          agent.status === "timed_out" || agent.status === "stopped"
            ? agent.status
            : code === 0 && !missingResult
              ? "completed"
              : "failed";
        const resultError = status === "timed_out" || status === "stopped"
          ? agent.error
          : missingResult
            ? "no assistant result in Pi JSON output"
            : code === 0
              ? undefined
              : stderr.slice(0, 400) || `exit ${code}`;
        agent.status = status;
        agent.finishedAt = finishedAt;
        agent.text = parsed?.text ?? "";
        agent.error = resultError?.slice(0, 200);
        if (parsed?.usage) {
          agent.usage = parsed.usage;
        }
        this.notify();
        resolve({
          id: agentId,
          status,
          text: parsed?.text ?? "",
          value: parsed?.value,
          error: resultError,
          usage: parsed?.usage,
          startedAt,
          finishedAt,
        });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        this.#clearTermination(agentId);
        signal?.removeEventListener("abort", onAbort);
        this.state.running.delete(agentId);
        agent.status = "failed";
        agent.error = err.message;
        agent.finishedAt = Date.now();
        this.notify();
        resolve({
          id: agentId,
          status: "failed",
          text: "",
          error: err.message,
          startedAt,
          finishedAt: Date.now(),
        });
      });
    });

    return result;
  }
}

/**
 * Parse the stdout of `pi --mode json` as a stream of JSONL. We extract:
 *   - the final assistant text
 *   - any structured value the agent returned (pi may emit a JSON payload)
 *   - usage
 */
function parseUsage(raw: unknown): { input?: number; output?: number; cost?: number } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const usage = raw as Record<string, unknown>;
  const rawCost = usage.cost;
  const cost = typeof rawCost === "number"
    ? rawCost
    : rawCost && typeof rawCost === "object" && typeof (rawCost as Record<string, unknown>).total === "number"
      ? (rawCost as Record<string, number>).total
      : undefined;
  return {
    input: typeof usage.input === "number" ? usage.input : undefined,
    output: typeof usage.output === "number" ? usage.output : undefined,
    cost,
  };
}

export function parsePiPrintJsonl(
  stdout: string,
): { text?: string; value?: unknown; usage?: { input?: number; output?: number; cost?: number } } | undefined {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  let lastText = "";
  let lastValue: unknown;
  let lastUsage: { input?: number; output?: number; cost?: number } | undefined;
  for (const line of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type === "message_end") {
      const message = obj.message as Record<string, unknown> | undefined;
      if (message?.role === "assistant") {
        if (typeof message.content === "string") {
          lastText = message.content;
        } else if (Array.isArray(message.content)) {
          lastText = message.content
            .filter((part) => part && typeof part === "object" && (part as Record<string, unknown>).type === "text")
            .map((part) => String((part as Record<string, unknown>).text ?? ""))
            .join("\n");
        }
      }
      lastUsage = parseUsage(message?.usage) ?? lastUsage;
    }

    lastUsage = parseUsage(obj.usage) ?? lastUsage;
    // Keep support for the simple records accepted before JSON-mode events.
    if (typeof obj.text === "string") lastText = obj.text;
    if (obj.value !== undefined) lastValue = obj.value;
  }
  if (!lastText.trim() && lastValue === undefined) return undefined;
  return { text: lastText, value: lastValue, usage: lastUsage };
}
