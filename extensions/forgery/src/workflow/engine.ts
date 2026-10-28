/**
 * pi-forgery — workflow engine.
 *
 * Executes pipeline phases against a target document. Each phase runs its
 * reviewers as fresh, zero-context `pi --print` subprocesses via AgentRunner
 * (the Goldfish: persona = systemPrompt, review instructions = task). Each
 * reviewer must end its reply with a fenced ```json findings block. The
 * engine parses, dedupes, triages and writes report artifacts; every phase
 * and agent is recorded in the ForgeryActivityStore so the widget/footer/
 * dashboard surface them. Runs can be paused/resumed and stopped.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentRunner, AgentRunResult } from "../agents/runner";
import type { ForgeryActivityStore } from "../activity/store";
import type {
  Finding,
  PersonaRef,
  PhaseDef,
  PipelineDef,
  Severity,
  SynthesizedReport,
  WorkflowResult,
  WorkflowRunState,
} from "./types";
export type {
  Finding,
  PersonaRef,
  PhaseDef,
  PipelineDef,
  Severity,
  SynthesizedReport,
  WorkflowResult,
  WorkflowRunState,
} from "./types";
import { getPipeline, listPipelines } from "./pipelines";

// ── where report artifacts and run-state files live ──────────────────────

export const WORKFLOW_DIR = ".pi/forgery";
export const WORKFLOW_RUN_DIR = `${WORKFLOW_DIR}/workflow`;
export const WORKFLOW_REPORT_DIR = `${WORKFLOW_DIR}/review`;

// in-memory run states keyed by run id (session-scoped, like the activity store)
const runStates = new Map<string, WorkflowRunState>();
// stop signals keyed by run id
const stopSignals = new Set<string>();

// ── persona / standard loading ──────────────────────────────────────────

/** Read a bundled persona/standard markdown file from src/workflow/. */
function loadWorkflowText(relPath: string): string {
  const resolved = new URL(`./${relPath}`, import.meta.url);
  try {
    // jiti/tsx run TS in place, so import.meta.url points at the source tree.
    return readTextFile(resolved.pathname);
  } catch {
    return "";
  }
}

function readTextFile(p: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  return fs.readFileSync(p, "utf8");
}

/** Persona prompt text for a reviewer id, bundled from personas/*.md. */
export function loadPersonaPrompt(id: string): string {
  return loadWorkflowText(`personas/${id}.md`);
}

/** Document standard text for a standard id, bundled from standards/*.md. */
export function loadStandardText(id: string): string {
  return loadWorkflowText(`standards/${id}.md`);
}

// ── finding parse + synthesize ─────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, major: 1, nit: 2 };

function normalizeSeverity(raw: unknown): Severity | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (s === "blocker" || s === "🔴 blocker" || s === "blocker 🔴") return "blocker";
  if (s === "major" || s === "🟡 major" || s === "major 🟡") return "major";
  if (s === "nit" || s === "🟢 nit" || s === "nit 🟢") return "nit";
  return undefined;
}

function parseFindingBlock(block: string): Finding | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  const severity = normalizeSeverity(obj.severity);
  const issue = typeof obj.issue === "string" ? obj.issue.trim() : undefined;
  const rationale =
    typeof obj.rationale === "string" ? obj.rationale.trim() : undefined;
  const line =
    typeof obj.line === "number" && Number.isFinite(obj.line) ? obj.line : undefined;
  if (!severity || !issue || !rationale) return undefined;
  return { severity, line, issue, rationale };
}

/** Extract all fenced ```json blocks from text and parse valid findings. */
export function parseFindings(text: string): Finding[] {
  const findings: Finding[] = [];
  const fenceRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const block = match[1].trim();
    if (!block) continue;
    // try whole block as an array first, then as a single object
    let candidates: unknown[];
    try {
      const parsed = JSON.parse(block);
      candidates = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // maybe multiple JSON objects separated by newlines — try each line
      candidates = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return undefined;
          }
        })
        .filter((x): x is Record<string, unknown> => x !== undefined);
    }
    for (const c of candidates) {
      const f = parseFindingBlock(JSON.stringify(c));
      if (f) findings.push(f);
    }
  }
  return findings;
}

function normalizeIssue(issue: string): string {
  return issue
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!]$/, "")
    .trim();
}

/** Dedup and triage: highest severity wins; sorted blocker→major→nit, then line. */
export function synthesizeFindings(findings: Finding[]): SynthesizedReport["findings"] {
  const byIssue = new Map<string, Finding>();
  for (const f of findings) {
    const key = normalizeIssue(f.issue);
    const existing = byIssue.get(key);
    if (!existing) {
      byIssue.set(key, f);
      continue;
    }
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[existing.severity]) {
      byIssue.set(key, { ...f, line: f.line ?? existing.line });
    } else if (
      SEVERITY_RANK[f.severity] === SEVERITY_RANK[existing.severity] &&
      existing.line === undefined
    ) {
      byIssue.set(key, { ...existing, line: f.line });
    }
  }
  return [...byIssue.values()].sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (r !== 0) return r;
    if (a.line === undefined && b.line === undefined) return 0;
    if (a.line === undefined) return 1;
    if (b.line === undefined) return -1;
    return a.line - b.line;
  });
}

function totalsOf(findings: Finding[]): { blocker: number; major: number; nit: number } {
  return findings.reduce(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { blocker: 0, major: 0, nit: 0 },
  );
}

// ── semantic split (EGM FeatureRange / DetailedRange boundary) ──────────

const IMPL_BOUNDARY_HEADERS = [
  /^##\s+(detailed\s+implementation\s+plan|implementation\s+plan|work\s+breakdown|implementation\s+steps)\s*/i,
];

function findBoundaryLine(text: string): number | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of IMPL_BOUNDARY_HEADERS) {
      if (re.test(lines[i])) return i + 1; // 1-based
    }
  }
  return undefined;
}

function splitTarget(text: string): { feature: string; detailed: string; boundaryLine: number | undefined } {
  const boundary = findBoundaryLine(text);
  if (boundary === undefined) {
    return { feature: text, detailed: "", boundaryLine: undefined };
  }
  const lines = text.split("\n");
  return {
    feature: lines.slice(0, boundary - 1).join("\n"),
    detailed: lines.slice(boundary - 1).join("\n"),
    boundaryLine: boundary,
  };
}

// ── task builder ────────────────────────────────────────────────────────

function buildReviewerTask(
  target: string,
  rangeText: string,
  boundaryLine: number | undefined,
  context: string[],
  standardText: string,
  mode: string,
): string {
  const ctxList = context.length ? `\nReading list (GoldfishContext):\n${context.map((c) => `- ${c}`).join("\n")}` : "";
  return [
    `# Goldfish review — ${mode}`,
    ``,
    `Target file: ${target}`,
    boundaryLine ? `Boundary line (implementation plan starts here): ${boundaryLine}` : "",
    ``,
    `## Standard applied`,
    standardText,
    ``,
    `## Reviewing text (focus on the indicated range)`,
    "```",
    rangeText,
    "```",
    ``,
    ctxList,
    ``,
    "## Output contract (mandatory)",
    "End your reply with a fenced ```json block containing an array of findings:",
    "```json",
    "[",
    "  {",
    "    \"severity\": \"blocker\",       // blocker | major | nit",
    "    \"line\": 42,                  // 1-based line, optional",
    "    \"issue\": \"short statement\",",
    "    \"rationale\": \"why it matters / how to fix\"",
    "  }",
    "]",
    "```",
    "If no findings, emit an empty array `[]`. Do not add prose after the json block.",
  ].filter(Boolean).join("\n");
}

// ── engine ──────────────────────────────────────────────────────────────

export class WorkflowEngine {
  constructor(
    private readonly store: ForgeryActivityStore,
    private readonly runner: AgentRunner,
    private readonly cwd: string,
  ) {}

  /** List available pipelines. */
  pipelines(): PipelineDef[] {
    return listPipelines();
  }

  /** Get a pipeline by id. */
  pipeline(id: string): PipelineDef | undefined {
    return getPipeline(id);
  }

  /** All tracked workflow run states. */
  states(): WorkflowRunState[] {
    return [...runStates.values()].reverse();
  }

  get(runId: string): WorkflowRunState | undefined {
    return runStates.get(runId);
  }

  /** Stop a running workflow: no new agents/phases; kill tracked agents. */
  stop(runId: string): boolean {
    const state = runStates.get(runId);
    if (!state || state.status !== "running") return false;
    stopSignals.add(runId);
    for (const agentId of state.agentIds) {
      try {
        this.runner.stop(agentId);
      } catch {
        /* ignore — agent may already be finished */
      }
    }
    state.status = "stopped";
    state.finishedAt = Date.now();
    state.updatedAt = state.finishedAt;
    this.#persist(state);
    return true;
  }

  /** Resume a stopped workflow (re-run from its current phase index). */
  async resume(
    runId: string,
    target?: string,
  ): Promise<WorkflowResult | { error: string }> {
    const state = runStates.get(runId);
    if (!state) return { error: `unknown workflow run ${runId}` };
    if (state.status !== "stopped") return { error: `workflow ${runId} is not stopped (${state.status})` };
    stopSignals.delete(runId);
    state.status = "running";
    state.updatedAt = Date.now();
    const tgt = target ?? state.target;
    if (tgt !== state.target) {
      state.target = tgt;
      state.updatedAt = Date.now();
    }
    this.#persist(state);
    return this.#execute(state);
  }

  /** Run a pipeline against a target document. */
  async run(
    pipelineId: string,
    target: string,
    context: string[] = [],
    mode = "REVIEW",
  ): Promise<WorkflowResult | { error: string }> {
    const pipeline = getPipeline(pipelineId);
    if (!pipeline) return { error: `unknown pipeline ${pipelineId}` };

    const runId = randomUUID();
    const now = Date.now();
    const state: WorkflowRunState = {
      id: runId,
      pipelineId,
      target,
      context,
      mode,
      status: "running",
      phaseIndex: 0,
      agentIds: [],
      reports: [],
      startedAt: now,
      updatedAt: now,
    };
    runStates.set(runId, state);
    this.#persist(state);

    // Activity-store run so the widget/footer/dashboard surface it.
    const activityRun = this.store.start(runId, {
      name: `workflow: ${pipeline.name}`,
      description: `Goldfish ${pipelineId} against ${target}`,
    });

    try {
      return await this.#execute(state, activityRun.id);
    } catch (err) {
      state.status = "failed";
      state.error = err instanceof Error ? err.message : String(err);
      state.finishedAt = Date.now();
      state.updatedAt = state.finishedAt;
      this.#persist(state);
      this.store.finish(runId, false, state.error);
      return { runId, status: "failed", phases: [], error: state.error };
    }
  }

  async #execute(
    state: WorkflowRunState,
    activityRunId?: string,
  ): Promise<WorkflowResult> {
    const pipeline = getPipeline(state.pipelineId)!;
    const phases: SynthesizedReport[] = [];

    // Read target once; compute semantic split for range phases.
    let targetText = "";
    let split: { feature: string; detailed: string; boundaryLine: number | undefined } | undefined;
    try {
      targetText = require("node:fs").readFileSync(state.target, "utf8");
      split = splitTarget(targetText);
    } catch {
      // missing target is a blocker for every phase; still run so reviewers can report it
      split = { feature: "", detailed: "", boundaryLine: undefined };
    }

    const standardCache = new Map<string, string>();
    const standardFor = (id: string) => {
      let t = standardCache.get(id);
      if (!t) {
        t = loadStandardText(id);
        standardCache.set(id, t);
      }
      return t;
    };

    for (let i = state.phaseIndex; i < pipeline.phases.length; i++) {
      if (stopSignals.has(state.id)) {
        state.status = "stopped";
        state.finishedAt = Date.now();
        state.updatedAt = state.finishedAt;
        state.phaseIndex = i;
        this.#persist(state);
        this.store.finish(activityRunId ?? state.id, false, "stopped");
        return {
          runId: state.id,
          status: "stopped",
          phases,
        };
      }

      const phase = pipeline.phases[i];
      state.phaseIndex = i;
      state.updatedAt = Date.now();
      this.#persist(state);

      const activityPhase = this.store.phase(activityRunId ?? state.id, {
        id: phase.id,
        name: phase.name,
        description: phase.description,
        total: phase.reviewers.length,
      });

      const phaseFindings: Finding[] = [];

      for (const reviewer of phase.reviewers) {
        if (stopSignals.has(state.id)) break;

        const prompt = loadPersonaPrompt(reviewer.id);
        const standardText = standardFor(phase.standard);
        const range = phase.targetStrategy === "full"
          ? { text: targetText, kind: "full" as const }
          : phase.id === "critic"
            ? { text: split!.feature, kind: "feature" as const }
            : phase.id === "implementation-readiness"
              ? { text: split!.detailed, kind: "detailed" as const }
              : { text: targetText, kind: "both" as const };

        const activityCall = this.store.beginCall(
          activityRunId ?? state.id,
          randomUUID(),
          `agents.run:${reviewer.id}`,
          { target: state.target, reviewer: reviewer.id, phase: phase.id },
        );

        let result: AgentRunResult;
        try {
          result = await this.runner.run({
            task: buildReviewerTask(
              state.target,
              range.text,
              split?.boundaryLine,
              state.context,
              standardText,
              state.mode,
            ),
            systemPrompt: prompt,
            name: reviewer.title,
            cwd: this.cwd,
            timeoutMs: 600_000,
          });
          state.agentIds.push(result.id);
        } catch (err) {
          this.store.finishCall(activityRunId ?? state.id, activityCall.id, {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        // record the goldfish agent in the activity store
        const agentRecord = {
          id: result.id,
          name: reviewer.title,
          task: `review ${state.target} :: ${phase.name} :: ${reviewer.id}`,
          status: result.status as any,
          current: reviewer.id,
          turns: 1,
          toolCalls: 1,
          usage: result.usage,
          text: result.text,
          error: result.error,
          startedAt: result.startedAt,
          updatedAt: result.finishedAt,
          finishedAt: result.finishedAt,
        };
        this.store.addAgent(agentRecord as any);

        const ok = result.status === "completed";
        this.store.finishCall(activityRunId ?? state.id, activityCall.id, {
          success: ok,
          result: { findings: parseFindings(result.text).length },
          preview: `${result.status} · ${parseFindings(result.text).length} findings`,
          error: ok ? undefined : result.error,
        });

        const found = parseFindings(result.text);
        phaseFindings.push(...found);
        this.store.event(activityRunId ?? state.id, {
          message: `reviewer ${reviewer.id} reported ${found.length} finding(s)`,
          level: found.some((f) => f.severity === "blocker") ? "error" : "info",
          data: { reviewer: reviewer.id, phase: phase.id, count: found.length },
        });
      }

      const synthesized = synthesizeFindings(phaseFindings);
      const report = {
        phaseId: phase.id,
        phaseName: phase.name,
        findings: synthesized,
        totals: totalsOf(phaseFindings),
      };
      phases.push(report);

      // write phase report artifact
      this.#writeArtifact(state.id, phase.reportName, this.#formatPhaseReport(report, standardFor(phase.standard)));
      state.reports.push({ phaseId: phase.id, artifactPath: join(WORKFLOW_REPORT_DIR, state.id, phase.reportName) });

      this.store.item(activityRunId ?? state.id, {
        id: `phase-${phase.id}`,
        label: phase.name,
        status: "completed",
        phase: phase.id,
        detail: `${phaseFindings.length} finding(s) → ${synthesized.length} unique (${report.totals.blocker}🔴 ${report.totals.major}🟡 ${report.totals.nit}🟢)`,
        data: report,
        completed: synthesized.length,
      });

      this.store.event(activityRunId ?? state.id, {
        message: `phase ${phase.name} complete`,
        level: "success",
        data: { phase: phase.id, findings: synthesized.length },
      });

      state.updatedAt = Date.now();
      this.#persist(state);
    }

    // all phases done — consolidated report
    state.status = "completed";
    state.finishedAt = Date.now();
    state.updatedAt = state.finishedAt;
    state.phaseIndex = pipeline.phases.length;
    this.#persist(state);
    this.store.finish(activityRunId ?? state.id, true);

    const consolidated = this.#writeConsolidatedReport(state.id, pipeline, phases);
    return {
      runId: state.id,
      status: "completed",
      phases,
      consolidatedArtifact: consolidated,
    };
  }

  // ── persistence + artifact writing ────────────────────────────────────

  #persist(state: WorkflowRunState): void {
    try {
      mkdirSync(WORKFLOW_RUN_DIR, { recursive: true });
      writeFileSync(join(WORKFLOW_RUN_DIR, `${state.id}.json`), JSON.stringify(state, null, 2), "utf8");
    } catch {
      /* persistence is best-effort; in-memory state is authoritative */
    }
  }

  #writeArtifact(runId: string, fileName: string, content: string): string {
    const dir = join(WORKFLOW_REPORT_DIR, runId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, fileName);
    writeFileSync(path, content, "utf8");
    return path;
  }

  #writeConsolidatedReport(
    runId: string,
    pipeline: PipelineDef,
    phases: SynthesizedReport[],
  ): string {
    const lines: string[] = [];
    lines.push("# Goldfish Review — Consolidated Report");
    lines.push("");
    lines.push(`Pipeline: ${pipeline.name} (${pipeline.id})`);
    lines.push("");
    const allFindings = phases.flatMap((p) => p.findings);
    const totals = totalsOf(allFindings);
    lines.push(`Total unique findings: ${allFindings.length} (`);
    lines.push(`  🔴 ${totals.blocker} blocker, 🟡 ${totals.major} major, 🟢 ${totals.nit} nit)`);
    lines.push("");
    lines.push("## Traceability Matrix");
    lines.push("");
    lines.push("| Phase | Findings | Blockers | Majors | Nits |");
    lines.push("|-------|----------|----------|--------|------|");
    for (const p of phases) {
      const t = totalsOf(p.findings);
      lines.push(`| ${p.phaseName} | ${p.findings.length} | ${t.blocker} | ${t.major} | ${t.nit} |`);
    }
    lines.push("");
    lines.push("## Prioritized Findings");
    lines.push("");
    const sorted = [...allFindings].sort((a, b) => {
      const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (r !== 0) return r;
      return 0;
    });
    for (const f of sorted) {
      lines.push(`### ${f.issue}`);
      lines.push(`- Severity: ${f.severity}`);
      if (f.line !== undefined) lines.push(`- Line: ${f.line}`);
      lines.push(`- Rationale: ${f.rationale}`);
      lines.push("");
    }
    if (sorted.length === 0) lines.push("_No findings._");
    const content = lines.join("\n");
    this.#writeArtifact(runId, "consolidated_review_report.md", content);
    return join(WORKFLOW_REPORT_DIR, runId, "consolidated_review_report.md");
  }

  #formatPhaseReport(report: SynthesizedReport, standardText: string): string {
    const lines: string[] = [];
    lines.push(`# ${report.phaseName}`);
    lines.push("");
    lines.push(`Findings: ${report.findings.length} unique (`);
    lines.push(`🔴 ${report.totals.blocker} blocker, 🟡 ${report.totals.major} major, 🟢 ${report.totals.nit} nit)`);
    lines.push("");
    lines.push("## Standard applied");
    lines.push("");
    lines.push(standardText || "_(standard text not bundled)_");
    lines.push("");
    lines.push("## Prioritized Findings");
    lines.push("");
    if (report.findings.length === 0) {
      lines.push("_No findings._");
    } else {
      for (const f of report.findings) {
        lines.push(`### ${f.issue}`);
        lines.push(`- Severity: ${f.severity}`);
        if (f.line !== undefined) lines.push(`- Line: ${f.line}`);
        lines.push(`- Rationale: ${f.rationale}`);
        lines.push("");
      }
    }
    return lines.join("\n");
  }
}

let engineSingleton: WorkflowEngine | undefined;

/** Obtain (or create) the engine bound to the current store/runner/cwd. */
export function createEngine(
  store: ForgeryActivityStore,
  runner: AgentRunner,
  cwd: string,
): WorkflowEngine {
  if (!engineSingleton) engineSingleton = new WorkflowEngine(store, runner, cwd);
  return engineSingleton;
}
