/**
 * pi-forgery — host call schemas.
 *
 * TypeBox schemas for every host call exposed to forgery_exec programs.
 * The runtime validates each call's arguments against the registered
 * schema BEFORE invoking it — this is the "static schema validation"
 * contract pi-fabric promised.
 *
 * The schemas intentionally mirror Pi's built-in tool inputs so the
 * LLM can author programs that read naturally.
 */

import { Type } from "typebox";

// ── Pi core tool schemas (subset of the real inputs; we keep only the
//    fields that make sense inside a composed program) ─────────────────

export const PiRead = Type.Object({
  path: Type.String({ description: "Absolute or cwd-relative file path." }),
});

export const PiBash = Type.Object({
  command: Type.String({ description: "Shell command to run via the host's bash tool." }),
  run_in_background: Type.Optional(Type.Boolean()),
  timeout: Type.Optional(Type.Number()),
  cwd: Type.Optional(Type.String()),
  /** Set to true to confirm the operation when guardrails require confirmation. */
  confirm: Type.Optional(Type.Boolean()),
});

export const PiEdit = Type.Object({
  path: Type.String(),
  old_string: Type.String(),
  new_string: Type.String(),
  replace_all: Type.Optional(Type.Boolean()),
  /** Set to true to confirm the operation when guardrails require confirmation. */
  confirm: Type.Optional(Type.Boolean()),
});

export const PiWrite = Type.Object({
  path: Type.String(),
  content: Type.String(),
  /** Set to true to confirm the operation when guardrails require confirmation. */
  confirm: Type.Optional(Type.Boolean()),
});

export const PiFind = Type.Object({
  pattern: Type.String(),
  path: Type.Optional(Type.String()),
});

export const PiGrep = Type.Object({
  pattern: Type.String(),
  path: Type.Optional(Type.String()),
});

export const PiLs = Type.Object({
  path: Type.Optional(Type.String()),
});

export const PiExec = Type.Object({
  command: Type.String({ description: "Full shell command line." }),
  args: Type.Optional(Type.Array(Type.String())),
});

// ── Terminal image display (Kitty graphics protocol) ─────────────────────

export const PiShowImage = Type.Object({
  path: Type.String({ description: "Image file path (cwd-relative or absolute)." }),
  maxWidthCells: Type.Optional(
    Type.Number({ description: "Maximum width in terminal cells." }),
  ),
  maxHeightCells: Type.Optional(
    Type.Number({ description: "Maximum height in terminal cells." }),
  ),
});

export const PiShowImages = Type.Object({
  paths: Type.Array(
    Type.String({ description: "Image file path (cwd-relative or absolute)." }),
    { description: "Image files to display, in order." },
  ),
  maxWidthCells: Type.Optional(
    Type.Number({ description: "Maximum width in terminal cells." }),
  ),
  maxHeightCells: Type.Optional(
    Type.Number({ description: "Maximum height in terminal cells." }),
  ),
});

// ── Terminal video display (Kitty graphics protocol via ffmpeg) ─────────

export const PiShowVideo = Type.Object({
  path: Type.String({ description: "Video file path (cwd-relative or absolute)." }),
  maxWidthCells: Type.Optional(
    Type.Number({ description: "Maximum width in terminal cells." }),
  ),
  maxHeightCells: Type.Optional(
    Type.Number({ description: "Maximum height in terminal cells." }),
  ),
});

// ── One-shot agent run ──────────────────────────────────────────────────

export const AgentsRun = Type.Object({
  task: Type.String({
    description:
      "The natural-language task the one-shot agent should accomplish. This is the entire prompt; the agent runs a fresh Pi session in a subprocess.",
  }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent subprocess. Defaults to the host cwd." })),
  model: Type.Optional(Type.String({ description: "Optional model id for the agent subprocess. Defaults to the host model." })),
  timeoutMs: Type.Optional(Type.Number({ description: "Soft timeout in milliseconds. Defaults to 10 minutes." })),
  systemPrompt: Type.Optional(Type.String({ description: "Additional system prompt for the agent session." })),
});

export const AgentsList = Type.Object({});

// ── Enhanced one-shot agent run (with templates, validation, self-correction) ─────

export const AgentsRunEnhanced = Type.Object({
  task: Type.String({
    description: "The natural-language task the enhanced agent should accomplish.",
  }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent subprocess." })),
  model: Type.Optional(Type.String({ description: "Optional model id for the agent subprocess." })),
  timeoutMs: Type.Optional(Type.Number({ description: "Soft timeout in milliseconds." })),
  systemPrompt: Type.Optional(Type.String({ description: "Additional system prompt for the agent session." })),
  name: Type.Optional(Type.String({ description: "Agent name for display." })),
  
  // Enhancements
  template: Type.Optional(Type.String({
    description: "Agent specialization template.",
    enum: ["coder", "researcher", "reviewer", "planner", "tester", "documenter", "debugger", "architect", "general"],
  })),
  outputSchema: Type.Optional(Type.Object({
    type: Type.Literal("object"),
    properties: Type.Record(Type.String(), Type.Object({
      type: Type.String(),
      description: Type.Optional(Type.String()),
      enum: Type.Optional(Type.Array(Type.String())),
    })),
    required: Type.Optional(Type.Array(Type.String())),
    additionalProperties: Type.Optional(Type.Boolean()),
  }, { description: "JSON schema for structured output validation." })),
  maxRetries: Type.Optional(Type.Number({ description: "Self-correction retries on validation failure. Default: 2.", minimum: 0, maximum: 5 })),
  qualityGates: Type.Optional(Type.Array(Type.String(), { description: "Names of built-in quality gates to enable: nonEmpty, noHallucination, specificity" })),
  injectContext: Type.Optional(Type.Boolean({ description: "Inject parent run context. Default: true." })),
  allowedTools: Type.Optional(Type.Array(Type.String(), { description: "Tools the agent can call. Default: template defaults." })),
  budget: Type.Optional(Type.Object({
    maxTokens: Type.Optional(Type.Number()),
    maxCost: Type.Optional(Type.Number()),
  }, { description: "Per-agent token/cost budget." })),
  parentRunId: Type.Optional(Type.String({ description: "Parent forgery_exec run id for context injection." })),
});

export const AgentsStop = Type.Object({
  id: Type.String({ description: "Agent id returned by agents.run." }),
});

// ── Agent model routing ─────────────────────────────────────────────────

export const AgentsRouteSchema = Type.Object({
  task: Type.String({ description: "The natural-language task to route to a model." }),
  candidates: Type.Optional(
    Type.Array(Type.String(), { description: "Model ids to choose from. Defaults to the router's default model." })
  ),
  minPassRate: Type.Optional(
    Type.Number({ description: "Minimum historical pass rate 0-1 (default 0.6).", minimum: 0, maximum: 1 })
  ),
});

export const AgentsRouteResultSchema = Type.Object({
  model: Type.String(),
  reason: Type.String(),
  expectedCost: Type.Number(),
  historicalPassRate: Type.Number(),
});

export const AgentsRunEnhancedResult = Type.Object({
  id: Type.String(),
  status: Type.String({ enum: ["completed", "failed", "stopped", "timed_out", "unavailable"] }),
  text: Type.String(),
  value: Type.Optional(Type.Unknown()),
  error: Type.Optional(Type.String()),
  usage: Type.Optional(Type.Object({
    input: Type.Optional(Type.Number()),
    output: Type.Optional(Type.Number()),
    cost: Type.Optional(Type.Number()),
  })),
  startedAt: Type.Number(),
  finishedAt: Type.Number(),
  attempts: Type.Number(),
  validationErrors: Type.Optional(Type.Array(Type.String())),
  qualityGateFailures: Type.Optional(Type.Array(Type.String())),
  structuredOutput: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

// ── Workflow (EGM-style Goldfish review) host calls ─────────────────────

export const WorkflowRun = Type.Object({
  pipeline: Type.String({
    description:
      "Pipeline id to run (bundled: 'review'). Use workflow.pipelines to list.",
  }),
  target: Type.String({
    description:
      "Absolute or cwd-relative path of the document to review.",
  }),
  context: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "GoldfishContext reading list: files the reviewers may rely on as defined knowledge.",
    }),
  ),
  mode: Type.Optional(
    Type.String({
      description:
        "Review mode: BRAINSTORM | REVIEW (default REVIEW).",
    }),
  ),
});

export const WorkflowStatus = Type.Object({
  runId: Type.Optional(
    Type.String({
      description:
        "Workflow run id. Omitted returns the active/recent workflow runs.",
    }),
  ),
});

export const WorkflowStop = Type.Object({
  runId: Type.String({
    description:
      "Workflow run id to stop (no new agents/phases; tracked agents are killed).",
  }),
});

// ── Workflow resolve (EGM review-loop resolver) host call ─────────────────

export const WorkflowResolve = Type.Object({
  runId: Type.String({
    description: "Workflow run id to resolve findings for (drift-report run).",
  }),
  findings: Type.Array(
    Type.Object({
      severity: Type.String({ description: "blocker | major | nit" }),
      line: Type.Optional(
        Type.Number({ description: "1-based line in the target document" }),
      ),
      issue: Type.String({ description: "Short statement of the issue" }),
      rationale: Type.String({
        description: "Why it matters / how to fix",
      }),
      decision: Type.String({
        description: 'propose-fix | contest',
      }),
    }),
    { description: "Findings with resolution decisions" },
  ),
});

// ── Production Development Loop (research-plan-test-code-review-learn) ──────

export const DevLoopRun = Type.Object({
  task: Type.String({ description: "The development task to execute through the full loop." }),
  maxLoopIterations: Type.Optional(Type.Number({ description: "Maximum full loop iterations (default: 3).", minimum: 1, maximum: 10 })),
  maxPhaseRetries: Type.Optional(Type.Number({ description: "Max retries per phase (default: 2).", minimum: 0, maximum: 5 })),
  enableLearning: Type.Optional(Type.Boolean({ description: "Enable learning/improvement phase (default: true)." })),
  qualityThreshold: Type.Optional(Type.Number({ description: "Quality threshold to stop early 0-1 (default: 0.8).", minimum: 0, maximum: 1 })),
  phaseOrder: Type.Optional(Type.Array(Type.String({ enum: ["researcher", "planner", "tester", "coder", "reviewer", "security", "design", "git", "sniper", "teammate", "debugger", "architect"] }), { description: "Custom phase order." })),
  globalContext: Type.Optional(Type.String({ description: "Additional context for all phases." })),
  budget: Type.Optional(Type.Object({
    maxTokens: Type.Optional(Type.Number()),
    maxCost: Type.Optional(Type.Number()),
    maxTimeMs: Type.Optional(Type.Number()),
  }, { description: "Budget for entire loop." })),
});

export const DevLoopPhaseResultSchema = Type.Object({
  phase: Type.String(),
  result: Type.Object({
    id: Type.String(),
    status: Type.String(),
    text: Type.String(),
    attempts: Type.Number(),
    structuredOutput: Type.Optional(Type.Unknown()),
  }),
  passed: Type.Boolean(),
  feedback: Type.Optional(Type.String()),
  metrics: Type.Object({
    durationMs: Type.Number(),
    attempts: Type.Number(),
    tokensUsed: Type.Number(),
  }),
});

export const DevLoopResultSchema = Type.Object({
  success: Type.Boolean(),
  iterations: Type.Number(),
  phases: Type.Array(DevLoopPhaseResultSchema),
  finalOutput: Type.Optional(Type.Object({
    id: Type.String(),
    status: Type.String(),
    text: Type.String(),
    structuredOutput: Type.Optional(Type.Unknown()),
  })),
  learningSummary: Type.Optional(Type.String()),
  totalMetrics: Type.Object({
    durationMs: Type.Number(),
    totalTokens: Type.Number(),
    totalCost: Type.Number(),
    phasesCompleted: Type.Number(),
  }),
  artifacts: Type.Object({
    research: Type.Optional(Type.Unknown()),
    plan: Type.Optional(Type.Unknown()),
    tests: Type.Optional(Type.Unknown()),
    code: Type.Optional(Type.Unknown()),
    review: Type.Optional(Type.Unknown()),
    learning: Type.Optional(Type.Unknown()),
  }),
});

// ── Subgoals ───────────────────────────────────────────────────────────────

export const SubgoalsCreateSchema = Type.Object({
  goalId: Type.String({ description: "Parent forgery_exec run/goal id." }),
  parentSubgoalId: Type.Optional(Type.String({ description: "Optional parent subgoal id for nesting." })),
  name: Type.String({ description: "Subgoal name." }),
  description: Type.Optional(Type.String({ description: "Subgoal description." })),
  acceptanceCriteria: Type.Optional(
    Type.Array(Type.String(), { description: "Acceptance criteria — all must be met for completion." }),
  ),
  status: Type.Optional(
    Type.String({ enum: ["pending", "running", "completed", "failed", "blocked"], description: "Initial status." }),
  ),
  current: Type.Optional(Type.String({ description: "Headline of current tool/step." })),
  total: Type.Optional(Type.Number({ description: "Expected number of steps/items." })),
  completed: Type.Optional(Type.Number({ description: "Steps/items completed so far." })),
});

export const SubgoalsUpdateSchema = Type.Object({
  subgoalId: Type.String({ description: "Subgoal id returned by subgoals.create." }),
  status: Type.Optional(Type.String({ enum: ["pending", "running", "completed", "failed", "blocked"] })),
  current: Type.Optional(Type.String({ description: "Headline of current tool/step." })),
  total: Type.Optional(Type.Number({ description: "Expected number of steps/items." })),
  completed: Type.Optional(Type.Number({ description: "Steps/items completed so far." })),
  output: Type.Optional(Type.Unknown({ description: "Structured output produced by the subgoal." })),
  error: Type.Optional(Type.String({ description: "Error message if failed." })),
  usage: Type.Optional(
    Type.Object({
      input: Type.Optional(Type.Number()),
      output: Type.Optional(Type.Number()),
      cost: Type.Optional(Type.Number()),
    }),
  ),
});

export const SubgoalsListSchema = Type.Object({
  goalId: Type.Optional(Type.String({ description: "Filter subgoals by goal/run id." })),
});

export const SubgoalsResultSchema = Type.Object({
  id: Type.String(),
  goalId: Type.String(),
  parentSubgoalId: Type.Optional(Type.String()),
  name: Type.String(),
  status: Type.String(),
  current: Type.Optional(Type.String()),
  total: Type.Optional(Type.Number()),
  completed: Type.Optional(Type.Number()),
  error: Type.Optional(Type.String()),
  usage: Type.Optional(
    Type.Object({
      input: Type.Optional(Type.Number()),
      output: Type.Optional(Type.Number()),
      cost: Type.Optional(Type.Number()),
    }),
  ),
  startedAt: Type.Number(),
  updatedAt: Type.Number(),
  finishedAt: Type.Optional(Type.Number()),
});

// ── Activity query host calls ──────────────────────────────────────────────

export const ActivitySnapshotSchema = Type.Object({});

export const ActivityRunsSchema = Type.Object({});

export const ActivityAgentsSchema = Type.Object({});

export const ActivitySubgoalsSchema = Type.Object({
  goalId: Type.Optional(Type.String({ description: "Filter subgoals by goal/run id." })),
});

// ── Activity distill (pattern mining) ─────────────────────────────────────

export const ActivityDistillSchema = Type.Object({
  minOccurrences: Type.Optional(
    Type.Number({ description: "Minimum runs a pattern must appear in (default 2).", minimum: 1 }),
  ),
  windowMs: Type.Optional(
    Type.Number({ description: "Only consider runs finished within this many ms (default 7 days).", minimum: 1 }),
  ),
  n: Type.Optional(
    Type.Number({ description: "Call-sequence length to mine (default 3).", minimum: 2, maximum: 10 }),
  ),
});

export const ActivityDistillResultSchema = Type.Array(
  Type.Object({
    pattern: Type.String(),
    suggestedName: Type.String(),
    occurrences: Type.Number(),
    avgCost: Type.Number(),
    avgDuration: Type.Number(),
    firstSeen: Type.Number(),
    lastSeen: Type.Number(),
  }),
);

// ── Activity export / import ──────────────────────────────────────────────

export const ActivityExportSchema = Type.Object({
  path: Type.Optional(Type.String({ description: "File path to write the snapshot JSON to. Defaults to <cwd>/.pi/forgery/activity-<runId>.json" })),
  runId: Type.Optional(Type.String({ description: "Run id to export. Defaults to the active/recent run." })),
});

export const ActivityImportSchema = Type.Object({
  path: Type.String({ description: "File path to read the snapshot JSON from." }),
  runId: Type.Optional(Type.String({ description: "Optional run id to re-assign imported runs to." })),
});

// ── Cost Management ────────────────────────────────────────────────────────

export const CostEstimateSchema = Type.Object({
  model: Type.String(),
  template: Type.Optional(Type.String()),
  taskDescription: Type.String(),
  contextTokens: Type.Optional(Type.Number()),
});

export const CostBudgetSchema = Type.Object({
  maxCostPerRun: Type.Optional(Type.Number({ description: "Maximum cost for entire run (USD)" })),
  maxCostPerAgent: Type.Optional(Type.Number({ description: "Maximum cost per agent (USD)" })),
  maxCostPerPhase: Type.Optional(Type.Number({ description: "Maximum cost per phase (USD)" })),
  maxTokensPerRun: Type.Optional(Type.Number({ description: "Maximum tokens for entire run" })),
  maxTokensPerAgent: Type.Optional(Type.Number({ description: "Maximum tokens per agent" })),
  warningThreshold: Type.Optional(Type.Number({ description: "Warning threshold 0-1 (e.g., 0.8 = 80%)", minimum: 0, maximum: 1 })),
});

export const CostRecordSchema = Type.Object({
  runId: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
});

export const CostReportSchema = Type.Object({
  runId: Type.Optional(Type.String()),
  format: Type.Optional(Type.String({ enum: ["text", "json"], description: "Output format" })),
});

export const CostOptimizationSchema = Type.Object({
  runId: Type.String(),
});

// ── Workflow chain (pipeline composition) host calls ───────────────────

export const WorkflowChainSchema = Type.Object({
  steps: Type.Array(
    Type.Object({
      pipeline: Type.String({ description: "Pipeline id (review, brainstorm, drift-report, bootstrap)." }),
      target: Type.Optional(Type.String({ description: "Target file path. Defaults to previous step's consolidated artifact." })),
      context: Type.Optional(Type.Array(Type.String(), { description: "GoldfishContext reading list." })),
      mode: Type.Optional(Type.String({ description: "Review mode: BRAINSTORM | REVIEW (default REVIEW)." })),
      gate: Type.Optional(Type.String({ enum: ["proceed", "pause", "abort"], description: "Gate after this step completes." })),
    }),
    { description: "Pipeline steps to run in sequence." },
  ),
});

export const WorkflowGateSchema = Type.Object({
  chainId: Type.String({ description: "Chain run id returned by workflow.chain." }),
  gate: Type.String({ enum: ["proceed", "pause", "abort"], description: "Gate state to set for the chain." }),
});

export const WorkflowResumeSchema = Type.Object({
  chainId: Type.String({ description: "Chain run id returned by workflow.chain." }),
});
