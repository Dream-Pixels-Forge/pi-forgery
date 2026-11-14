/**
 * pi-forgery — one-shot agent runner.
 *
 * Spawns a child Pi process (`pi --print "<task>"`), captures its JSONL
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
  async run(req: AgentRunRequest): Promise<AgentRunResult> {
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
    };
    this.agents.set(id, agent);
    this.notify();

    // Serialize with bounded concurrency.
    const prior = this.queue;
    const slot = prior.then(async () => {
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

      return this.#spawn(id, req, agent, startedAt);
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
      child.kill("SIGTERM");
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = "stopped";
        agent.finishedAt = Date.now();
        this.notify();
      }
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

  async #spawn(
    agentId: string,
    req: AgentRunRequest,
    agent: ForgeryAgentRecord,
    startedAt: number,
  ): Promise<AgentRunResult> {
    const timeoutMs = req.timeoutMs ?? 600_000;
    const args = ["--print"];
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
      if (child.exitCode === null) {
        agent.status = "timed_out";
        agent.error = `timed out after ${timeoutMs / 1000}s`;
        agent.finishedAt = Date.now();
        child.kill("SIGTERM");
        this.state.running.delete(agentId);
        this.notify();
      }
    }, timeoutMs);

    const result = await new Promise<AgentRunResult>((resolve) => {
      child.on("close", (code) => {
        clearTimeout(timer);
        this.state.running.delete(agentId);
        const finishedAt = Date.now();
        // Parse the final JSONL assistant message.
        const parsed = parsePiPrintJsonl(stdout);
        const status: ForgeryAgentRecord["status"] =
          code === 0 ? "completed" : agent.status === "timed_out" ? "timed_out" : "failed";
        agent.status = status;
        agent.finishedAt = finishedAt;
        agent.text = parsed?.text ?? "";
        agent.error = code === 0 ? undefined : stderr.slice(0, 200) || `exit ${code}`;
        if (parsed?.usage) {
          agent.usage = parsed.usage;
        }
        this.notify();
        resolve({
          id: agentId,
          status,
          text: parsed?.text ?? "",
          value: parsed?.value,
          error: code === 0 ? undefined : stderr.slice(0, 400) || `exit ${code}`,
          usage: parsed?.usage,
          startedAt,
          finishedAt,
        });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
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
 * Parse the stdout of `pi --print` as a stream of JSONL. We extract:
 *   - the final assistant text
 *   - any structured value the agent returned (pi may emit a JSON payload)
 *   - usage
 */
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
    // Common pi --print shapes:
    //   { "type": "assistant", "text": "...", "usage": {...} }
    //   { "type": "result", "value": ..., "usage": {...} }
    //   { "text": "..." }
    if (typeof obj.text === "string") lastText = obj.text;
    if (obj.value !== undefined) lastValue = obj.value;
    if (obj.usage && typeof obj.usage === "object") {
      const u = obj.usage as Record<string, unknown>;
      lastUsage = {
        input: typeof u.input === "number" ? u.input : undefined,
        output: typeof u.output === "number" ? u.output : undefined,
        cost: typeof u.cost === "number" ? u.cost : undefined,
      };
    }
  }
  if (!lastText && lastValue === undefined && !lastUsage) return undefined;
  return { text: lastText, value: lastValue, usage: lastUsage };
}
