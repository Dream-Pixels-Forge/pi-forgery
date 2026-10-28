# Goal: EGM Bootstrap Preset — recursive codebase docs + sentinel blocks

## Objective
Add a `bootstrap` pipeline preset to pi-forgery's workflow engine, replicating EGM's `egm-bootstrap`: recursive bottom-up codebase documentation generation that produces Interface/Invariants/Side-Effects README contracts and upserts sentinel blocks in source files.

## Context
pi-forgery's workflow engine (commits 3985e32, 2bc6c3a, 9387b75) runs pipelines as fresh zero-context `pi --print` subprocesses. The bootstrap preset is the third EGM preset (after review, brainstorm, drift-report): it walks the codebase bottom-up, documents each module's interface/invariants/side-effects, and inserts sentinel comment blocks so future drift detection can verify docs match code.

## Deliverables
- [ ] `src/workflow/pipelines.ts` — add `BOOTSTRAP_PIPELINE` (phases: scan modules → document interface → document invariants → document side-effects → upsert sentinel blocks; targetStrategy "full") registered in PIPELINES map
- [ ] `src/workflow/personas/*-bootstrap.md` — 3-4 personas adapted from EGM bootstrap (Apache-2.0 attribution): interface-doc, invariants-doc, side-effects-doc, sentinel-upsert
- [ ] `src/workflow/standards/bootstrap.md` — bootstrap standard doc
- [ ] `src/workflow/bootstrap-runner.ts` — bootstrap logic: enumerate `src/**/*.ts`, for each module run interface/invariants/side-effects phases, upsert sentinel blocks (`/// @forgery-bootstrap interface=... invariants=... sideEffects=...`)
- [ ] `tests/workflow.test.ts` — add bootstrap tests (fake AgentRunner: pipeline registration, phase count, sentinel block upsert) — total tests must stay green
- [ ] README.md + SKILL.md — short "bootstrap" section

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail
- [ ] `grep` confirms bootstrap pipeline + personas + standard bundled
- [ ] bootstrap test asserts: pipeline runs N phases, sentinel blocks upserted to a temp doc, no source files modified unexpectedly
- [ ] no new dependencies in package.json

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs
4. Smoke: `timeout 60 pi -e ./extensions/forgery --print "hi"` → loads without crash

## Anti-Drift Rules
- Bootstrap uses the SAME engine — no new engine code, no new host calls
- Sentinel block upsert is read-then-write on source files — insert only `/// @forgery-bootstrap` comment blocks, never rewrite logic
- One pass per module — do not loop; if a module can't be documented, skip and record
- No new npm dependencies; TypeScript-only kernel; TypeBox-validated args only

## Non-Goals (follow-up goal candidates)
- Full codebase documentation generation (out of scope; preset scaffolds the pipeline)
- Auto-fixing docs that drift from code
- Dedicated dashboard view for bootstrap results

## Estimated Effort
Implementation: ~400 lines + tests. Audit: ~5 min.
