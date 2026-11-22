/**
 * pi-forgery — Workflow Chain.
 *
 * Runs a sequence of pipelines (`bootstrap → implement → drift-report → resolver`
 * etc.) as a single pipeline, threading each step's consolidated artifact into
 * the next step's target. Gates between stages (proceed / pause / abort) are
 * stored in the activity store so pause/resume survives across host calls.
 *
 * Composition only: delegates to the existing `WorkflowEngine.run()` — no
 * duplicate preset or reviewer logic.
 */

import { randomUUID } from "node:crypto";
import { WorkflowEngine } from "./engine";
import type { ForgeryActivityStore } from "../activity/store";
import type { AgentRunner, AgentRunResult } from "../agents/runner";

export interface ChainStep {
  /** Pipeline id (review, brainstorm, drift-report, bootstrap). */
  pipeline: string;
  /** Target file path. Defaults to previous step's consolidated artifact. */
  target?: string;
  /** GoldfishContext reading list. */
  context?: string[];
  /** Review mode: BRAINSTORM | REVIEW (default REVIEW). */
  mode?: string;
  /** Gate after this step completes: proceed | pause | abort. */
  gate?: "proceed" | "pause" | "abort";
}

export interface ChainStepResult {
  pipeline: string;
  target: string;
  status: "completed" | "failed" | "stopped";
  artifactPath?: string;
  phases: Array<{ phaseId: string; phaseName: string; findings: number; totals: { blocker: number; major: number; nit: number } }>;
  error?: string;
}

export interface ChainResult {
  runId: string;
  status: "completed" | "failed" | "stopped" | "paused";
  steps: ChainStepResult[];
  currentStep: number;
  gate?: string;
  error?: string;
}

const GATE_ITEM_ID = "chain-gate";

/**
 * Reads the gate state for a chain run from the activity store.
 * Returns undefined if no gate has been set (defaults to proceed).
 */
function readGate(store: ForgeryActivityStore, runId: string): "proceed" | "pause" | "abort" | undefined {
  const run = store.get(runId);
  if (!run) return undefined;
  const item = run.items.find((i) => i.id === GATE_ITEM_ID);
  if (!item) return undefined;
  return (item.data as { gate?: string })?.gate as any;
}

/** Writes the gate state for a chain run to the activity store. */
function writeGate(store: ForgeryActivityStore, runId: string, gate: "proceed" | "pause" | "abort"): void {
  store.item(runId, {
    id: GATE_ITEM_ID,
    label: `Chain gate for ${runId.slice(0, 8)}`,
    status: "running",
    data: { gate },
  });
}

/**
 * Runs a list of pipeline steps sequentially through the workflow engine.
 * Each step's `consolidatedArtifact` is threaded into the next step's
 * `target` when the next step omits one.
 */
export class WorkflowChain {
  private engine: WorkflowEngine;
  private store: ForgeryActivityStore;

  constructor(engine: WorkflowEngine, store: ForgeryActivityStore) {
    this.engine = engine;
    this.store = store;
  }

  async run(steps: ChainStep[], chainRunId?: string): Promise<ChainResult> {
    if (steps.length === 0) {
      return {
        runId: chainRunId ?? randomUUID(),
        status: "failed",
        steps: [],
        currentStep: 0,
        error: "steps array required",
      };
    }

    const runId = chainRunId ?? randomUUID();

    // Activity run for the chain itself (surfaces in widget/footer/dashboard).
    this.store.start(runId, {
      name: `workflow chain: ${steps.length} step(s)`,
      description: `Chained pipelines: ${steps.map((s) => s.pipeline).join(" → ")}`,
    });

    // Default gate: proceed.
    writeGate(this.store, runId, "proceed");

    const stepResults: ChainStepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // ── gate check before running this step (skip for first step) ──
      if (i > 0) {
        const gate = step.gate ?? readGate(this.store, runId) ?? "proceed";
        if (gate === "abort") {
          writeGate(this.store, runId, "abort");
          this.store.finish(runId, false, "aborted by gate");
          return { runId, status: "stopped", steps: stepResults, currentStep: i, gate: "abort" };
        }
        if (gate === "pause") {
          writeGate(this.store, runId, "pause");
          this.store.finish(runId, false, "paused by gate");
          return { runId, status: "paused", steps: stepResults, currentStep: i, gate: "pause" };
        }
      }

      // ── resolve target: thread previous artifact if omitted ──
      let target = step.target;
      if (!target && i > 0 && stepResults[i - 1].artifactPath) {
        target = stepResults[i - 1].artifactPath;
      }
      if (!target) {
        const error = `step ${i}: no target specified and no prior artifact to thread`;
        this.store.finish(runId, false, error);
        return { runId, status: "failed", steps: stepResults, currentStep: i, error };
      }

      // ── run the pipeline via the engine ──
      const result = await this.engine.run(
        step.pipeline,
        target,
        step.context ?? [],
        step.mode ?? "REVIEW",
      );

      if ("error" in result) {
        const stepResult: ChainStepResult = {
          pipeline: step.pipeline,
          target,
          status: "failed",
          phases: [],
          error: result.error,
        };
        stepResults.push(stepResult);
        this.store.finish(runId, false, result.error);
        return { runId, status: "failed", steps: stepResults, currentStep: i, error: result.error };
      }

      stepResults.push({
        pipeline: step.pipeline,
        target,
        status: result.status,
        artifactPath: result.consolidatedArtifact,
        phases: result.phases.map((p) => ({
          phaseId: p.phaseId,
          phaseName: p.phaseName,
          findings: p.findings.length,
          totals: p.totals,
        })),
      });

      // Persist the step's gate declaration so workflow.gate can read/override it.
      if (step.gate) {
        writeGate(this.store, runId, step.gate);
      }
    }

    this.store.finish(runId, true);
    return { runId, status: "completed", steps: stepResults, currentStep: steps.length };
  }

  /** Override the gate state for a chain run (used by workflow.gate host call). */
  setGate(runId: string, gate: "proceed" | "pause" | "abort"): void {
    writeGate(this.store, runId, gate);
  }
}

export default WorkflowChain;
