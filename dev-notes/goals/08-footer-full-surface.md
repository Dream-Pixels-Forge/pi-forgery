# Goal: Footer surface shows full context (v0.3)

## Objective
Upgrade pi-forgery's status-line footer to show rich context: model name (short form), thinking effort, working directory (basename only), context progress bar + percent, tokens used/remaining, compact count (1/5), issues (open/closed), PRs (open/closed), CI status — alongside existing git branch and active run info.

## Context
pi-forgery's footer currently shows only git branch, context tokens/percent, and active run status. Users want a richer status line that shows model identity, thinking effort, working directory, token budget with progress bar, compact countdown, and issue/PR/CI status — all sourced from the Pi `ExtensionContext` where available, gracefully degrading when data is unavailable.

## Deliverables
- [ ] `src/ui/footer.ts` — `ForgeryFooterContext` gains new fields: `modelName`, `effort`, `workingDir`, `contextTokensMax`, `compactCount`, `compactMax`, `issuesOpen`, `issuesClosed`, `prsOpen`, `prsClosed`, `ciStatus`
- [ ] `src/ui/footer.ts` — `render()` produces a dense single-line (or two-line when narrow) status line with all segments
- [ ] `src/ui/controller.ts` — populates all new context fields from `ExtensionContext` (model name extracted from modelId, working dir basename, etc.)
- [ ] `src/ui/footer.ts` — `statusString()` mirrors compact version into `ctx.ui.setStatus("forgery", …)`
- [ ] `tests/workflow.test.ts` — add footer render tests covering all fields
- [ ] `README.md` + `SKILL.md` — document new footer surface
- [ ] Branch `feat/forgery-footer-full`, PR opened, typecheck + all tests green locally

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail (59+ new footer tests)
- [ ] `grep -rn "console.error\|console.warn" extensions/forgery/src/ui/` → no unhandled crashes from missing git repo or missing context data
- [ ] `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/`
4. Smoke: `timeout 60 pi -e ./extensions/forgery --print "hi"` → loads without crash (even outside git repo)

## Anti-Drift Rules
- All values come from `ForgeryFooterContext` (host-provided) — never fabricated
- Missing data renders as `—` or is omitted gracefully, never crashes
- Model name is short form only (strip org prefix): `minimax/minimax-m3.1-flash` → `minimax-m3.1-flash`
- Working directory is basename only: `/home/user/project` → `project`
- Context bar uses filled/empty block characters proportional to percent
- Compact counter shows `used/max` (default max 5) with handoff warning at 5
- CI status colors: green=green, failed=red, pending=yellow
- No new npm dependencies

## Non-Goals
- GitHub API fetching for issues/PRs/CI (data comes from host context)
- Dedicated dashboard view for footer data
- Persistent storage of issue/PR counts

## Estimated Effort
~1 hour (footer rewrite + controller updates + tests)
