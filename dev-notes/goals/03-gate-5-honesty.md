# Goal: Gate 5 — Honesty audit of UI-rendered values

## Objective
Verify that every value rendered in pi-forgery's footer, activity widget, and dashboard comes from the activity store or the live `ctx` — no fabricated telemetry — satisfying original acceptance Gate 5.

## Context
pi-forgery renders git branch, context tokens/percent, live run metrics, agent status/turns/toolCalls, and cost/duration in the widget, footer, and dashboard. Gate 5 demands these values are sourced from `ForgeryActivityStore` or `ExtensionContext`, never hardcoded or randomly generated. This is a code-review + spot-check goal, not a feature addition.

## Deliverables
- [ ] `dev-notes/HONESTY.md` — audit report listing every rendered value in widget/footer/dashboard, its source (activity store field or ctx field), and verdict (honest / fabricated)
- [ ] Any fabricated values found are either removed or re-wired to the store/ctx (fixes committed as part of this goal if discovered)
- [ ] Confirmation that `ForgerySnapshot` fields used by UI map 1:1 to rendered text (no computed/fake numbers)

## Definition of Done
- [ ] `dev-notes/HONESTY.md` exists with per-value source mapping
- [ ] Zero fabricated/telemetry values remain in widget.ts, footer.ts, dashboard.ts, controller.ts
- [ ] `npm run --silent typecheck` → exit 0 (no type regressions from any fixes)
- [ ] `npx tsx --test tests/*.test.ts` (extensions/forgery) → all pass, 0 fail

## Verification Steps
1. `grep -rn "Math.random\|Date.now\(\).*hardcode\|0\.\|100\.\|fixed" extensions/forgery/src/ui/` — inspect for fake numbers
2. Read `src/ui/widget.ts`, `src/ui/footer.ts`, `src/ui/dashboard.ts`, `src/ui/controller.ts` — trace each rendered string/number to `store.snapshot()` or `ctx`
3. `npm run --silent typecheck` → exit 0
4. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass

## Anti-Drift Rules
- This is an audit + surgical fix goal — do not add new UI features
- If a value is fabricated, either remove it or wire it to the real store field; do not invent a new metric
- Do not modify test expectations to hide fabrication
- Read-only by default; changes only where fabrication is confirmed

## Non-Goals (follow-up goal candidates)
- Adding new telemetry/metrics collection
- Building a metrics backend
- Dashboard UI redesign

## Estimated Effort
Implementation: ~1-2 hours code review. Verification: ~10 min.
