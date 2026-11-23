# Standard: Drift Report

Adapted from Google's Elephant-Goldfish Model (Apache-2.0).

## Purpose
Detect and report divergences between checked-in design documents and the
live codebase. Report ONLY differences — never describe what matches.

## Review vectors
- **Contextualize**: Read each design document. Identify intent, proposed
  changes, and specific filenames/symbols mentioned.
- **Locate source**: Find corresponding source files. Prompt to add missing
  links to documents for cheaper future detection.
- **Verify**: Read current state of located source files.
- **Detect drift**:
  - Missing features: logic in doc but absent in code.
  - Incomplete models: classes/structs/protos missing fields from design.
  - Logic shortcuts: hardcoded values where dynamic logic was planned.
  - Architectural divergence: implementation uses different patterns/libraries
    than proposed.
- **Filter**: Report ONLY the differences. If code matches design perfectly,
  output "No drift detected."

## Output
Per document: one drift finding block per divergence, plus a consolidated
`{YYYY-MM-DD}_DRIFT_REPORT.md`. Each finding carries severity
(blocker/major/nit), optional line, issue statement, and rationale.
