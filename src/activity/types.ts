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
  /** Subgoals belonging to this run/goal. */
  subgoals: ForgerySubgoal[];
  currentPhaseId?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
  /** Working directory of the run. */
  cwd: string;
  /** Compacts (context resets) used so far in this run. */
  compacts: number;
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
  /** Parent agent id, if this agent was spawned by another agent (subagent). */
  parentId?: string;
  /** Run id this agent belongs to, so agents can be grouped per run. */
  runId?: string;
  /** Original run parameters, stored so the agent can be retried (SG-29). */
  cwd?: string;
  /** Original model override, if any. */
  model?: string;
  /** Original system prompt, if any. */
  systemPrompt?: string;
  /** Original soft timeout in ms, if any. */
  timeoutMs?: number;
  /** Short headline of the agent's current tool or terminal result. */
  current?: string;
  /** Recent tool call breadcrumbs: last 3-5 sub-tool actions. */
  recentCalls?: Array<{ tool: string; target?: string; status?: "running" | "done" | "failed" }>;
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

/** Lifecycle status of a subgoal within a goal/run. */
export type ForgerySubgoalStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

/** A subgoal — a decomposable unit of work inside a forgery_exec goal/run. */
export interface ForgerySubgoal {
  id: string;
  /** Parent goal/run id this subgoal belongs to. */
  goalId: string;
  /** Optional parent subgoal id for nesting. */
  parentSubgoalId?: string;
  name: string;
  description?: string;
  /** Acceptance criteria — subgoal is "done" only when all are met. */
  acceptanceCriteria?: string[];
  status: ForgerySubgoalStatus;
  /** Headline of the current tool/step being worked on. */
  current?: string;
  /** Expected number of steps/items (for progress "completed/total"). */
  total?: number;
  /** Steps/items completed so far. */
  completed?: number;
  /** Structured output produced by the subgoal (if any). */
  output?: unknown;
  error?: string;
  /** Token/cost attribution for this subgoal. */
  usage?: { input?: number; output?: number; cost?: number };
  startedAt?: number;
  updatedAt: number;
  finishedAt?: number;
}

/** Input to create or update a subgoal. */
export interface ForgerySubgoalInput {
  goalId: string;
  parentSubgoalId?: string;
  name: string;
  description?: string;
  acceptanceCriteria?: string[];
  status?: ForgerySubgoalStatus;
  current?: string;
  total?: number;
  completed?: number;
  output?: unknown;
  error?: string;
  usage?: { input?: number; output?: number; cost?: number };
}

/** Read-only view of the whole activity surface. `now` is the live clock. */
export interface ForgerySnapshot {
  now: number;
  /** Most-recent run first. */
  runs: ForgeryRun[];
  agents: ForgeryAgentRecord[];
  /** Model routing outcomes: key is `"model\0taskClass"` → stats. */
  outcomes: Record<string, { completed: number; failed: number; totalCost: number }>;
  /** The run id that is currently running, or undefined. */
  activeRunId?: string;
  /** Aggregate across active runs: tokens, cost, duration. */
  activeTotals?: {
    tokens?: number;
    cost?: number;
    calls: number;
    startedAt?: number;
  };
  /** Aggregate subgoal counts across active runs: { completed, total }. */
  subgoalTotals?: { completed: number; total: number };
}
