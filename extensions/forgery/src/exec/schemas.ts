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
