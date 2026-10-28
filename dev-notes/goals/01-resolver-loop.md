# Goal: EGM Resolver Loop — PROPOSE FIX vs CONTEST triage for drift-report findings

## Objective
Implement the resolver half of EGM's `egm-review-loop` for pi-forgery's drift-report preset: a human-in-the-loop triage that classifies each finding as PROPOSE FIX or CONTEST, applies approved text repairs to design documents, and re-runs drift to verify convergence — capped at one re-audit per finding.

## Context
pi-forgery now has the drift-report preset (commit 9387b75, PR #5) that detects divergences between design docs and live code. The missing half is EGM's resolver loop: findings must be triaged (PROPOSE FIX vs CONTEST), approved fixes applied to source docs, and drift re-run to confirm the gap closed. This is the critique→resolve cycle that makes drift-report actionable rather than just diagnostic.

## Deliverables
- [ ] `src/workflow/resolver.ts` — `resolveFindings(runId, findings)`: classifies each finding (PROPOSE FIX / CONTEST), saves `goldfish_review_report.md`, applies approved text repairs to target design documents via file-editing tools
- [ ] Host call `workflow.resolve` (TypeBox schema in `src/exec/schemas.ts`, registered in `makeRegistry`): `{ runId, findings: [{severity, line, issue, rationale, decision: "propose-fix"|"contest"}] }` returns applied fixes + re-run drift result
- [ ] `tests/workflow.test.ts` — add resolver tests (fake AgentRunner: classify findings, apply approved fix, skip contested, re-run drift convergence, max 1 re-audit cap) — total tests must stay green
- [ ] README.md + SKILL.md — short "resolver loop" section

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] `grep` confirms `workflow.resolve` host call registered + schema-validated
- [ ] resolver test asserts: proposed fix applied to doc, contested finding left untouched, re-run drift converges, second re-audit blocked by cap
- [ ] no new dependencies in package.json

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs
4. Smoke: `timeout 60 pi -e ./extensions/forgery --print "hi"` → loads without crash

## Anti-Drift Rules
- Resolver uses the SAME engine as review/brainstorm/drift-report — no new engine code, no new engine concepts beyond the resolve host call
- Resolver is read-then-write on design documents only — never modifies source code under repair (drift-report detects; resolver fixes the doc, not the impl)
- One re-audit cap per finding — if drift still diverges after one fix cycle, record as accepted trade-off, do not loop forever
- No new npm dependencies; TypeScript-only kernel; TypeBox-validated args only

## Non-Goals (follow-up goal candidates)
- Auto-applying fixes without human classification decision
- Dedicated dashboard view for resolver results
- Applying fixes to source code (implementation side) — resolver edits design docs only

## Estimated Effort
Implementation: ~300 lines + tests. Audit: ~5 min.
