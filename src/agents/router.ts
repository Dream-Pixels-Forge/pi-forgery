/**
 * pi-forgery — Agent Model Routing Intelligence.
 *
 * Recommends the cheapest model that historically completes this kind of
 * task, based on per-model outcome history stored in the activity store.
 *
 * Advisory only: returns a recommendation; the caller still passes `model`
 * to `agents.run`.
 */

import { CostManager } from "./cost-manager";
import { ForgeryActivityStore } from "../activity/store";

export type TaskClass =
  | "planning"
  | "code-gen"
  | "review"
  | "summarization"
  | "research"
  | "debug"
  | "general";

export interface RouteResult {
  model: string;
  reason: string;
  expectedCost: number;
  historicalPassRate: number;
}

/** Simple keyword-based task classifier. Zero dependencies. */
export function classifyTask(task: string): TaskClass {
  const t = task.toLowerCase();

  if (/\b(plan|architecture|architect|design|strategy|roadmap|structure|organize)\b/.test(t))
    return "planning";
  if (/\b(code|implement|write|function|class|component|refactor|build|create|make|develop|program|script)\b/.test(t))
    return "code-gen";
  if (/\b(review|audit|check|verify|qa|lint|critique|assess|evaluate|analyze)\b/.test(t))
    return "review";
  if (/\b(summar|summarize|summary|explain|describe|overview|recap|brief)\b/.test(t))
    return "summarization";
  if (/\b(research|find|investigate|search|lookup|discover|explore|gather)\b/.test(t))
    return "research";
  if (/\b(debug|fix|error|bug|fail|broken|issue|problem|resolve|troubleshoot)\b/.test(t))
    return "debug";

  return "general";
}

/**
 * ModelRouter recommends models based on historical outcomes.
 *
 * On cold start (no history for a model+class), the model is assumed to
 * have a 0.5 pass rate so it's not unfairly excluded.
 */
export class ModelRouter {
  private store: ForgeryActivityStore;
  private costManager: CostManager;
  private defaultModel: string;

  constructor(store: ForgeryActivityStore, costManager: CostManager, defaultModel = "claude-sonnet-4") {
    this.store = store;
    this.costManager = costManager;
    this.defaultModel = defaultModel;
  }

  /**
   * Route a task to the cheapest model with sufficient historical pass rate.
   *
   * @param task - Natural language task description.
   * @param candidates - Optional list of model ids to choose from.
   *   Defaults to [defaultModel] if omitted/empty.
   * @param minPassRate - Minimum historical pass rate (0-1) to consider a model.
   *   Defaults to 0.6.
   */
  route(task: string, candidates?: string[], minPassRate = 0.6): RouteResult {
    const taskClass = classifyTask(task);
    const cands = candidates && candidates.length > 0 ? candidates : [this.defaultModel];

    // Pair each candidate with its outcome stats
    const paired = cands.map((m) => ({
      model: m,
      outcome: this.store.agentOutcomeFor(m, taskClass),
    }));

    // Viable = has history AND meets min pass rate
    const viable = paired.filter((p) => {
      if (p.outcome.totalRuns === 0) return false;
      return p.outcome.completed / p.outcome.totalRuns >= minPassRate;
    });

    const pool = viable.length > 0 ? viable : paired;

    // Compute expectedCost + passRate for each in pool
    const withCost = pool.map((p) => {
      let expectedCost: number;
      if (p.outcome.totalRuns > 0) {
        expectedCost = p.outcome.avgCostPerRun;
      } else {
        // Cold start: estimate using cost manager
        const est = this.costManager.estimateCost(p.model, task, "general");
        expectedCost = est.estimatedCost;
      }
      const passRate = p.outcome.totalRuns > 0
        ? p.outcome.completed / p.outcome.totalRuns
        : 0.5; // assume 50% on cold start
      return { ...p, expectedCost, passRate };
    });

    // Sort by expected cost ascending, pick cheapest
    withCost.sort((a, b) => a.expectedCost - b.expectedCost);
    const best = withCost[0];

    let reason: string;
    if (viable.length === 0 && paired.some((p) => p.outcome.totalRuns > 0)) {
      reason = `No candidate met ${(minPassRate * 100).toFixed(0)}% pass rate for ${taskClass}; chose cheapest ${best.model}`;
    } else if (paired.every((p) => p.outcome.totalRuns === 0)) {
      reason = `Cold start for ${taskClass}; chose cheapest candidate ${best.model}`;
    } else {
      reason = `${taskClass}: ${best.model} has ${(best.passRate * 100).toFixed(0)}% pass rate, cheapest among viable candidates`;
    }

    return {
      model: best.model,
      reason,
      expectedCost: best.expectedCost,
      historicalPassRate: best.passRate,
    };
  }
}

export default ModelRouter;
