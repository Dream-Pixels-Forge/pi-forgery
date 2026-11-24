/**
 * pi-forgery — Cost Management System
 *
 * Tracks, budgets, estimates, and optimizes LLM token costs across all agents.
 * Integrates with enhanced runner, dev loop, and activity store.
 */

import { ForgeryActivityStore } from "../activity/store";
import type { ForgeryAgentRecord } from "../activity/types";

export interface ModelPricing {
  inputPer1k: number;   // USD per 1K input tokens
  outputPer1k: number;  // USD per 1K output tokens
  cacheReadPer1k?: number;  // For cached input (e.g., Anthropic)
  cacheWritePer1k?: number; // For writing to cache
}

export interface ModelPricingMap {
  [modelId: string]: ModelPricing;
}

export const DEFAULT_MODEL_PRICING: ModelPricingMap = {
  // Anthropic Claude
  "claude-opus-4": { inputPer1k: 0.015, outputPer1k: 0.075, cacheReadPer1k: 0.0015, cacheWritePer1k: 0.01875 },
  "claude-sonnet-4": { inputPer1k: 0.003, outputPer1k: 0.015, cacheReadPer1k: 0.0003, cacheWritePer1k: 0.00375 },
  "claude-3.5-sonnet": { inputPer1k: 0.003, outputPer1k: 0.015, cacheReadPer1k: 0.0003, cacheWritePer1k: 0.00375 },
  "claude-3.5-haiku": { inputPer1k: 0.001, outputPer1k: 0.005, cacheReadPer1k: 0.0001, cacheWritePer1k: 0.00125 },
  "claude-3-opus": { inputPer1k: 0.015, outputPer1k: 0.075 },
  "claude-3-sonnet": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-haiku": { inputPer1k: 0.00025, outputPer1k: 0.00125 },

  // OpenAI (with context caching pricing)
  "gpt-4o": { inputPer1k: 0.0025, outputPer1k: 0.01, cacheReadPer1k: 0.00125, cacheWritePer1k: 0.0025 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006, cacheReadPer1k: 0.000075, cacheWritePer1k: 0.00015 },
  "gpt-4-turbo": { inputPer1k: 0.01, outputPer1k: 0.03 },
  "gpt-4": { inputPer1k: 0.03, outputPer1k: 0.06 },
  "gpt-3.5-turbo": { inputPer1k: 0.0005, outputPer1k: 0.0015 },

  // Google (with context caching pricing)
  "gemini-1.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005, cacheReadPer1k: 0.0003125, cacheWritePer1k: 0.00125 },
  "gemini-1.5-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003, cacheReadPer1k: 0.00001875, cacheWritePer1k: 0.000075 },
  "gemini-2.0-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003, cacheReadPer1k: 0.00001875, cacheWritePer1k: 0.000075 },

  // Default fallback
  "default": { inputPer1k: 0.002, outputPer1k: 0.008 },
};

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  totalCost: number;
  model: string;
}

export interface AgentCostRecord {
  agentId: string;
  agentName: string;
  template?: string;
  model: string;
  breakdown: CostBreakdown;
  timestamp: number;
  runId?: string;
  phase?: string;
}

export interface RunCostSummary {
  runId: string;
  startTime: number;
  endTime?: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  agentCosts: AgentCostRecord[];
  budget?: CostBudget;
  budgetStatus?: "within" | "warning" | "exceeded";
}

export interface CostBudget {
  maxCostPerRun?: number;
  maxCostPerAgent?: number;
  maxCostPerPhase?: number;
  maxTokensPerRun?: number;
  maxTokensPerAgent?: number;
  warningThreshold?: number; // 0-1, e.g., 0.8 = warn at 80%
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  confidence: "low" | "medium" | "high";
  assumptions: string[];
}

export interface CostOptimizationRecommendation {
  type: "model_switch" | "prompt_optimization" | "caching" | "batching" | "template_change";
  description: string;
  estimatedSavings: number;
  effort: "low" | "medium" | "high";
  priority: number;
}

/**
 * Cost Manager — Central cost tracking and budgeting
 */
export class CostManager {
  private pricing: ModelPricingMap;
  private runCosts: Map<string, RunCostSummary> = new Map();
  private agentCosts: AgentCostRecord[] = [];
  private budgets: Map<string, CostBudget> = new Map();
  private budgetAbortHandlers: Map<string, () => void> = new Map();
  private activity?: ForgeryActivityStore;

  constructor(pricing?: ModelPricingMap, activity?: ForgeryActivityStore) {
    this.pricing = { ...DEFAULT_MODEL_PRICING, ...pricing };
    this.activity = activity;
  }

  setActivityStore(activity: ForgeryActivityStore): void {
    this.activity = activity;
  }

  setModelPricing(model: string, pricing: ModelPricing): void {
    this.pricing[model] = pricing;
  }

  getModelPricing(model: string): ModelPricing {
    // Try exact match, then prefix match, then default
    if (this.pricing[model]) return this.pricing[model];
    for (const [key, value] of Object.entries(this.pricing)) {
      if (model.startsWith(key) || key.startsWith(model)) {
        return value;
      }
    }
    return this.pricing.default;
  }

  /**
   * Calculate cost from token usage
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens = 0,
    cacheWriteTokens = 0,
    reportedTotalCost?: number,
  ): CostBreakdown {
    const pricing = this.getModelPricing(model);
    
    const inputCost = (inputTokens / 1000) * pricing.inputPer1k;
    const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
    const cacheReadCost = cacheReadTokens > 0 && pricing.cacheReadPer1k
      ? (cacheReadTokens / 1000) * pricing.cacheReadPer1k
      : 0;
    const cacheWriteCost = cacheWriteTokens > 0 && pricing.cacheWritePer1k
      ? (cacheWriteTokens / 1000) * pricing.cacheWritePer1k
      : 0;

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheReadTokens || undefined,
      cacheWriteTokens: cacheWriteTokens || undefined,
      inputCost,
      outputCost,
      cacheReadCost: cacheReadCost || undefined,
      cacheWriteCost: cacheWriteCost || undefined,
      // Provider totals are authoritative; per-token components are estimates.
      totalCost: reportedTotalCost ?? inputCost + outputCost + cacheReadCost + cacheWriteCost,
      model,
    };
  }

  /**
   * Record agent cost
   */
  recordAgentCost(record: Omit<AgentCostRecord, "timestamp">): AgentCostRecord {
    const fullRecord: AgentCostRecord = {
      ...record,
      timestamp: Date.now(),
    };
    this.agentCosts.push(fullRecord);

    // Add to run summary
    if (record.runId) {
      let run = this.runCosts.get(record.runId);
      if (!run) {
        run = {
          runId: record.runId,
          startTime: fullRecord.timestamp,
          totalCost: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          agentCosts: [],
        };
        this.runCosts.set(record.runId, run);
      }
      run.agentCosts.push(fullRecord);
      run.totalCost += fullRecord.breakdown.totalCost;
      run.totalInputTokens += fullRecord.breakdown.inputTokens;
      run.totalOutputTokens += fullRecord.breakdown.outputTokens;
      run.endTime = fullRecord.timestamp;

      // Apply budget if set for this run
      if (!run.budget && this.budgets.has(record.runId)) {
        run.budget = this.budgets.get(record.runId);
      }
      // Check budget
      if (run.budget) {
        run.budgetStatus = this.checkBudget(run);
      }
    }

    // Update activity store metrics
    if (this.activity && record.runId) {
      const run = this.activity.get(record.runId);
      if (run) {
        if (!run.metrics) run.metrics = { toolCalls: 0, tokens: 0, cost: 0 };
        run.metrics.tokens += record.breakdown.inputTokens + record.breakdown.outputTokens;
        run.metrics.cost += record.breakdown.totalCost;
        run.metrics.toolCalls += 1;
      }
    }

    if (record.runId && this.runCosts.get(record.runId)?.budgetStatus === "exceeded") {
      this.budgetAbortHandlers.get(record.runId)?.();
    }

    return fullRecord;
  }

  /** Register an abort callback for the current run's hard limit. */
  onBudgetExceeded(runId: string, handler: () => void): () => void {
    this.budgetAbortHandlers.set(runId, handler);
    return () => {
      if (this.budgetAbortHandlers.get(runId) === handler) {
        this.budgetAbortHandlers.delete(runId);
      }
    };
  }

  /**
   * Check budget status
   */
  checkBudget(run: RunCostSummary): "within" | "warning" | "exceeded" {
    const budget = run.budget;
    if (!budget) return "within";

    if (budget.maxCostPerRun && run.totalCost >= budget.maxCostPerRun) {
      return "exceeded";
    }
    if (budget.maxCostPerRun && budget.warningThreshold && 
        run.totalCost >= budget.maxCostPerRun * budget.warningThreshold) {
      return "warning";
    }
    return "within";
  }

  /**
   * Budget status for a run: { pctUsed, overSoft, overHard }.
   * overSoft = at or above warning threshold (default 80%).
   * overHard = at or above maxCostPerRun (100%).
   */
  budgetStatus(runId: string): {
    pctUsed: number;
    overSoft: boolean;
    overHard: boolean;
  } {
    const run = this.runCosts.get(runId);
    const budget = run?.budget;
    if (!budget || !budget.maxCostPerRun) {
      return { pctUsed: 0, overSoft: false, overHard: false };
    }
    const pctUsed = budget.maxCostPerRun > 0
      ? (run.totalCost / budget.maxCostPerRun) * 100
      : 0;
    const warningThreshold = budget.warningThreshold ?? 0.8;
    return {
      pctUsed,
      overSoft: pctUsed >= warningThreshold * 100,
      overHard: pctUsed >= 100,
    };
  }

  /**
   * Set budget for a run
   */
  setBudget(runId: string, budget: CostBudget): void {
    const run = this.runCosts.get(runId);
    if (run) {
      run.budget = budget;
      run.budgetStatus = this.checkBudget(run);
    }
    this.budgets.set(runId, budget);
    if (this.runCosts.get(runId)?.budgetStatus === "exceeded") {
      this.budgetAbortHandlers.get(runId)?.();
    }
  }

  /**
   * Get run cost summary
   */
  getRunCost(runId: string): RunCostSummary | undefined {
    return this.runCosts.get(runId);
  }

  /**
   * Get all agent costs for a run
   */
  getAgentCosts(runId: string): AgentCostRecord[] {
    const run = this.runCosts.get(runId);
    return run?.agentCosts || [];
  }

  /**
   * Estimate cost for a task before running
   */
  estimateCost(
    model: string,
    taskDescription: string,
    template?: string,
    contextTokens = 0
  ): CostEstimate {
    const pricing = this.getModelPricing(model);
    
    // Base estimates by template (rough heuristics)
    const templateMultipliers: Record<string, { input: number; output: number }> = {
      coder: { input: 8000, output: 4000 },
      researcher: { input: 5000, output: 3000 },
      reviewer: { input: 6000, output: 2000 },
      planner: { input: 4000, output: 3000 },
      tester: { input: 5000, output: 4000 },
      documenter: { input: 3000, output: 2500 },
      debugger: { input: 7000, output: 3000 },
      architect: { input: 5000, output: 2500 },
      security: { input: 8000, output: 3000 },
      design: { input: 4000, output: 3000 },
      git: { input: 3000, output: 2000 },
      sniper: { input: 2000, output: 1500 },
      teammate: { input: 15000, output: 8000 }, // 10 parallel analysts
      general: { input: 2000, output: 1500 },
    };

    const base = templateMultipliers[template || "general"] || templateMultipliers.general;
    const estimatedInputTokens = Math.round(base.input + contextTokens);
    const estimatedOutputTokens = Math.round(base.output);
    const estimatedCost = (estimatedInputTokens / 1000) * pricing.inputPer1k + 
                          (estimatedOutputTokens / 1000) * pricing.outputPer1k;

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCost,
      confidence: contextTokens > 0 ? "high" : "medium",
      assumptions: [
        `Template: ${template || "general"}`,
        `Model: ${model}`,
        `Context tokens: ${contextTokens}`,
        "Based on historical averages; actual may vary 2-3x",
      ],
    };
  }

  /**
   * Generate optimization recommendations
   */
  getOptimizationRecommendations(runId: string): CostOptimizationRecommendation[] {
    const run = this.runCosts.get(runId);
    if (!run) return [];

    const recommendations: CostOptimizationRecommendation[] = [];
    const agentCosts = run.agentCosts;

    // 1. Model switching
    const expensiveAgents = agentCosts
      .filter(a => a.breakdown.totalCost > 0.10)
      .sort((a, b) => b.breakdown.totalCost - a.breakdown.totalCost);

    for (const agent of expensiveAgents.slice(0, 3)) {
      const currentPricing = this.getModelPricing(agent.model);
      const cheaperModels = Object.entries(this.pricing)
        .filter(([, p]) => p.inputPer1k < currentPricing.inputPer1k * 0.5)
        .map(([m]) => m);

      if (cheaperModels.length > 0) {
        recommendations.push({
          type: "model_switch",
          description: `Switch ${agent.template} agent from ${agent.model} to ${cheaperModels[0]} (${((1 - this.pricing[cheaperModels[0]].inputPer1k / currentPricing.inputPer1k) * 100).toFixed(0)}% cheaper input)`,
          estimatedSavings: agent.breakdown.totalCost * 0.5,
          effort: "low",
          priority: 1,
        });
      }
    }

    // 2. Caching recommendations
    const highInputAgents = agentCosts.filter(a => a.breakdown.inputTokens > 50000);
    if (highInputAgents.length > 0) {
      recommendations.push({
        type: "caching",
        description: `${highInputAgents.length} agents have high input tokens. Enable prompt caching (Anthropic) or context caching (OpenAI) for 50-90% input cost reduction`,
        estimatedSavings: highInputAgents.reduce((sum, a) => sum + a.breakdown.inputCost * 0.5, 0),
        effort: "low",
        priority: 2,
      });
    }

    // 3. Template optimization
    const teammateAgents = agentCosts.filter(a => a.template === "teammate");
    if (teammateAgents.length > 0) {
      recommendations.push({
        type: "template_change",
        description: "Teammate agent runs 10 parallel analysts. Consider running only needed domains or using researcher for focused analysis",
        estimatedSavings: teammateAgents[0].breakdown.totalCost * 0.6,
        effort: "medium",
        priority: 3,
      });
    }

    // 4. Batching
    const manySmallAgents = agentCosts.filter(a => a.breakdown.outputTokens < 500);
    if (manySmallAgents.length > 5) {
      recommendations.push({
        type: "batching",
        description: `${manySmallAgents.length} agents with small outputs. Batch into fewer, larger calls`,
        estimatedSavings: manySmallAgents.reduce((sum, a) => sum + a.breakdown.totalCost * 0.3, 0),
        effort: "medium",
        priority: 4,
      });
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get total costs across all runs
   */
  getTotalCosts(): { totalCost: number; totalTokens: number; runCount: number; agentCount: number } {
    let totalCost = 0;
    let totalTokens = 0;
    for (const run of this.runCosts.values()) {
      totalCost += run.totalCost;
      totalTokens += run.totalInputTokens + run.totalOutputTokens;
    }
    return {
      totalCost,
      totalTokens,
      runCount: this.runCosts.size,
      agentCount: this.agentCosts.length,
    };
  }

  /**
   * Export cost report
   */
  exportReport(runId?: string): string {
    if (runId) {
      const run = this.runCosts.get(runId);
      if (!run) return `Run ${runId} not found`;
      return this.formatRunReport(run);
    }
    return this.formatGlobalReport();
  }

  private formatRunReport(run: RunCostSummary): string {
    const lines = [
      `=== COST REPORT: ${run.runId.slice(0, 8)} ===`,
      `Status: ${run.budgetStatus || "no budget"}`,
      `Total Cost: $${run.totalCost.toFixed(4)}`,
      `Total Tokens: ${run.totalInputTokens + run.totalOutputTokens} (in: ${run.totalInputTokens}, out: ${run.totalOutputTokens})`,
      `Agents: ${run.agentCosts.length}`,
      "",
      "AGENT BREAKDOWN:",
    ];

    for (const agent of run.agentCosts) {
      const b = agent.breakdown;
      lines.push(
        `  ${agent.template || agent.agentName}: $${b.totalCost.toFixed(4)} | ${b.inputTokens}→${b.outputTokens} tokens | ${agent.model}`
      );
    }

    if (run.budget) {
      lines.push("", "BUDGET:");
      if (run.budget.maxCostPerRun) {
        const pct = (run.totalCost / run.budget.maxCostPerRun * 100).toFixed(1);
        lines.push(`  Max: $${run.budget.maxCostPerRun} | Used: ${pct}% | Status: ${run.budgetStatus}`);
      }
    }

    const recommendations = this.getOptimizationRecommendations(run.runId);
    if (recommendations.length > 0) {
      lines.push("", "OPTIMIZATIONS:");
      for (const rec of recommendations) {
        lines.push(`  [${rec.priority}] ${rec.type}: ${rec.description} (save ~$${rec.estimatedSavings.toFixed(4)})`);
      }
    }

    return lines.join("\n");
  }

  private formatGlobalReport(): string {
    const totals = this.getTotalCosts();
    const lines = [
      "=== GLOBAL COST REPORT ===",
      `Total Runs: ${totals.runCount}`,
      `Total Agents: ${totals.agentCount}`,
      `Total Cost: $${totals.totalCost.toFixed(4)}`,
      `Total Tokens: ${totals.totalTokens}`,
      "",
      "PER-RUN SUMMARY:",
    ];

    for (const run of this.runCosts.values()) {
      lines.push(
        `  ${run.runId.slice(0, 8)}: $${run.totalCost.toFixed(4)} | ${run.agentCosts.length} agents | ${run.budgetStatus || "no budget"}`
      );
    }

    return lines.join("\n");
  }
}

/**
 * Create cost manager with default pricing
 */
export function createCostManager(activity?: ForgeryActivityStore): CostManager {
  return new CostManager(undefined, activity);
}

/**
 * Budget enforcement middleware for enhanced runner
 */
export function withBudgetEnforcement(
  costManager: CostManager,
  runId: string,
  budget: CostBudget
) {
  costManager.setBudget(runId, budget);
  
  // Ensure run exists for budget tracking
  const existingRun = costManager.getRunCost(runId);
  if (!existingRun) {
    // Create a minimal run entry
    costManager.recordAgentCost({
      agentId: 'budget-init',
      agentName: 'budget-initialization',
      template: 'general',
      model: 'default',
      breakdown: { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, totalCost: 0, model: 'default' },
      runId,
      phase: 'init',
    });
  }
  
  return {
    checkBeforeRun: (estimatedCost: number) => {
      const run = costManager.getRunCost(runId);
      if (!run) return { allowed: true };
      
      const projected = run.totalCost + estimatedCost;
      if (budget.maxCostPerRun && projected > budget.maxCostPerRun) {
        return { 
          allowed: false, 
          reason: `Projected cost $${projected.toFixed(4)} exceeds budget $${budget.maxCostPerRun}` 
        };
      }
      if (budget.maxCostPerRun && budget.warningThreshold && 
          projected > budget.maxCostPerRun * budget.warningThreshold) {
        return { 
          allowed: true, 
          warning: `Projected cost $${projected.toFixed(4)} exceeds ${budget.warningThreshold * 100}% of budget` 
        };
      }
      return { allowed: true };
    },
    checkAfterAgent: (agentCost: AgentCostRecord) => {
      const run = costManager.getRunCost(runId);
      if (!run) return { allowed: true };
      return { 
        allowed: run.budgetStatus !== "exceeded",
        budgetStatus: run.budgetStatus,
      };
    },
  };
}