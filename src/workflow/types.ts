/**
 * pi-forgery — workflow engine types.
 *
 * Goldfish-style review workflow engine: phases run reviewers as fresh,
 * zero-context `pi --print` subprocesses (AgentRunner). Each reviewer is a
 * persona prompt (systemPrompt) + review instructions (task). Findings come
 * back as fenced ```json blocks. A local synthesizer dedupes/triages them.
 *
 * Bundled in src/workflow/personas/*.md and src/workflow/standards/*.md.
 */

export type Severity = "blocker" | "major" | "nit";

export interface Finding {
  /** Blocker/major/nit — normalized to lower-case by the engine. */
  severity: Severity;
  /** 1-based line in the reviewed target, when the reviewer located one. */
  line?: number;
  /** One-sentence statement of the issue. */
  issue: string;
  /** Why it matters / how to fix it. */
  rationale: string;
}

export type PersonaMode = "BRAINSTORM" | "REVIEW";

export interface PersonaRef {
  /** Stable id, e.g. "zoom-out", "design-critic". */
  id: string;
  /** Human title shown in UI. */
  title: string;
  /** Persona instructions (EGM mandate) — becomes the agent systemPrompt. */
  prompt: string;
  mode: PersonaMode;
}

export interface PhaseDef {
  id: string;
  name: string;
  description?: string;
  /** Reviewers that run for this phase (fresh subprocess each). */
  reviewers: PersonaRef[];
  /** "full" = whole target; "range" = semantic split (feature vs impl). */
  targetStrategy: "full" | "range";
  /** Document standard applied (bundled in standards/). */
  standard: string;
  /** Artifact filename, e.g. "01_zoom_out_report.md". */
  reportName: string;
}

export interface PipelineDef {
  id: string;
  name: string;
  description?: string;
  phases: PhaseDef[];
}

export interface WorkflowRunState {
  id: string;
  pipelineId: string;
  target: string;          // reviewed file path
  context: string[];       // GoldfishContext reading list
  mode: string;            // BRAINSTORM | REVIEW
  status: "running" | "completed" | "failed" | "stopped";
  phaseIndex: number;      // next phase to execute
  agentIds: string[];      // goldfish agents spawned for this run (for stop)
  reports: Array<{ phaseId: string; artifactPath: string }>;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface SynthesizedReport {
  phaseId: string;
  phaseName: string;
  findings: Finding[];
  totals: { blocker: number; major: number; nit: number };
}

export interface WorkflowResult {
  runId: string;
  status: "completed" | "failed" | "stopped";
  phases: SynthesizedReport[];
  consolidatedArtifact?: string;
  error?: string;
}
