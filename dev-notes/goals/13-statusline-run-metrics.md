## Goal: Keep run metrics in the compact status line

### Objective
Show consistent call, token, cost, duration, and subgoal telemetry for active and recent runs in both the custom footer and Pi's built-in status slot.

### Context
The custom footer and compact status formatter currently derive run telemetry separately, and the compact status drops all metrics when a run finishes. Issue #13 tracks the user request without disturbing the in-progress repository layout migration.

### Deliverables
- [ ] `src/activity/store.ts` keeps run metrics canonical across `updateCall` and `finishCall` without double counting.
- [ ] `src/ui/format.ts` summarizes and formats active/recent run telemetry.
- [ ] `src/ui/footer.ts` uses the shared telemetry formatting.
- [ ] `tests/store.test.ts`, `tests/format.test.ts`, and `tests/render.test.ts` cover the new behavior.
- [ ] `docs/status-line.md` documents active and recent status output.

### Definition of Done
- [ ] Active and recent runs expose call count, tokens, non-zero cost, and duration.
- [ ] Direct run usage, `updateCall` metrics, and `finishCall` metrics combine correctly without masking or double counting; an undefined metric update is a no-op that preserves the last known baseline.
- [ ] Concurrent active runs never mix identities, durations, metrics, or subgoals.
- [ ] Subgoal progress appears when subgoals exist.
- [ ] Call labels are `1 call` and `N calls`; zero cost is omitted.
- [ ] Custom footer and compact status use the same summary data.
- [ ] Focused regression tests pass after failing before implementation.
- [ ] Changes are limited to status-line code, tests/fixtures, documentation, and this goal/audit record; no dependencies are added.

### Verification Steps
1. Run the focused store/format/render tests with `npx tsx --test --test-name-pattern='status|metrics|telemetry|call' tests/store.test.ts tests/format.test.ts tests/render.test.ts`.
2. Run `npx tsx --test tests/store.test.ts tests/format.test.ts tests/render.test.ts tests/ui-golden.test.ts` and account for the pre-existing `shortenCwd` failures separately.
3. Run `npx --yes --package typescript@5.9.3 tsc --noEmit` and compare any failures with the recorded baseline.
4. Inspect `git diff` and the rendered fixture text for active and completed runs.

### Anti-Drift Rules
- Preserve unrelated staged layout changes and all existing tests.
- Do not modify `shortenCwd` or its pre-existing failing tests.
- Do not add packages, remote telemetry, storage, or new footer surfaces.
- Do not claim completion without an independent goal-met audit.

### Estimated Effort
Small: one shared formatter, one footer call site, focused tests, and documentation.
