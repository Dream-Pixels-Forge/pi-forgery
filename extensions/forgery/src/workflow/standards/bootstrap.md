# Standard: Bootstrap

Adapted from Google's Elephant-Goldfish Model (Apache-2.0).

## Purpose
Bottom-up codebase documentation: for each source module, document its
interface, invariants, and side-effects, then upsert a `/// @forgery-bootstrap`
sentinel comment block so future drift detection can verify docs match code.

## Review vectors
- **Interface**: Are all exported symbols listed with signatures? Are
  dependencies noted?
- **Invariants**: Are preconditions, postconditions, error behavior, and
  resource constraints stated? Are assumptions flagged?
- **Side Effects**: Are file I/O, network calls, process spawns, environment
  access, and shared-state mutation listed? Is "none" stated when absent?
- **Sentinel Blocks**: Is a `/// @forgery-bootstrap` block present at the
  top of each module? Is it idempotent (updated in place, not duplicated)?
  Was logic left untouched?

## Output
Per module: findings for each vector (severity blocker/major/nit), plus a
sentinel block upserted into the source file. Final report summarizes
modules documented and sentinels written.
