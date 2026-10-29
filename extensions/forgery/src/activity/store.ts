import { randomUUID } from "node:crypto";
import type {
  ForgeryActivityEventInput,
  ForgeryActivityItemInput,
  ForgeryAgentRecord,
  ForgeryCall,
  ForgeryPhase,
  ForgeryPhaseInput,
  ForgeryRun,
  ForgeryRunDisplay,
  ForgerySnapshot,
  ForgeryActivityMetrics,
} from "./types";

/** Bounded collection sizes so a long session cannot grow the store unboundedly. */
const MAX_RUNS = 24;
const MAX_CALLS_PER_RUN = 500;
const MAX_ITEMS_PER_RUN = 500;
const MAX_EVENTS_PER_RUN = 200;

const now = () => Date.now();
const genId = () => randomUUID();

/**
 * In-memory, revision-subscribable activity store.
 *
 * Pure: no host, no fs, no timers. Subscribers are notified synchronously
 * after every mutation via a monotonically-increasing revision counter.
 * The UI controller debounces these to keep render cost bounded.
 *
 * Internal state is stored in `#`-prefixed fields so public method names
 * (`runs()`, `agents()`, `revision()`) never collide with the backing maps.
 */
export class ForgeryActivityStore {
  #runs: Map<string, ForgeryRun> = new Map();
  #order: string[] = [];
  #agents: Map<string, ForgeryAgentRecord> = new Map();
  #revision = 0;
  #listeners: Set<() => void> = new Set();
  #frozenView: ForgerySnapshot[] = [];
  #frozenRevision = -1;

  // ── lifecycle ──────────────────────────────────────────────────────────

  start(runId: string, display?: ForgeryRunDisplay, nameHint?: string, cwd?: string): ForgeryRun {
    const existing = this.#runs.get(runId);
    if (existing) {
      if (display?.name) existing.name = display.name;
      if (display?.description) existing.description = display.description;
      if (existing.status === "running") return existing;
      // Restart a finished run as a fresh one (same id reused by the tool).
      this.#replaceRun(runId, display, nameHint, cwd);
      return this.#runs.get(runId)!;
    }
    const run: ForgeryRun = {
      id: runId,
      name: display?.name ?? nameHint ?? "forgery",
      description: display?.description,
      status: "running",
      phases: [],
      calls: [],
      items: [],
      events: [],
      startedAt: now(),
      updatedAt: now(),
      cwd: cwd ?? "",
      metrics: { toolCalls: 0, tokens: 0, cost: 0 },
    };
    this.#runs.set(runId, run);
    this.#order.push(runId);
    this.#evictRuns();
    this.#notify();
    return run;
  }

  #replaceRun(runId: string, display: ForgeryRunDisplay | undefined, nameHint: string | undefined, cwd?: string): void {
    const t = now();
    const run: ForgeryRun = {
      id: runId,
      name: display?.name ?? nameHint ?? "forgery",
      description: display?.description,
      status: "running",
      phases: [],
      calls: [],
      items: [],
      events: [],
      startedAt: t,
      updatedAt: t,
      cwd: cwd ?? "",
      metrics: { toolCalls: 0, tokens: 0, cost: 0 },
    };
    this.#runs.set(runId, run);
  }

  finish(runId: string, success: boolean, error?: string): void {
    const run = this.#runs.get(runId);
    if (!run || run.status !== "running") return;
    const t = now();
    run.status = success ? "completed" : "failed";
    run.finishedAt = t;
    run.updatedAt = t;
    if (error) run.error = error;
    for (const phase of run.phases) {
      if (phase.status === "running" || phase.status === "pending") {
        phase.status = success ? "completed" : "stopped";
        phase.finishedAt = t;
        phase.updatedAt = t;
      }
    }
    for (const call of run.calls) {
      if (call.status === "running" || call.status === "pending") {
        call.status = success ? "completed" : "stopped";
        call.finishedAt = t;
        call.updatedAt = t;
      }
    }
    this.#notify();
  }

  cancel(runId: string): void {
    this.finish(runId, false, "cancelled");
  }

  // ── phases ─────────────────────────────────────────────────────────────

  phase(runId: string, input: ForgeryPhaseInput): ForgeryPhase {
    const run = this.#runs.get(runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    let phase = run.phases.find((p) => p.id === input.id) as ForgeryPhase | undefined;
    if (!phase && input.id) {
      phase = run.phases.find((p) => p.name === input.name);
    }
    const t = now();
    if (!phase) {
      phase = {
        id: input.id ?? genId(),
        name: input.name,
        description: input.description,
        status: "running",
        total: input.total,
        startedAt: t,
        updatedAt: t,
      };
      run.phases.push(phase);
    } else {
      phase.status = "running";
      phase.updatedAt = t;
      if (input.total !== undefined) phase.total = input.total;
      if (input.description !== undefined) phase.description = input.description;
    }
    // Auto-complete the previous running phase.
    for (const p of run.phases) {
      if (p !== phase && p.status === "running") {
        p.status = "completed";
        p.finishedAt = t;
        p.updatedAt = t;
      }
    }
    run.currentPhaseId = phase.id;
    run.updatedAt = t;
    this.#notify();
    return phase;
  }

  // ── calls ──────────────────────────────────────────────────────────────

  beginCall(runId: string, callId: string, ref: string, args?: Record<string, unknown>): ForgeryCall {
    const run = this.#runs.get(runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    const t = now();
    const call: ForgeryCall = {
      id: callId,
      ref,
      label: labelForCall(ref, args),
      kind: kindForRef(ref),
      status: "running",
      phaseId: run.currentPhaseId,
      args,
      startedAt: t,
      updatedAt: t,
    };
    run.calls.push(call);
    if (run.calls.length > MAX_CALLS_PER_RUN) run.calls.splice(0, run.calls.length - MAX_CALLS_PER_RUN);
    run.updatedAt = t;
    this.#notify();
    return call;
  }

  updateCall(
    runId: string,
    callId: string,
    update:
      | { type: "progress"; value: string }
      | { type: "entity"; entityId: string; entityKind: ForgeryCall["kind"] }
      | { type: "metrics"; metrics: ForgeryCall["metrics"] }
      | { type: "preview"; preview: string }
      | { type: "detail"; detail: string },
  ): void {
    const run = this.#runs.get(runId);
    const call = run?.calls.find((c) => c.id === callId);
    if (!call || !run) return;
    switch (update.type) {
      case "progress":
        call.progress = update.value;
        break;
      case "entity":
        call.progress = update.entityId;
        break;
      case "metrics":
        call.metrics = update.metrics;
        break;
      case "preview":
        call.preview = update.preview;
        break;
      case "detail":
        call.detail = update.detail;
        break;
    }
    call.updatedAt = now();
    run.updatedAt = call.updatedAt;
    this.#notify();
  }

  finishCall(
    runId: string,
    callId: string,
    result: {
      success: boolean;
      result?: unknown;
      preview?: string;
      error?: string;
      metrics?: ForgeryCall["metrics"];
    },
  ): void {
    const run = this.#runs.get(runId);
    const call = run?.calls.find((c) => c.id === callId);
    if (!call || !run) return;
    const t = now();
    call.status = result.success ? "completed" : "failed";
    call.finishedAt = t;
    call.updatedAt = t;
    if (result.result !== undefined) call.result = result.result;
    if (result.preview !== undefined) call.preview = result.preview;
    if (result.error !== undefined) call.error = result.error;
    if (result.metrics !== undefined) {
      call.metrics = result.metrics;
      // Accumulate metrics into the run's totals.
      if (!run.metrics) {
        run.metrics = { toolCalls: 0, tokens: 0, cost: 0 };
      }
      // At this point, run.metrics is definitely defined
      const metrics = run.metrics as Required<ForgeryActivityMetrics>;
      metrics.toolCalls += result.metrics.toolCalls ?? 0;
      metrics.tokens += result.metrics.tokens ?? 0;
      metrics.cost += result.metrics.cost ?? 0;
    }
    if (call.detail === undefined && result.preview !== undefined) {
      call.detail = result.preview;
    }
    run.updatedAt = t;
    this.#notify();
  }

  // ── items / events ─────────────────────────────────────────────────────

  item(runId: string, input: ForgeryActivityItemInput): void {
    const run = this.#runs.get(runId);
    if (!run) return;
    const t = now();
    let item = run.items.find((i) => i.id === input.id);
    if (!item) {
      item = {
        id: input.id,
        label: input.label,
        status: input.status ?? "running",
        kind: input.kind ?? "custom",
        phaseId: input.phase,
        detail: input.detail,
        current: input.current,
        total: input.total,
        completed: input.completed,
        data: input.data,
        createdAt: t,
        updatedAt: t,
      };
      run.items.push(item);
      if (run.items.length > MAX_ITEMS_PER_RUN) run.items.splice(0, run.items.length - MAX_ITEMS_PER_RUN);
    } else {
      Object.assign(item, {
        label: input.label,
        status: input.status ?? item.status,
        detail: input.detail ?? item.detail,
        current: input.current ?? item.current,
        total: input.total ?? item.total,
        completed: input.completed ?? item.completed,
        data: input.data ?? item.data,
        updatedAt: t,
      });
    }
    run.updatedAt = t;
    this.#notify();
  }

  event(runId: string, input: ForgeryActivityEventInput): void {
    const run = this.#runs.get(runId);
    if (!run) return;
    const t = now();
    run.events.push({ id: genId(), message: input.message, level: input.level ?? "info", data: input.data, createdAt: t });
    if (run.events.length > MAX_EVENTS_PER_RUN) run.events.splice(0, run.events.length - MAX_EVENTS_PER_RUN);
    run.updatedAt = t;
    this.#notify();
  }

  // ── agents (one-shot, observed from the runner) ────────────────────────

  addAgent(agent: ForgeryAgentRecord): void {
    // Own a copy: the runner mutates its records in place, so sharing the
    // reference would hide changes from the store's change detection.
    this.#agents.set(agent.id, { ...agent });
    this.#notify();
  }

  updateAgent(agentId: string, patch: Partial<ForgeryAgentRecord>): void {
    const agent = this.#agents.get(agentId);
    if (!agent) return;
    // The UI re-syncs agents on every refresh. A no-op write must stay
    // silent, or the notify would re-trigger the refresh forever.
    let changed = false;
    for (const key of Object.keys(patch) as (keyof ForgeryAgentRecord)[]) {
      if (key === "updatedAt") continue;
      if (!Object.is(agent[key], patch[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    Object.assign(agent, patch, { updatedAt: now() });
    this.#notify();
  }

  // ── reads / snapshots ──────────────────────────────────────────────────

  runs(): ForgeryRun[] {
    return [...this.#order]
      .reverse()
      .map((rid) => this.#runs.get(rid))
      .filter((r): r is ForgeryRun => r !== undefined);
  }

  activeRunId(): string | undefined {
    for (const rid of [...this.#order].reverse()) {
      const run = this.#runs.get(rid);
      if (run?.status === "running") return rid;
    }
    return undefined;
  }

  get(runId: string): ForgeryRun | undefined {
    return this.#runs.get(runId);
  }

  agent(agentId: string): ForgeryAgentRecord | undefined {
    return this.#agents.get(agentId);
  }

  agents(): ForgeryAgentRecord[] {
    return [...this.#agents.values()].reverse();
  }

  revision(): number {
    return this.#revision;
  }

  /**
   * Frozen projection of the activity surface. Reused until the store
   * mutates (checked by revision), so high-frequency UI polling does not
   * repeatedly deep-copy large call payloads. The clock stays live: elapsed
   * time readouts must advance even when the store has not mutated.
   */
  createSnapshot(): ForgerySnapshot {
    if (this.#frozenRevision === this.#revision && this.#frozenView.length > 0) {
      this.#frozenView[0].now = now();
      return this.#frozenView[0];
    }
    const snapshot: ForgerySnapshot = {
      now: now(),
      runs: this.runs().map((r) => structuredClone(r)),
      agents: this.agents().map((a) => ({ ...a })),
      activeRunId: this.activeRunId(),
    };
    this.#frozenView = [snapshot];
    this.#frozenRevision = this.#revision;
    return snapshot;
  }

  /** Returns the current snapshot plus a totals block over active runs. */
  snapshot(): ForgerySnapshot {
    const base = this.createSnapshot();
    const active = base.runs.filter((r) => r.status === "running");
    if (active.length > 0) {
      let tokens = 0;
      let cost = 0;
      let calls = 0;
      let startedAt: number | undefined;
      for (const r of active) {
        for (const c of r.calls) {
          calls += 1;
          if (c.metrics?.tokens) tokens += c.metrics.tokens;
          if (c.metrics?.cost) cost += c.metrics.cost;
        }
        if (startedAt === undefined || r.startedAt < startedAt) startedAt = r.startedAt;
      }
      base.activeTotals = { tokens, cost, calls, startedAt };
    } else {
      base.activeTotals = { calls: 0 };
    }
    return base;
  }

  // ── subscription ───────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  reset(): void {
    this.#runs.clear();
    this.#order = [];
    this.#agents.clear();
    this.#frozenView = [];
    this.#frozenRevision = -1;
    this.#notify();
  }

  #notify(): void {
    this.#revision += 1;
    for (const l of this.#listeners) l();
  }

  #evictRuns(): void {
    while (this.#order.length > MAX_RUNS) {
      const oldest = this.#order.shift();
      if (oldest !== undefined) this.#runs.delete(oldest);
    }
  }
}

/** Map a call ref to an activity kind. */
export function kindForRef(ref: string): ForgeryCall["kind"] {
  if (ref.startsWith("agents.")) return "agent";
  if (ref.startsWith("extensions.")) return "extension";
  return "tool";
}

/** `ref · headline-arg` — one-line call label. */
export function labelForCall(ref: string, args?: Record<string, unknown>): string {
  let headline = "";
  if (args) {
    if (typeof args.command === "string") headline = args.command;
    else if (typeof args.path === "string") headline = args.path;
    else if (typeof args.pattern === "string") headline = args.pattern;
    else if (typeof args.task === "string") headline = args.task;
    else if (typeof args.code === "string") headline = args.code.slice(0, 48);
    else if (typeof args.text === "string") headline = args.text;
    if (headline.length > 48) headline = `${headline.slice(0, 48)}…`;
  }
  return headline ? `${ref} ${headline}` : ref;
}

/** Default export so the module can be imported either way. */
export default ForgeryActivityStore;
