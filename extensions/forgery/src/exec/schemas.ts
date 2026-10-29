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

export const AgentsStop = Type.Object({
  id: Type.String({ description: "Agent id returned by agents.run." }),
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
