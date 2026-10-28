/**
 * pi-forgery — workflow pipeline definitions.
 *
 * Data-driven presets. The engine is generic; `review` is the only preset
 * shipped in v0.3. brainstorm / drift-report / bootstrap presets are new
 * goals (see dev-notes/GOALS.md Non-Goals).
 *
 * EGM stage mapping (Elephant-Goldfish Model):
 *   1. Zoom Out          — full file, zoom-out persona (+ standard)
 *   2. Comprehension Test — semantic split range, comprehension persona
 *   3. Critic Review     — feature range, design-critic + style swarm
 *   4. Intermediate Zoom Out — full file, zoom-out persona
 *   5. Implementation Readiness — detailed range, readiness + codebase-details
 */

import type { PersonaRef, PipelineDef } from "./types.js";

const reviewer = (id: string, title: string): PersonaRef => ({
  id,
  title,
  prompt: "", // filled at runtime from bundled personas/*.md by the engine
  mode: "REVIEW",
});

export const REVIEW_PIPELINE: PipelineDef = {
  id: "review",
  name: "Goldfish Review",
  description:
    "Five-phase document audit: Zoom Out → Comprehension → Critic → " +
    "Zoom Out → Implementation Readiness. Each phase runs bundled personas " +
    "as fresh zero-context agents; findings are deduped, triaged and written " +
    "to report artifacts.",
  phases: [
    {
      id: "zoom-out",
      name: "Zoom Out (Stage 1)",
      description:
        "High-altitude read of the whole document: YAGNI, simplicity, " +
        "reuse existing solutions, flag premature detail and dead-ends.",
      reviewers: [reviewer("zoom-out", "Skeptical Architect (Zoom Out)")],
      targetStrategy: "full",
      standard: "zoom-out",
      reportName: "01_zoom_out_report.md",
    },
    {
      id: "comprehension",
      name: "Comprehension Test (Stage 2)",
      description:
        "Naive-reader pass over the semantic split range: flag undefined " +
        "terms, missing context, hand-waving.",
      reviewers: [reviewer("comprehension", "Naive Reader (Comprehension)")],
      targetStrategy: "range",
      standard: "re-implementation",
      reportName: "02_comprehension_report.md",
    },
    {
      id: "critic",
      name: "Critic Review (Stage 3)",
      description:
        "Antagonistic pass over the feature range: architecture, scalability, " +
        "unmitigated risk, plain-English tone.",
      reviewers: [
        reviewer("design-critic", "Hostile Design Critic"),
        reviewer("style", "Plain-English Editor"),
      ],
      targetStrategy: "range",
      standard: "feature-spec",
      reportName: "03_critic_report.md",
    },
    {
      id: "intermediate-zoom-out",
      name: "Intermediate Zoom Out (Stage 4)",
      description:
        "Re-read the whole document after Critic: verify mitigations, " +
        "confirm no new dead-ends introduced.",
      reviewers: [reviewer("zoom-out", "Skeptical Architect (Zoom Out)")],
      targetStrategy: "full",
      standard: "zoom-out",
      reportName: "04_intermediate_zoom_out_report.md",
    },
    {
      id: "implementation-readiness",
      name: "Implementation Readiness (Stage 5)",
      description:
        "Tech-lead pass over the detailed range: ordered, unambiguous, " +
        "testable steps; confirm plan matches real files/symbols.",
      reviewers: [
        reviewer("implementation-readiness", "Tech Lead (Implementation Readiness)"),
        reviewer("codebase-details", "Codebase Auditor"),
      ],
      targetStrategy: "range",
      standard: "implementation-readiness",
      reportName: "05_implementation_readiness_report.md",
    },
  ],
};

/**
 * BRAINSTORM pipeline (EGM BRAINSTORM mode).
 *
 * Six-lens concept swarm: each lens runs as a fresh zero-context agent with
 * Mode: BRAINSTORM and the concept as FeatureConcept. Findings feed a
 * synthesizer (the engine's existing dedupe/triage) into concepts_brief.md.
 */

export const BRAINSTORM_PIPELINE: PipelineDef = {
  id: "brainstorm",
  name: "Concept Brainstorm",
  description:
    "Six-lens Goldfish swarm that stress-tests a raw concept: design critic, " +
    "codebase auditor, zoom-out architect, naive reader, tech-lead readiness, " +
    "and plain-English editor. Findings dedupe into a concept brief.",
  phases: [
    {
      id: "design-critic",
      name: "Design Critic (Lens 1)",
      description:
        "Hostile read: what is wrong, missing, or risky about this concept?",
      reviewers: [reviewer("design-critic-brainstorm", "Hostile Design Critic")],
      targetStrategy: "full",
      standard: "brainstorm",
      reportName: "01_design_critic_report.md",
    },
    {
      id: "codebase-details",
      name: "Codebase Auditor (Lens 2)",
      description:
        "Does this concept reuse or contradict what already exists in the codebase?",
      reviewers: [
        reviewer("codebase-details-brainstorm", "Codebase Auditor"),
      ],
      targetStrategy: "full",
      standard: "brainstorm",
      reportName: "02_codebase_details_report.md",
    },
    {
      id: "zoom-out",
      name: "Zoom Out (Lens 3)",
      description:
        "YAGNI + simplicity check: do we actually need this? Reuse existing solutions?",
      reviewers: [
        reviewer("zoom-out-brainstorm", "Skeptical Architect"),
      ],
      targetStrategy: "full",
      standard: "brainstorm",
      reportName: "03_zoom_out_report.md",
    },
    {
      id: "comprehension",
      name: "Comprehension Test (Lens 4)",
      description:
        "Naive reader: undefined terms, missing context, hand-waving.",
      reviewers: [
        reviewer("comprehension-brainstorm", "Naive Reader"),
      ],
      targetStrategy: "full",
      standard: "brainstorm",
      reportName: "04_comprehension_report.md",
    },
    {
      id: "implementation-readiness",
      name: "Tech Lead Readiness (Lens 5)",
      description:
        "Ordered, unambiguous, testable steps; rollback path for each change.",
      reviewers: [
        reviewer("implementation-readiness-brainstorm", "Tech Lead"),
      ],
      targetStrategy: "full",
      standard: "brainstorm",
      reportName: "05_implementation_readiness_report.md",
    },
    {
      id: "style",
      name: "Plain-English Editor (Lens 6)",
      description:
        "No glazing, no buzzwords, plain English first, action-oriented.",
      reviewers: [reviewer("style-brainstorm", "Plain-English Editor")],
      targetStrategy: "full",
      standard: "brainstorm",
      reportName: "06_style_report.md",
    },
  ],
};

export const PIPELINES: Record<string, PipelineDef> = {
  review: REVIEW_PIPELINE,
  brainstorm: BRAINSTORM_PIPELINE,
};
export function getPipeline(id: string): PipelineDef | undefined {
  return PIPELINES[id];
}

export function listPipelines(): PipelineDef[] {
  return Object.values(PIPELINES);
}
