/**
 * pi-forgery — activity data model.
 *
 * The activity store is the single source of truth for everything the
 * footer, widget, and dashboard render. Keeping the model flat and frozen
 * means the UI layers are dumb presenters: they read a snapshot, never
 * mutate it.
 */

/** Lifecycle status of a run (a single forgery_exec program). */
export type ForgeryRunStatus = "running" | "completed" | "failed" | "cancelled";

/** Status of a phase, call, or item inside a run. */
export type ForgeryActivityStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "stopped";

/** Where a call was dispatched to. */
export type ForgeryActivityKind =
  | "tool"
  | "agent"
  | "extension"
  | "custom";

export interface ForgeryRunDisplay {
  name?: string;
  description?: string;
}

export interface ForgeryPhaseInput {
  name: string;
  id?: string;
  description?: string;
  /** Optional total expected iterations for progress "i/total". */
  total?: number;
}

export interface ForgeryActivityItemInput {
  id: string;
  label: string;
  status?: ForgeryActivityStatus;
  phase?: string;
  detail?: string;
  kind?: ForgeryActivityKind;
  current?: string;
  total?: number;
  completed?: number;
  data?: unknown;
}

export interface ForgeryActivityEventInput {
  message: string;
  level?: "info" | "success" | "warning" | "error";
  data?: unknown;
}

export interface ForgeryActivityMetrics {
  tokens: number;
  toolCalls: number;
  cost: number;
}

export interface ForgeryPhase {
  id: string;
  name: string;
  description?: string;
  status: ForgeryActivityStatus;
  total?: number;
  current?: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface ForgeryCall {
  id: string;
  /** Stable reference key, e.g. "pi.read", "agents.run". */
  ref: string;
  label: string;
  kind: ForgeryActivityKind;
  status: ForgeryActivityStatus;
  phaseId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  preview?: string;
  progress?: string;
  error?: string;
  detail?: string;
  metrics?: ForgeryActivityMetrics;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface ForgeryItem {
  id: string;
  label: string;
  status: ForgeryActivityStatus;
  kind: ForgeryActivityKind;
  phaseId?: string;
  detail?: string;
  current?: string;
  total?: number;
  completed?: number;
  data?: unknown;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface ForgeryEvent {
  id: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  data?: unknown;
  createdAt: number;
}

export interface ForgeryRun {
  id: string;
  name: string;
  description?: string;
  status: ForgeryRunStatus;
  phases: ForgeryPhase[];
  calls: ForgeryCall[];
  items: ForgeryItem[];
  events: ForgeryEvent[];
  currentPhaseId?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
  /** Working directory of the run. */
  cwd: string;
  /** Accumulated metrics for this run. */
  metrics?: ForgeryActivityMetrics;
}

/** A one-shot agent run observed in the activity store. */
export interface ForgeryAgentRecord {
  id: string;
  name: string;
  task: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "stopped"
    | "timed_out"
    | "unavailable";
  /** Short headline of the agent's current tool or terminal result. */
  current?: string;
  turns?: number;
  toolCalls?: number;
  usage?: { input?: number; output?: number; cost?: number };
  text?: string;
  value?: unknown;
  error?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
}

/** Frozen, read-only view of the whole activity surface. */
export interface ForgerySnapshot {
  now: number;
  /** Most-recent run first. */
  runs: ForgeryRun[];
  agents: ForgeryAgentRecord[];
  /** The run id that is currently running, or undefined. */
  activeRunId?: string;
  /** Aggregate across active runs: tokens, cost, duration. */
  activeTotals?: {
    tokens?: number;
    cost?: number;
    calls: number;
    startedAt?: number;
  };
}
