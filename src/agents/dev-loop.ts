/**
 * pi-forgery — Production-Ready Development Loop
 *
 * Orchestrates the full SDLC: RESEARCH → PLAN → TEST → CODE → REVIEW → LEARN
 * Each phase feeds the next with structured context, quality gates, and feedback.
 * Designed for one-shot, production-ready results with self-correction.
 */

import { EnhancedAgentRunner, type EnhancedAgentRunRequest, type EnhancedAgentRunResult, type AgentTemplate } from "./enhanced-runner";
import { AgentRunner } from "./runner";
import { ForgeryActivityStore } from "../activity/store";
import type { CostManager } from "./cost-manager";

export interface DevLoopConfig {
  /** Maximum iterations for the full loop (default: 3) */
  maxLoopIterations?: number;
  /** Maximum retries per phase (default: 2) */
  maxPhaseRetries?: number;
  /** Enable learning/improvement phase (default: true) */
  enableLearning?: boolean;
  /** Quality threshold to proceed (0-1, default: 0.8) */
  qualityThreshold?: number;
  /** Custom phase order (default: research → plan → test → code → review → learn) */
  phaseOrder?: AgentTemplate[];
  /** Context to pass to all phases */
  globalContext?: string;
  /** Budget for entire loop */
  budget?: { maxTokens?: number; maxCost?: number; maxTimeMs?: number };
}

export interface DevLoopPhaseResult {
  phase: AgentTemplate;
  result: EnhancedAgentRunResult;
  passed: boolean;
  feedback?: string;
  metrics: {
    durationMs: number;
    attempts: number;
    tokensUsed: number;
  };
}

export interface DevLoopResult {
  success: boolean;
  iterations: number;
  phases: DevLoopPhaseResult[];
  finalOutput?: EnhancedAgentRunResult;
  learningSummary?: string;
  totalMetrics: {
    durationMs: number;
    totalTokens: number;
    totalCost: number;
    phasesCompleted: number;
  };
  artifacts: {
    research?: EnhancedAgentRunResult;
    plan?: EnhancedAgentRunResult;
    tests?: EnhancedAgentRunResult;
    code?: EnhancedAgentRunResult;
    review?: EnhancedAgentRunResult;
    learning?: EnhancedAgentRunResult;
  };
}

/**
 * Production-Ready Development Loop Runner
 * 
 * Executes: RESEARCH → PLAN → TEST → CODE → REVIEW → LEARN
 * With feedback loops, quality gates, and continuous improvement.
 */
export class DevLoopRunner {
  private enhancedRunner: EnhancedAgentRunner;
  private baseRunner: AgentRunner;
  private activity: ForgeryActivityStore;
  private cwd: string;
  private parentRunId: string;

  constructor(
    baseRunner: AgentRunner,
    activity: ForgeryActivityStore,
    cwd: string,
    parentRunId: string,
    costManager?: CostManager,
  ) {
    this.baseRunner = baseRunner;
    this.activity = activity;
    this.cwd = cwd;
    this.parentRunId = parentRunId;
    this.enhancedRunner = new EnhancedAgentRunner(baseRunner, activity, costManager);
  }

  /**
   * Run the complete development loop for a given task.
   */
  async run(task: string, config: DevLoopConfig = {}): Promise<DevLoopResult> {
    const {
      maxLoopIterations = 3,
      maxPhaseRetries = 2,
      enableLearning = true,
      qualityThreshold = 0.8,
      phaseOrder = ["researcher", "planner", "tester", "coder", "reviewer"],
      globalContext = "",
      budget,
    } = config;

    const loopStartTime = Date.now();
    let totalTokens = 0;
    let totalCost = 0;
    let iterations = 0;
    let accumulatedContext = globalContext;
    let artifacts: DevLoopResult["artifacts"] = {};
    let allPhases: DevLoopPhaseResult[] = [];

    // Budget tracking
    const budgetCheck = () => {
      if (budget?.maxTokens && totalTokens >= budget.maxTokens) {
        throw new Error(`Token budget exceeded: ${totalTokens}/${budget.maxTokens}`);
      }
      if (budget?.maxCost && totalCost >= budget.maxCost) {
        throw new Error(`Cost budget exceeded: $${totalCost}/$${budget.maxCost}`);
      }
      if (budget?.maxTimeMs && Date.now() - loopStartTime >= budget.maxTimeMs) {
        throw new Error(`Time budget exceeded: ${Date.now() - loopStartTime}ms/${budget.maxTimeMs}ms`);
      }
    };

    // Main loop with iterations for refinement
    for (let iteration = 1; iteration <= maxLoopIterations; iteration++) {
      iterations = iteration;
      console.log(`[DevLoop] Iteration ${iteration}/${maxLoopIterations}`);

      let iterationPhases: DevLoopPhaseResult[] = [];
      let iterationFailed = false;

      // Execute each phase in order
      for (const phase of phaseOrder) {
        budgetCheck();

        const phaseStartTime = Date.now();
        let phaseResult: EnhancedAgentRunResult;
        let phasePassed = false;
        let phaseFeedback: string | undefined;
        let attempt = 0;

        // Phase-specific task construction
        let phaseTask = this.#buildPhaseTask(phase, task, accumulatedContext, artifacts, iteration);

        // Run phase with retries
        for (let retry = 0; retry <= maxPhaseRetries; retry++) {
          attempt = retry + 1;
          
          const req: EnhancedAgentRunRequest = {
            task: phaseTask,
            cwd: this.cwd,
            template: phase,
            maxRetries: 0, // We handle retries at loop level
            parentRunId: this.parentRunId,
            name: `${phase}-iter${iteration}-attempt${attempt}`,
          };

          phaseResult = await this.enhancedRunner.runEnhanced(req);
          
          // Track metrics
          if (phaseResult.usage?.output) totalTokens += phaseResult.usage.output;
          totalCost += phaseResult.usage?.cost ?? 0;
          
          // Evaluate phase quality
          const quality = this.#evaluatePhaseQuality(phase, phaseResult);
          phasePassed = quality.passed;
          phaseFeedback = quality.feedback;

          if (phasePassed || retry === maxPhaseRetries) break;

          // Build feedback for retry
          phaseTask = `PREVIOUS ATTEMPT FAILED QUALITY CHECKS.\nFEEDBACK:\n${phaseFeedback}\n\nPREVIOUS OUTPUT:\n${phaseResult.text.slice(0, 3000)}\n\nCorrect the issues and try again.`;
        }

        const durationMs = Date.now() - phaseStartTime;
        
        const phaseResultRecord: DevLoopPhaseResult = {
          phase,
          result: phaseResult!,
          passed: phasePassed,
          feedback: phaseFeedback,
          metrics: { durationMs, attempts: attempt, tokensUsed: phaseResult!.usage?.output ?? 0 },
        };
        
        iterationPhases.push(phaseResultRecord);
        allPhases.push(phaseResultRecord);

        // Store artifact
        (artifacts as Record<string, EnhancedAgentRunResult>)[phase] = phaseResult!;

        // Accumulate context for next phase
        if (phaseResult!.status === "completed" && phaseResult!.text) {
          accumulatedContext += `\n\n=== ${phase.toUpperCase()} (iter ${iteration}) ===\n${phaseResult!.text}`;
        }

        // If critical phase fails, mark iteration as failed
        if (!phasePassed && ["coder", "reviewer"].includes(phase)) {
          iterationFailed = true;
        }

        console.log(`[DevLoop] ${phase}: ${phasePassed ? "PASSED" : "FAILED"} (attempt ${attempt}, ${durationMs}ms)`);
      }

      // Run review phase separately (it reviews the code output)
      if (artifacts.code && phaseOrder.includes("reviewer")) {
        budgetCheck();
        const reviewResult = await this.#runReviewPhase(task, artifacts, accumulatedContext, iteration);
        iterationPhases.push(reviewResult);
        allPhases.push(reviewResult);
        artifacts.review = reviewResult.result;
        
        if (!reviewResult.passed) {
          iterationFailed = true;
          accumulatedContext += `\n\n=== REVIEW FEEDBACK (iter ${iteration}) ===\n${reviewResult.feedback}`;
        }
      }

      // Learning/improvement phase
      if (enableLearning && (iteration < maxLoopIterations || iterationFailed)) {
        budgetCheck();
        const learningResult = await this.#runLearningPhase(task, artifacts, allPhases, iteration);
        artifacts.learning = learningResult.result;
        accumulatedContext += `\n\n=== LEARNING (iter ${iteration}) ===\n${learningResult.result.text}`;
        console.log(`[DevLoop] Learning: ${learningResult.passed ? "PASSED" : "FAILED"}`);
      }

      // Check if we should continue iterating
      const overallQuality = this.#evaluateOverallQuality(allPhases.filter(p => 
        iterationPhases.some(ip => ip.phase === p.phase && ip.result.id === p.result.id)
      ));
      
      if (overallQuality >= qualityThreshold && !iterationFailed) {
        console.log(`[DevLoop] Quality threshold met (${overallQuality.toFixed(2)} >= ${qualityThreshold}). Stopping.`);
        break;
      }

      if (iteration === maxLoopIterations) {
        console.log(`[DevLoop] Max iterations reached.`);
      }
    }

    // Final consolidation
    const finalOutput = this.#consolidateOutput(artifacts);
    
    return {
      success: allPhases.filter(p => ["coder", "reviewer"].includes(p.phase)).every(p => p.passed),
      iterations,
      phases: allPhases,
      finalOutput,
      learningSummary: artifacts.learning?.text,
      totalMetrics: {
        durationMs: Date.now() - loopStartTime,
        totalTokens,
        totalCost,
        phasesCompleted: allPhases.filter(p => p.passed).length,
      },
      artifacts,
    };
  }

  // ============================================================================
  // Phase Task Builders
  // ============================================================================

  #buildPhaseTask(
    phase: AgentTemplate,
    originalTask: string,
    context: string,
    artifacts: DevLoopResult["artifacts"],
    iteration: number
  ): string {
    const baseContext = `ORIGINAL TASK: ${originalTask}\n\nCONTEXT SO FAR:\n${context.slice(-10000)}`;

    switch (phase) {
      case "researcher":
        return `${baseContext}\n\nPHASE: RESEARCH\nThoroughly investigate the codebase to understand:\n1. Existing patterns, conventions, and architecture\n2. Related files, types, and dependencies\n3. Constraints, edge cases, and integration points\n4. Gaps and unknowns\n\nOutput structured findings with file:line evidence.`;

      case "planner":
        return `${baseContext}\n\nPHASE: PLAN\nCreate an executable plan based on research findings:\n1. Decompose into independent, verifiable tasks\n2. Identify dependencies and critical path\n3. Estimate effort with confidence intervals\n4. Define acceptance criteria per task\n5. Identify risks and mitigation strategies\n6. Include rollback plan\n\nOutput JSON plan with phases, tasks, criteria, risks.`;

      case "tester":
        return `${baseContext}\n\nPHASE: TEST DESIGN\nDesign comprehensive test strategy BEFORE coding:\n1. Analyze requirements from plan\n2. Define test cases: happy paths, boundaries, errors, concurrency\n3. Choose test types (unit/integration/e2e) per pyramid\n4. Specify test data builders/factories needed\n5. Define coverage targets\n6. Output test file specs and commands\n\nOutput JSON with testFiles, commands, coverage targets.`;

      case "coder":
        return `${baseContext}\n\nPHASE: CODE\nImplement the solution following the plan and tests:\n1. Follow existing codebase patterns EXACTLY\n2. Write complete, production-ready code (NO placeholders)\n3. Implement to make tests pass\n4. Run type-check, lint, build after each file\n5. Handle all error cases; validate inputs\n6. Output JSON with filesChanged, summary, test/build status\n\nMUST pass: type-check, lint, build, tests.`;

      case "reviewer":
        return `${baseContext}\n\nPHASE: REVIEW\nPerform rigorous code review of the implementation:\n1. Check correctness: logic, edge cases, race conditions\n2. Check security: authz, injection, secrets, crypto, data\n3. Check performance: N+1, leaks, complexity, blocking\n4. Check maintainability: coupling, naming, testability\n5. Verify tests actually test the right behavior\n6. Output JSON with issues (file, line, severity, fix) and approved boolean\n\nSEVERITY: critical > high > medium > low > nit. Approve only if zero critical/high.`;

      default:
        return `${baseContext}\n\nPHASE: ${phase.toUpperCase()}\n${originalTask}`;
    }
  }

  // ============================================================================
  // Specialized Phase Runners
  // ============================================================================

  async #runReviewPhase(
    task: string,
    artifacts: DevLoopResult["artifacts"],
    context: string,
    iteration: number
  ): Promise<DevLoopPhaseResult> {
    const phaseStartTime = Date.now();
    
    const codeArtifact = artifacts.code;
    const testArtifact = artifacts.tests;
    
    const reviewTask = `Review the implementation for: ${task}

CODE CHANGES:
${codeArtifact?.structuredOutput ? JSON.stringify(codeArtifact.structuredOutput, null, 2) : codeArtifact?.text}

TEST SPECS:
${testArtifact?.structuredOutput ? JSON.stringify(testArtifact.structuredOutput, null, 2) : testArtifact?.text}

CONTEXT:
${context.slice(-5000)}

Perform a thorough review. Output JSON with issues and approved boolean.`;

    const result = await this.enhancedRunner.runEnhanced({
      task: reviewTask,
      cwd: this.cwd,
      template: "reviewer",
      parentRunId: this.parentRunId,
      name: `reviewer-iter${iteration}`,
      maxRetries: 1,
    });

    const quality = this.#evaluatePhaseQuality("reviewer", result);
    
    return {
      phase: "reviewer",
      result,
      passed: quality.passed,
      feedback: quality.feedback,
      metrics: {
        durationMs: Date.now() - phaseStartTime,
        attempts: result.attempts,
        tokensUsed: result.usage?.output ?? 0,
      },
    };
  }

  async #runLearningPhase(
    task: string,
    artifacts: DevLoopResult["artifacts"],
    allPhases: DevLoopPhaseResult[],
    iteration: number
  ): Promise<DevLoopPhaseResult> {
    const phaseStartTime = Date.now();
    
    const learningTask = `Analyze the development loop iteration ${iteration} for: ${task}

PHASE RESULTS:
${allPhases.map(p => `- ${p.phase}: ${p.passed ? "PASS" : "FAIL"} (${p.metrics.attempts} attempts, ${p.metrics.durationMs}ms)${p.feedback ? ` - ${p.feedback}` : ""}`).join("\n")}

ARTIFACTS SUMMARY:
${Object.entries(artifacts).map(([k, v]) => `- ${k}: ${v?.status} (${v?.attempts} attempts)`).join("\n")}

Extract:
1. What worked well (patterns to repeat)
2. What failed or was inefficient (root causes)
3. Specific improvements for next iteration
4. Reusable patterns/code snippets discovered
5. Updated mental model of the codebase

Output JSON with: improvements[], patterns[], antiPatterns[], updatedContext, confidence.`;

    const result = await this.enhancedRunner.runEnhanced({
      task: learningTask,
      cwd: this.cwd,
      template: "general",
      parentRunId: this.parentRunId,
      name: `learning-iter${iteration}`,
      outputSchema: {
        type: "object",
        properties: {
          improvements: { type: "array", items: { type: "string" } },
          patterns: { type: "array", items: { type: "string" } },
          antiPatterns: { type: "array", items: { type: "string" } },
          updatedContext: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["improvements", "patterns", "antiPatterns", "updatedContext", "confidence"],
      },
      maxRetries: 1,
    });

    return {
      phase: "general",
      result,
      passed: result.status === "completed",
      feedback: result.error,
      metrics: {
        durationMs: Date.now() - phaseStartTime,
        attempts: result.attempts,
        tokensUsed: result.usage?.output ?? 0,
      },
    };
  }

  // ============================================================================
  // Quality Evaluation
  // ============================================================================

  #evaluatePhaseQuality(phase: AgentTemplate, result: EnhancedAgentRunResult): { passed: boolean; feedback: string } {
    const feedback: string[] = [];

    // Base checks
    if (result.status !== "completed") {
      feedback.push(`Phase status: ${result.status}`);
      return { passed: false, feedback: feedback.join("; ") };
    }

    if (!result.text || result.text.trim().length < 50) {
      feedback.push("Output too short");
      return { passed: false, feedback: feedback.join("; ") };
    }

    // Phase-specific quality checks
    switch (phase) {
      case "researcher":
        if (!result.structuredOutput?.findings || !Array.isArray(result.structuredOutput.findings) || result.structuredOutput.findings.length === 0) {
          feedback.push("No findings with evidence");
        }
        if (result.text.includes("assumption") && !result.text.includes("evidence")) {
          feedback.push("Assumptions not backed by evidence");
        }
        break;

      case "planner":
        if (!result.structuredOutput?.phases || !Array.isArray(result.structuredOutput.phases) || result.structuredOutput.phases.length === 0) {
          feedback.push("No plan phases defined");
        }
        const hasAcceptanceCriteria = (result.structuredOutput?.phases as any[])?.some((p: any) => p.tasks?.some((t: any) => t.acceptanceCriteria?.length > 0));
        if (!hasAcceptanceCriteria) {
          feedback.push("Tasks missing acceptance criteria");
        }
        break;

      case "tester":
        if (!result.structuredOutput?.testFiles || !Array.isArray(result.structuredOutput.testFiles) || result.structuredOutput.testFiles.length === 0) {
          feedback.push("No test files specified");
        }
        if (!result.structuredOutput?.commands || !Array.isArray(result.structuredOutput.commands) || result.structuredOutput.commands.length === 0) {
          feedback.push("No test commands provided");
        }
        break;

      case "coder":
        if (!result.structuredOutput?.filesChanged || !Array.isArray(result.structuredOutput.filesChanged) || result.structuredOutput.filesChanged.length === 0) {
          feedback.push("No files changed");
        }
        if (!result.structuredOutput?.testsPassed) {
          feedback.push("Tests did not pass");
        }
        if (!result.structuredOutput?.buildPassed) {
          feedback.push("Build did not pass");
        }
        // Check for placeholders
        if (result.text.includes("TODO") || result.text.includes("FIXME") || result.text.includes("placeholder")) {
          feedback.push("Code contains placeholders/TODOs");
        }
        break;

      case "reviewer":
        if (result.structuredOutput?.approved === true) {
          // Check if there are critical/high issues despite approval
          const issues = (result.structuredOutput?.issues as any[]) || [];
          const criticalHigh = issues.filter((i: any) => ["critical", "high"].includes(i.severity));
          if (criticalHigh.length > 0) {
            feedback.push(`Approved but has ${criticalHigh.length} critical/high issues`);
          }
        } else if (result.structuredOutput?.approved === false) {
          // This is expected - reviewer found issues
          const issues = (result.structuredOutput?.issues as any[]) || [];
          if (issues.length === 0) {
            feedback.push("Rejected but no specific issues listed");
          }
        }
        break;
    }

    return {
      passed: feedback.length === 0,
      feedback: feedback.join("; "),
    };
  }

  #evaluateOverallQuality(phases: DevLoopPhaseResult[]): number {
    if (phases.length === 0) return 0;
    
    const weights: Record<AgentTemplate, number> = {
      researcher: 0.15,
      planner: 0.15,
      tester: 0.15,
      coder: 0.30,
      reviewer: 0.20,
      debugger: 0.05,
      architect: 0.05,
      security: 0.10,
      design: 0.10,
      git: 0.10,
      sniper: 0.10,
      teammate: 0.15,
      documenter: 0.05,
      general: 0.05,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const phase of phases) {
      const weight = weights[phase.phase] ?? 0.1;
      const score = phase.passed ? 1 : Math.max(0, 1 - (phase.metrics.attempts - 1) * 0.3);
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  // ============================================================================
  // Output Consolidation
  // ============================================================================

  #consolidateOutput(artifacts: DevLoopResult["artifacts"]): EnhancedAgentRunResult | undefined {
    // Return the code artifact as the primary output, enriched with review status
    const code = artifacts.code;
    if (!code) return undefined;

    return {
      ...code,
      structuredOutput: {
        ...code.structuredOutput,
        review: artifacts.review?.structuredOutput,
        learning: artifacts.learning?.structuredOutput,
        testPlan: artifacts.tests?.structuredOutput,
        plan: artifacts.plan?.structuredOutput,
        research: artifacts.research?.structuredOutput,
      },
    };
  }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Run the full production-ready development loop.
 * 
 * @param baseRunner - The base agent runner
 * @param activity - Activity store for tracking
 * @param cwd - Working directory
 * @param parentRunId - Parent run ID for context
 * @param task - The development task
 * @param config - Loop configuration
 * 
 * @example
 * const result = await runDevLoop(runner, activity, cwd, runId, 
 *   "Add OAuth2 authentication with PKCE", 
 *   { maxLoopIterations: 2, qualityThreshold: 0.85 }
 * );
 */
export async function runDevLoop(
  baseRunner: AgentRunner,
  activity: ForgeryActivityStore,
  cwd: string,
  parentRunId: string,
  task: string,
  config: DevLoopConfig = {}
): Promise<DevLoopResult> {
  const loopRunner = new DevLoopRunner(baseRunner, activity, cwd, parentRunId);
  return loopRunner.run(task, config);
}

// ============================================================================
// Phase-by-Phase Execution (for manual control)
// ============================================================================

export interface PhaseRunner {
  research: (task: string, context?: string) => Promise<EnhancedAgentRunResult>;
  plan: (task: string, research: EnhancedAgentRunResult) => Promise<EnhancedAgentRunResult>;
  test: (task: string, plan: EnhancedAgentRunResult, research: EnhancedAgentRunResult) => Promise<EnhancedAgentRunResult>;
  code: (task: string, plan: EnhancedAgentRunResult, tests: EnhancedAgentRunResult) => Promise<EnhancedAgentRunResult>;
  review: (code: EnhancedAgentRunResult, tests: EnhancedAgentRunResult) => Promise<EnhancedAgentRunResult>;
  learn: (allPhases: EnhancedAgentRunResult[]) => Promise<EnhancedAgentRunResult>;
}

/**
 * Create individual phase runners for step-by-step execution.
 */
export function createPhaseRunners(
  baseRunner: AgentRunner,
  activity: ForgeryActivityStore,
  cwd: string,
  parentRunId: string,
  costManager?: CostManager,
): PhaseRunner {
  const enhanced = new EnhancedAgentRunner(baseRunner, activity, costManager);

  const runPhase = async (template: AgentTemplate, task: string, name: string) => {
    return enhanced.runEnhanced({
      task,
      cwd,
      template,
      parentRunId,
      name,
      maxRetries: 2,
    });
  };

  return {
    research: (task, context = "") => runPhase("researcher", 
      `Research: ${task}\n\nContext: ${context}`, "research"),
    
    plan: (task, research) => runPhase("planner",
      `Plan: ${task}\n\nResearch:\n${research.text}`, "plan"),
    
    test: (task, plan, research) => runPhase("tester",
      `Design tests for: ${task}\n\nPlan:\n${plan.text}\n\nResearch:\n${research.text}`, "test"),
    
    code: (task, plan, tests) => runPhase("coder",
      `Implement: ${task}\n\nPlan:\n${plan.text}\n\nTest Specs:\n${tests.text}`, "code"),
    
    review: (code, tests) => runPhase("reviewer",
      `Review this implementation:\n\nCode:\n${code.text}\n\nTests:\n${tests.text}`, "review"),
    
    learn: (phases) => runPhase("general",
      `Learn from these phases:\n${phases.map((p, i) => `${i+1}. ${p.text.slice(0,500)}`).join("\n\n")}`, "learn"),
  };
}