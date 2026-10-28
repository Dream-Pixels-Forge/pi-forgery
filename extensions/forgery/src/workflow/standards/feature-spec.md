# Standard: Feature Spec

Adapted from Google's Elephant-Goldfish Model (Apache-2.0). Stage 3 (Critic).

## Purpose
Evaluate a feature specification for clarity, measurability, and honesty
about trade-offs.

## Review vectors
- **Goals**: Is there one clear objective? Is it one sentence?
- **Non-goals**: Is it explicit about what is NOT in scope?
- **Acceptance criteria**: Are they binary (pass/fail), verifiable by
  inspection or test?
- **Deliverables**: Are they tangible (you can point to them), not abstract?
- **Anti-patterns**: "make it better", "implement everything", "it should
  work" — flag every one.
- **Trade-offs**: Are risks, limitations, and the opposing view stated?

## Outcome
Findings only, severity blocker/major/nit. Blockers: missing objective, no
verifiable acceptance criteria, or unverifiable "should work" claims.
