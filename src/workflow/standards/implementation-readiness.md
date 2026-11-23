# Standard: Implementation Readiness

Adapted from Google's Elephant-Goldfish Model (Apache-2.0). Stage 5.

## Purpose
Evaluate whether an implementation plan is ready to hand to an implementer
who can execute it correctly the first time with no follow-up questions.

## Review vectors
- **Ordered steps**: Are steps in dependency order? Does any step assume a
  prior step completed without saying so?
- **Unambiguous**: Does every imperative name the exact file, symbol, value,
  or command?
- **Testable**: Does every outcome have a pass/fail check the implementer can
  run?
- **Owned**: Is every action owned (no "the team will..." / "someone should...")?
- **Rollback**: Is there a stated reversal path for each change?

## Outcome
Findings only. Blockers: steps out of order, unowned actions, or outcomes with
no pass/fail check.
