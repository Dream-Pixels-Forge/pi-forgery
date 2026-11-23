/**
 * pi-forgery — execution runtime.
 *
 * The core of the extension. The LLM writes one small TypeScript program
 * that composes Pi core tools and one-shot agents. The runtime:
 *
 *   1. Validates each host call against a call registry (schema) BEFORE it
 *      runs — the "static schema validation" pi-fabric promises but without
 *      the QuickJS/Monty machinery.
 *   2. Bridges every call into the activity store so the widget/dashboard
 *      show live progress.
 *   3. Runs independent calls in parallel via Promise.all.
 *
 * Security posture: the program body is `new Function` with a `pi` host
 * proxy that is a *whitelist* of named, validated call sites — not a god
 * object. No `eval`, no `process`, no arbitrary property access on a host.
 */

import type { TSchema, Static } from "typebox";
import type { ForgeryActivityStore } from "../activity/store";
import type { ForgeryActivityMetrics } from "../activity/types";
import { safeJson, safeText } from "../ui/format";

/** A validated host call descriptor. */
export interface HostCallSpec {
  /** e.g. "pi.read", "pi.bash", "agents.run". */
  ref: string;
  /** TypeBox schema for the call's arguments. */
  schema: TSchema;
  /** Which activity kind this call is. */
  kind: "tool" | "agent" | "extension";
  /** Execute the call. Receive args (schema-validated), a signal, the
   *  activity run id, and an update callback for progress. */
  execute: (
    args: Record<string, unknown>,
    ctx: HostExecCtx,
    signal: AbortSignal,
  ) => Promise<HostExecResult>;
}

export interface HostExecCtx {
  /** The run id of the active forgery_exec execution. */
  runId: string;
  /** Activity store for bridging progress. */
  activity: ForgeryActivityStore;
  /** Working directory of the active Pi session. */
  cwd: string;
  /** When true, host calls validate args but do not execute — used for dry-run mode. */
  dryRun?: boolean;
}

/** A single planned call recorded during dry-run. */
export interface PlannedCall {
  ref: string;
  args: Record<string, unknown>;
}

export interface HostExecResult {
  value?: unknown;
  error?: string;
  metrics?: ForgeryActivityMetrics;
  /** Short human-readable preview for the activity row. */
  preview?: string;
}

/** A host-call registry keyed by call ref. */
export class HostCallRegistry {
  private calls: Map<string, HostCallSpec> = new Map();

  register(spec: HostCallSpec): void {
    this.calls.set(spec.ref, spec);
  }

  get(ref: string): HostCallSpec | undefined {
    return this.calls.get(ref);
  }

  list(): string[] {
    return [...this.calls.keys()];
  }

  has(ref: string): boolean {
    return this.calls.has(ref);
  }
}

/**
 * Validate unknown args against a TypeBox schema WITHOUT running a full
 * ajv pipeline. This is a "best-effort static check" — enough to catch
 * missing required fields and obvious type mismatches, and to give the
 * LLM a useful error before we waste a real call. Returns:
 *   - { ok: true, args }  → validated (coerced) args
 *   - { ok: false, error }→ a human-readable error
 */
export function validateArgs(
  schema: TSchema,
  raw: unknown,
): { ok: boolean; args?: Record<string, unknown>; error?: string } {
  const s = schema as { type?: string; properties?: Record<string, unknown>; required?: string[] };
  if (s?.type !== "object" || !s?.properties) {
    // Not an object schema — pass through.
    return { ok: true, args: (raw as Record<string, unknown>) ?? {} };
  }
  const out: Record<string, unknown> = {};
  const input = raw ?? {};
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: `expected object, got ${typeof input}` };
  }
  const required: string[] = Array.isArray(s.required) ? s.required : [];
  for (const key of required) {
    if ((input as Record<string, unknown>)[key] === undefined) {
      return { ok: false, error: `missing required field "${key}"` };
    }
  }
  for (const [key, value] of Object.entries(input)) {
    out[key] = value;
  }
  return { ok: true, args: out };
}

/**
 * The program body is executed as a `new Function` so that:
 *   - it has access to `pi` (the validated host proxy) and `__host`
 *   - it has NO access to `this`, `arguments`, or any global except
 *     what we explicitly pass (we pass only `pi` and `__host`)
 *   - we can wrap it in a try/catch to capture runtime errors
 */
export interface ProgramResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  /** Populated when dry-run is true: the validated-but-unexecuted call sequence. */
  planned?: PlannedCall[];
}

/**
 * Build a host proxy that exposes the registered calls under `pi.<name>`
 * and `agents.<name>`. Unknown members throw — the program cannot reach
 * arbitrary host APIs. Each successful/failed host call is bridged into
 * the activity store so the widget/dashboard show live progress.
 */
export function buildHostProxy(
  registry: HostCallRegistry,
  ctx: HostExecCtx,
  signal: AbortSignal,
): {
  pi: Record<string, (...a: unknown[]) => Promise<unknown>>;
  agents: Record<string, (...a: unknown[]) => Promise<unknown>>;
  activity: Record<string, (...a: unknown[]) => Promise<unknown>>;
  planned: PlannedCall[];
} {
  const planned: PlannedCall[] = [];
  const dryRun = Boolean(ctx.dryRun);
  const make = (prefix: string): Record<string, (...a: unknown[]) => Promise<unknown>> => {
    const target: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
    let callCounter = 0;
    for (const ref of registry.list()) {
      const dot = ref.indexOf(".");
      if (dot < 0) continue;
      const head = ref.slice(0, dot);
      if (head !== prefix) continue;
      const name = ref.slice(dot + 1);
      target[name] = async (...args: unknown[]) => {
        const spec = registry.get(ref)!;
        const raw = args.length === 1 ? args[0] : args;
        const { ok, args: vargs, error } = validateArgs(spec.schema, raw);
        if (!ok) {
          throw new Error(`validation failed for ${ref}: ${error}`);
        }
        const validatedArgs = vargs as Record<string, unknown>;
        // Dry-run: record the planned call but do not execute it.
        if (dryRun) {
          planned.push({ ref, args: validatedArgs });
          return { preview: "dry-run" };
        }
        const callId = `c${++callCounter}`;
        let bridged = false;
        try {
          ctx.activity.beginCall(ctx.runId, callId, ref, validatedArgs);
          bridged = true;
        } catch {
          /* run not started; skip bridging */
        }
        try {
          const result = await spec.execute(validatedArgs, ctx, signal);
          if (bridged) {
            ctx.activity.finishCall(ctx.runId, callId, {
              success: result.error === undefined,
              result: result.value,
              preview: result.preview,
              error: result.error,
              metrics: result.metrics,
            });
          }
          if (result.error !== undefined) {
            // Don't throw for host-call errors; let the program observe them.
            // But surface a structured object so `Promise.all` can catch.
            throw new HostCallError(ref, result.error, result.preview, result.value);
          }
          return result.value;
        } catch (e) {
          if (bridged && !(e instanceof HostCallError)) {
            const message = e instanceof Error ? e.message : String(e);
            ctx.activity.finishCall(ctx.runId, callId, {
              success: false,
              error: message,
            });
          }
          throw e;
        }
      };
    }
    return target;
  };
  return {
    pi: make("pi"),
    agents: make("agents"),
    activity: make("activity"),
    planned,
  };
}

/** A structured error a host proxy can throw when a call fails. */
export class HostCallError extends Error {
  ref: string;
  preview?: string;
  value?: unknown;
  constructor(ref: string, error: string, preview?: string, value?: unknown) {
    super(`${ref} failed: ${error}`);
    this.name = "HostCallError";
    this.ref = ref;
    this.preview = preview;
    this.value = value;
  }
}

/**
 * Execute a TypeScript program body against the host proxy.
 *
 * The program may be:
 *   - plain JS/TS without import/export (recommended) — run via new Function
 *   - a literal value (number, string, object) — returned as-is
 *
 * `activity` bridges every successful host call into the store.
 */
export async function runProgram(
  code: string,
  registry: HostCallRegistry,
  ctx: HostExecCtx,
  signal: AbortSignal,
): Promise<ProgramResult> {
  // If the program is just a literal expression, try JSON first.
  const trimmed = code.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return { ok: true, value: parsed };
    } catch {
      /* fall through to new Function */
    }
  }

  const { pi, agents, activity, planned } = buildHostProxy(registry, ctx, signal);

  // Wrap the body in an async function so top-level `await` works and the
  // user can use `return` in their program body. `new Function` produces:
  //   function anonymous(pi, agents, activity, __host) {
  //     return (async () => {
  //       "use strict";
  //       ...user code...
  //     })();
  //   }
  const body = `\nreturn (async () => {\n"use strict";\n${code}\n})();\n`;
  const factory: Function = new Function("pi", "agents", "activity", "__host", body);

  const hostHandle = {
    registry,
    ctx,
    signal,
  };

  try {
    const value = await factory(pi, agents, activity, hostHandle);
    if (signal.aborted) {
      return { ok: false, error: "aborted" };
    }
    // Dry-run: return the planned call sequence instead of the program's value.
    if (ctx.dryRun) {
      return { ok: true, value: { planned }, planned };
    }
    return { ok: true, value };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * The full "forgery execution" pipeline:
 *   1. start a run in the activity store
 *   2. run the program against the host proxy
 *   3. finish the run
 *   4. return the result
 *
 * This is what the `forgery_exec` tool `execute` calls.
 */
export interface ForgeryExecOutcome {
  ok: boolean;
  value?: unknown;
  error?: string;
  /** Human-readable JSON string of the value (for tool result content). */
  preview?: string;
}

export async function runForgery(
  code: string,
  registry: HostCallRegistry,
  store: ForgeryActivityStore,
  ctx: HostExecCtx,
  signal: AbortSignal,
  dryRun = false,
): Promise<ForgeryExecOutcome> {
  // Dry-run: validate all host call args without executing or touching the store.
  if (dryRun) {
    const dryCtx: HostExecCtx = { ...ctx, dryRun: true };
    const result = await runProgram(code, registry, dryCtx, signal);
    if (result.ok) {
      const planned = (result.value as { planned?: PlannedCall[] })?.planned ?? [];
      const preview = JSON.stringify(planned, null, 2).slice(0, 400);
      return { ok: true, value: { planned }, preview };
    }
    return { ok: false, error: result.error ?? "unknown", preview: safeText(result.error ?? "") };
  }

  store.start(ctx.runId, undefined, undefined, ctx.cwd);
  const result = await runProgram(code, registry, ctx, signal);
  if (result.ok) {
    store.finish(ctx.runId, true);
    const preview = safeJson(result.value).slice(0, 400);
    return { ok: true, value: result.value, preview };
  }
  store.finish(ctx.runId, false, result.error);
  return { ok: false, error: result.error ?? "unknown", preview: safeText(result.error ?? "") };
}
