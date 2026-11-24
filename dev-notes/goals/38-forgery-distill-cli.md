# Goal: Add `/forgery distill` CLI subcommand

## Objective
Expose the existing `activity.distill` host call through the `/forgery distill` CLI subcommand so users can see repeated host-call patterns (n-grams) without writing a `forgery_exec` program.

## Context
`activity.distill` is implemented in `src/activity/distill.ts` and registered as the `activity.distill` host call in `src/exec/tool.ts`, but there is no `/forgery distill` subcommand in `index.ts`. Users must write a `forgery_exec` program to mine patterns. Adding the CLI subcommand makes it directly accessible from the terminal, consistent with existing subcommands (`image`, `video`, `export`, `import`, `settings`, `image-protocol`).

## Deliverables
- [ ] `/forgery distill` subcommand case in `index.ts` command handler
- [ ] Optional positional/flag args: `min-occurrences`, `window-ms`, `n` (ngram length)
- [ ] Output: distilled patterns (pattern, occurrences, avg cost, avg duration, suggested name) or empty message
- [ ] Tests for the new CLI integration
- [ ] All existing tests still pass (no regressions)

## Definition of Done
- [ ] `/forgery distill` returns distilled patterns when completed runs exist
- [ ] `/forgery distill` reports "no completed runs" when none exist
- [ ] `/forgery distill min-occurrences 3` applies the filter
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail
- [ ] `npm run build` → exit 0

## Verification Steps
1. Add `/forgery distill` case to `index.ts` command handler
2. Write tests verifying the distill CLI path (mocking `ctx.ui.notify`)
3. `npx tsc --noEmit` → exit 0
4. `npx tsx --test tests/*.test.ts` → all pass
5. `npm run build` → exit 0

## Anti-Drift Rules
- Only add the `distill` subcommand; do not refactor existing command handling.
- Do not change the `activity.distill` host call implementation or `distill()` function.
- Do not add new dependencies.
- Stay within scope: CLI exposure only, no new host calls.

## Estimated Effort
Small: ~1 hour.
