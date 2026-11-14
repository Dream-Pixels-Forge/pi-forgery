# Goal: Non-Anthropic Cache Pricing — OpenAI + Google cache read/write pricing

## Objective
Add cache read/write pricing entries for OpenAI (`gpt-4o`, `gpt-4o-mini`) and Google (`gemini-*`) models to `DEFAULT_MODEL_PRICING`, completing the cost-management system (today only Anthropic models have cache pricing).

## Context
Documented known limitation (HANDOFF.md #4). The cost-management data model already supports `cacheReadPer1k`/`cacheWritePer1k`; only Anthropic rows are populated. Filling in OpenAI and Google cache pricing makes cost estimates and optimization recommendations accurate for non-Anthropic users. Pure data addition.

## Deliverables
- [ ] `src/agents/cost-manager.ts` — `cacheReadPer1k`/`cacheWritePer1k` for `gpt-4o`, `gpt-4o-mini`, `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash` (+~15 lines)
- [ ] `extensions/forgery/tests/cost-manager.test.ts` — cache-pricing unit tests for OpenAI/Google (+~15 lines)
- [ ] `skills/pi-forgery-mastery/REFERENCE.md` — update model-pricing table

## Definition of Done
- [ ] root `npm run --silent typecheck` → exit 0
- [ ] All cost-manager tests pass including new cache-pricing cases
- [ ] `cost.estimate` for `gpt-4o` with cache tokens returns a cache-inclusive total matching hand-computed math

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass
3. `git diff main --stat` → changes confined to `extensions/forgery/` + docs

## Anti-Drift Rules
- Pure data addition: no logic changes, only pricing table entries
- Keep existing Anthropic entries unchanged

## Non-Goals (follow-up goal candidates)
- Adding new model families beyond OpenAI/Google
- Dynamic pricing fetch from provider APIs

## Estimated Effort
Implementation: ~30 lines + tests. Audit: ~2 min.
