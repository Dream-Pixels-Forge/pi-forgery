# Goal: Gate 5 — Honesty audit of UI-rendered values

## Objective
Verify that every value rendered in pi-forgery's footer, activity widget, and dashboard comes from the activity store or the live `ctx` — no fabricated telemetry — satisfying original acceptance Gate 5.

## Context
pi-forgery renders git branch, context tokens/percent, live run metrics, agent status/turns/toolCalls, and cost/duration in the widget, footer, and dashboard. Gate 5 demands these values are sourced from `ForgeryActivityStore` or `ExtensionContext`, never hardcoded or randomly generated.

## Deliverables (all complete)
- [x] `dev-notes/HONESTY.md` — audit report listing every rendered value in widget/footer/dashboard, its source (activity store field or ctx field), and verdict (honest / fabricated)
- [x] Zero fabricated/telemetry values found in widget.ts, footer.ts, dashboard.ts, controller.ts — no changes required
- [x] `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` → all pass, 0 fail

## Definition of Done (all met)
- [x] `dev-notes/HONESTY.md` exists with per-value source mapping
- [x] Zero fabricated/telemetry values remain in widget.ts, footer.ts, dashboard.ts, controller.ts
- [x] `npm run --silent typecheck` → exit 0
- [x] `npx tsx --test tests/*.test.ts` → all pass, 0 fail

## Verification Steps (all passed)
1. `grep -rn "Math.random\|Date.now\(\).*hardcode\|0\.\|100\.\|fixed" extensions/forgery/src/ui/` — no fake numbers found
2. Read `src/ui/widget.ts`, `src/ui/footer.ts`, `src/ui/dashboard.ts`, `src/ui/controller.ts` — traced every rendered string/number to `store.snapshot()` or `ctx`
3. `npm run --silent typecheck` → exit 0
4. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → 81/81 pass

## Anti-Drift Rules followed
- Audit + surgical fix goal — no new UI features added
- No fabrication found, so no fixes needed
- Test expectations not modified
- Read-only audit; no code changes required

## Non-Goals
- Adding new telemetry/metrics collection
- Building a metrics backend
- Dashboard UI redesign

## Estimated Effort
~1-2 hours code review + audit doc. Verification: ~10 min.

## Audit Result
**PASS — All 80+ rendered values across footer, widget, dashboard, controller trace to ForgeryActivityStore, ExtensionContext, git CLI, or gh CLI. Zero fabricated telemetry.**
