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
  ForgerySubgoal,
  ForgerySubgoalInput,
} from "./types";

/** Bounded collection sizes so a long session cannot grow the store unboundedly. */
const MAX_RUNS = 24;
const MAX_CALLS_PER_RUN = 500;
const MAX_ITEMS_PER_RUN = 500;
const MAX_EVENTS_PER_RUN = 200;
const MAX_SUBGOALS_PER_RUN = 200;

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
  #subgoals: Map<string, ForgerySubgoal> = new Map();
  #subgoalOrder: string[] = [];
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
      subgoals: [],
      startedAt: now(),
      updatedAt: now(),
      cwd: cwd ?? "",
      compacts: 0,
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
      subgoals: [],
      startedAt: t,
      updatedAt: t,
      cwd: cwd ?? "",
      compacts: 0,
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

  // ── subgoals ───────────────────────────────────────────────────────────

  /**
   * Create or update a subgoal.
   *
   * Deduped by `(goalId, name)`: calling with the same goal and name returns
   * the existing subgoal with its mutable fields patched, rather than creating
   * a duplicate. This is intentional for idempotency but means two subgoals
   * under the same goal cannot share a name. `shortcut: name-based dedup`,
   * `when to upgrade: switch to id-only create if distinct same-named subgoals
   * are needed`.
   */
  subgoal(input: ForgerySubgoalInput): ForgerySubgoal {
    const run = this.#runs.get(input.goalId);
    if (!run) throw new Error(`unknown goal/run ${input.goalId}`);
    const t = now();

    // Look up an existing subgoal by name within this goal.
    let existing: ForgerySubgoal | undefined;
    for (const sid of this.#subgoalOrder) {
      const s = this.#subgoals.get(sid);
      if (s && s.goalId === input.goalId && s.name === input.name) {
        existing = s;
        break;
      }
    }

    if (!existing) {
      const subgoal: ForgerySubgoal = {
        id: randomUUID(),
        goalId: input.goalId,
        parentSubgoalId: input.parentSubgoalId,
        name: input.name,
        description: input.description,
        acceptanceCriteria: input.acceptanceCriteria,
        status: input.status ?? "pending",
        current: input.current,
        total: input.total,
        completed: input.completed,
        output: input.output,
        error: input.error,
        usage: input.usage,
        startedAt: input.status === "running" ? t : undefined,
        updatedAt: t,
      };
      this.#subgoals.set(subgoal.id, subgoal);
      this.#subgoalOrder.push(subgoal.id);
      run.subgoals.push(subgoal);
      if (run.subgoals.length > MAX_SUBGOALS_PER_RUN) {
        run.subgoals.splice(0, run.subgoals.length - MAX_SUBGOALS_PER_RUN);
      }
      run.updatedAt = t;
      this.#notify();
      return subgoal;
    }

    // Patch mutable fields on the existing subgoal.
    if (input.status !== undefined) existing.status = input.status;
    if (input.current !== undefined) existing.current = input.current;
    if (input.total !== undefined) existing.total = input.total;
    if (input.completed !== undefined) existing.completed = input.completed;
    if (input.output !== undefined) existing.output = input.output;
    if (input.error !== undefined) existing.error = input.error;
    if (input.usage !== undefined) existing.usage = input.usage;
    if (input.description !== undefined) existing.description = input.description;
    if (input.acceptanceCriteria !== undefined)
      existing.acceptanceCriteria = input.acceptanceCriteria;
    if (input.status === "running" && !existing.startedAt)
      existing.startedAt = t;
    existing.updatedAt = t;
    run.updatedAt = t;
    this.#notify();
    return existing;
  }

  /** Update a subgoal by id. Returns the subgoal or undefined if not found. */
  updateSubgoal(
    subgoalId: string,
    patch: Partial<
      Pick<
        ForgerySubgoal,
        | "status"
        | "current"
        | "total"
        | "completed"
        | "output"
        | "error"
        | "usage"
        | "description"
        | "acceptanceCriteria"
      >
    >,
  ): ForgerySubgoal | undefined {
    const subgoal = this.#subgoals.get(subgoalId);
    if (!subgoal) return undefined;
    const t = now();
    if (patch.status !== undefined) subgoal.status = patch.status;
    if (patch.current !== undefined) subgoal.current = patch.current;
    if (patch.total !== undefined) subgoal.total = patch.total;
    if (patch.completed !== undefined) subgoal.completed = patch.completed;
    if (patch.output !== undefined) subgoal.output = patch.output;
    if (patch.error !== undefined) subgoal.error = patch.error;
    if (patch.usage !== undefined) subgoal.usage = patch.usage;
    if (patch.description !== undefined) subgoal.description = patch.description;
    if (patch.acceptanceCriteria !== undefined)
      subgoal.acceptanceCriteria = patch.acceptanceCriteria;
    if (patch.status === "running" && !subgoal.startedAt)
      subgoal.startedAt = t;
    subgoal.updatedAt = t;
    const run = this.#runs.get(subgoal.goalId);
    if (run) run.updatedAt = t;
    this.#notify();
    return subgoal;
  }

  /** Mark a subgoal completed or failed. Returns the subgoal or undefined. */
  finishSubgoal(
    subgoalId: string,
    success: boolean,
    error?: string,
  ): ForgerySubgoal | undefined {
    const subgoal = this.#subgoals.get(subgoalId);
    if (!subgoal) return undefined;
    const t = now();
    subgoal.status = success ? "completed" : "failed";
    subgoal.finishedAt = t;
    subgoal.updatedAt = t;
    if (error) subgoal.error = error;
    const run = this.#runs.get(subgoal.goalId);
    if (run) {
      run.updatedAt = t;
      // Cascade: if all subgoals are terminal, consider the run's phase state.
      const allTerminal = run.subgoals.every(
        (s) => s.status === "completed" || s.status === "failed" || s.status === "blocked",
      );
      if (allTerminal && run.subgoals.length > 0) {
        // no-op marker — run-level completion is owned by finish()
      }
    }
    this.#notify();
    return subgoal;
  }

  /** Read a subgoal by id. */
  subgoalById(subgoalId: string): ForgerySubgoal | undefined {
    return this.#subgoals.get(subgoalId);
  }

  /** Read all subgoals for a goal/run, most-recent-first. */
  subgoalsForGoal(goalId: string): ForgerySubgoal[] {
    return this.#subgoalOrder
      .reverse()
      .map((sid) => this.#subgoals.get(sid))
      .filter((s): s is ForgerySubgoal => s !== undefined && s.goalId === goalId);
  }

  /** Record a compact (context reset) on the run. Returns the new compact count. */
  compact(runId: string): number {
    const run = this.#runs.get(runId);
    if (!run) return 0;
    run.compacts += 1;
    run.updatedAt = now();
    this.#notify();
    return run.compacts;
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

  /** Returns the current snapshot plus totals blocks over active runs. */
  snapshot(): ForgerySnapshot {
    const base = this.createSnapshot();
    const active = base.runs.filter((r) => r.status === "running");
    if (active.length > 0) {
      let tokens = 0;
      let cost = 0;
      let calls = 0;
      let startedAt: number | undefined;
      let subgoalCompleted = 0;
      let subgoalTotal = 0;
      for (const r of active) {
        for (const c of r.calls) {
          calls += 1;
          if (c.metrics?.tokens) tokens += c.metrics.tokens;
          if (c.metrics?.cost) cost += c.metrics.cost;
        }
        for (const s of r.subgoals) {
          subgoalTotal += 1;
          if (s.status === "completed") subgoalCompleted += 1;
        }
        if (startedAt === undefined || r.startedAt < startedAt) startedAt = r.startedAt;
      }
      base.activeTotals = { tokens, cost, calls, startedAt };
      base.subgoalTotals = { completed: subgoalCompleted, total: subgoalTotal };
    } else {
      base.activeTotals = { calls: 0 };
      base.subgoalTotals = { completed: 0, total: 0 };
    }
    return base;
  }

  // ── export / import (session persistence) ──────────────────────────────

  /** Serialize the current activity snapshot to JSON. */
  exportSnapshot(): string {
    return JSON.stringify(this.snapshot(), null, 2);
  }

  /**
   * Replace the store's contents with data from a previously exported
   * snapshot. Bumps the revision so subscribers are notified.
   * Throws on malformed input — callers should catch.
   */
  importSnapshot(json: string): void {
    const snap = JSON.parse(json) as ForgerySnapshot;
    this.#runs.clear();
    this.#order = [];
    this.#agents.clear();
    this.#subgoals.clear();
    this.#subgoalOrder = [];
    this.#frozenView = [];
    this.#frozenRevision = -1;

    for (const run of snap.runs) {
      this.#runs.set(run.id, run);
      this.#order.push(run.id);
      for (const subgoal of run.subgoals) {
        this.#subgoals.set(subgoal.id, subgoal);
        this.#subgoalOrder.push(subgoal.id);
      }
    }
    for (const agent of snap.agents) {
      this.#agents.set(agent.id, agent);
    }
    this.#notify();
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
    this.#subgoals.clear();
    this.#subgoalOrder = [];
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
