# Standard: Brainstorm (EGM BRAINSTORM mode)

Adapted from Google's Elephant-Goldfish Model (Apache-2.0).

## Purpose
Stress-test a raw concept from six adversarial lenses before any code is
written. Surface weaknesses, reuse opportunities, and premature complexity.

## Review vectors
- **Design Critic**: What is wrong, missing, risky? Strongest counter-argument
  for every claim. Unmitigated risks are blockers.
- **Codebase Auditor**: Does it reuse or contradict existing files/symbols/APIs?
  Ghost references are blockers.
- **Zoom Out**: YAGNI — can something existing solve 90%? Premature detail and
  architectural dead-ends are findings.
- **Comprehension**: Undefined terms, missing context, hand-waving, logical
  gaps. Concept must be self-contained.
- **Tech Lead Readiness**: Ordered steps, unambiguous imperatives, testable
  outcomes, owned actions, rollback paths.
- **Style**: Plain English, no glazing, no buzzwords, no decorative adverbs.

## Output
Findings only. Six lenses, each producing severity-triaged findings
(blocker/major/nit). Dedupe into a concept brief.
