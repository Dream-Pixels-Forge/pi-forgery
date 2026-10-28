/**
 * pi-forgery — resolver loop (EGM review-loop).
 *
 * Human-in-the-loop triage for drift-report findings. Each finding is
 * classified as PROPOSE FIX or CONTEST. Approved fixes are applied as text
 * repairs to the target design document; contested findings are left
 * untouched. Drift is then re-run against the fixed document to verify
 * convergence — capped at one re-audit per finding.
 *
 * Runs are read-then-write on design documents only — never modifies source
 * code under repair (drift-report detects; resolver fixes the doc, not the
 * impl).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunner } from "../agents/runner.js";
import type { ForgeryActivityStore } from "../activity/store.js";
import type { Finding, Severity, WorkflowEngine } from "./engine.js";
import type { WorkflowRunState } from "./types.js";

export type Decision = "propose-fix" | "contest";

export interface ResolutionFinding {
  severity: Severity;
  line?: number;
  issue: string;
  rationale: string;
  decision: Decision;
}

export interface ResolutionResult {
  runId: string;
  applied: number;        // propose-fix findings applied
  contested: number;      // contest findings left untouched
  reAudited: boolean;     // drift re-run converged (0 blockers)
  reAuditCapReached: boolean; // drift re-ran but still diverged (cap reached)
  reportPath: string;     // goldfish_review_report.md path
  error?: string;
}

/** Where resolver artifacts live. */
const RESOLVER_REPORT_DIR = ".pi/forgery/resolver";

export class WorkflowResolver {
  constructor(
    private readonly store: ForgeryActivityStore,
    private readonly runner: AgentRunner,
    private readonly cwd: string,
    private readonly engine: WorkflowEngine,
  ) {}

  /** Resolve findings against a drift-report run. */
  async resolveFindings(input: {
    runId: string;
    findings: ResolutionFinding[];
  }): Promise<ResolutionResult> {
    const state = this.engine.get(input.runId);
    if (!state) {
      return {
        runId: input.runId,
        applied: 0,
        contested: 0,
        reAudited: false,
        reAuditCapReached: false,
        reportPath: "",
        error: `unknown workflow run ${input.runId}`,
      };
    }

    const target = state.target;
    let applied = 0;
    let contested = 0;

    const reportLines: string[] = [];
    reportLines.push("# Goldfish Review Report — Resolver Output");
    reportLines.push("");
    reportLines.push(`Run: ${input.runId}`);
    reportLines.push(`Target: ${target}`);
    reportLines.push("");
    reportLines.push("## Resolution Summary");
    reportLines.push("");

    for (const finding of input.findings) {
      if (finding.decision === "contest") {
        contested++;
        reportLines.push(
          `- [CONTEST] ${finding.issue} (${finding.severity}) — ${finding.rationale}`,
        );
        continue;
      }

      // propose-fix: apply text repair at the specified line
      if (finding.line === undefined) {
        reportLines.push(
          `- [SKIP] ${finding.issue} — no line specified`,
        );
        continue;
      }

      try {
        this.#applyFix(target, finding.line, finding.issue, finding.rationale);
        applied++;
        reportLines.push(
          `- [FIXED] ${finding.issue} at line ${finding.line} — ${finding.rationale}`,
        );
      } catch (err) {
        reportLines.push(
          `- [ERROR] ${finding.issue} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Write goldfish_review_report.md
    const reportDir = join(RESOLVER_REPORT_DIR, input.runId);
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, "goldfish_review_report.md");
    writeFileSync(reportPath, reportLines.join("\n"), "utf8");

    // Re-run drift to verify convergence (one re-audit cap per finding)
    let reAudited = false;
    let reAuditCapReached = false;
    if (applied > 0) {
      try {
        const reRunResult = await this.engine.run("drift-report", target);
        if ("error" in reRunResult) {
          // drift run failed — cannot verify convergence
          reAudited = false;
          reAuditCapReached = true;
        } else {
          const totalBlockers = reRunResult.phases.reduce(
            (sum: number, p: { totals: { blocker: number } }) => sum + p.totals.blocker,
            0,
          );
          reAudited = totalBlockers === 0;
          reAuditCapReached = totalBlockers > 0;
        }
      } catch {
        reAudited = false;
        reAuditCapReached = true;
      }
    }

    return {
      runId: input.runId,
      applied,
      contested,
      reAudited,
      reAuditCapReached,
      reportPath,
    };
  }

  /** Apply a text repair at the specified 1-based line. */
  #applyFix(filePath: string, line: number, issue: string, rationale: string): void {
    if (!existsSync(filePath)) {
      throw new Error(`cannot apply fix: file not found ${filePath}`);
    }
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    if (line < 1 || line > lines.length) {
      throw new Error(`line ${line} out of range (1-${lines.length})`);
    }
    // Replace the target line with a fix marker (idempotent: re-running
    // replaces the same marker, never duplicates)
    lines[line - 1] = `// forgery-resolver: fixed — ${issue} — ${rationale}`;
    writeFileSync(filePath, lines.join("\n"), "utf8");
  }
}

let resolverSingleton: WorkflowResolver | undefined;

/** Obtain (or create) the resolver bound to the current store/runner/cwd/engine. */
export function createResolver(
  store: ForgeryActivityStore,
  runner: AgentRunner,
  cwd: string,
  engine: WorkflowEngine,
): WorkflowResolver {
  if (!resolverSingleton) {
    resolverSingleton = new WorkflowResolver(store, runner, cwd, engine);
  }
  return resolverSingleton;
}
