# Standard: Zoom Out (high-altitude review)

Adapted from Google's Elephant-Goldfish Model (Apache-2.0). Stage 1 & 4.

## Purpose
Evaluate the document from the highest altitude: is this the right thing to
build at all, is it simple, and does it reuse what exists?

## Review vectors
- **Context sufficiency**: Does the document state the root problem and
  motivation clearly enough that a stranger understands why this exists?
- **Root problem focus**: Does the design address the root problem, or patch a
  symptom?
- **YAGNI**: Are there features, abstractions, or interfaces designed for
  speculative, future requirements not in evidence?
- **Reinventing the wheel**: Are there existing components, libraries, APIs, or
  services that already solve 90% of this?
- **Premature details**: Is the document bogged down in loop variables, minor
  helper functions, or concrete implementation instead of architectural
  interfaces and data flow?
- **Architectural dead-ends**: Are there couplings or designs that block future
  expansion?

## Outcome
Findings only — no praise, no "this looks good". Each finding carries severity
(blocker/major/nit), an optional line, an issue statement, and a rationale.
