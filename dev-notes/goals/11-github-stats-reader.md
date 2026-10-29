# Goal: Add GitHub stats reader (issues + PRs + CI)

## Objective
Wire the footer's `issues`, `PRs`, and `CI` segments to a `GitHubStatsReader` that reads from the `gh` CLI, gracefully degrading to `null` when `gh` is unavailable or not in a repo.

## Context
The footer's `issuesOpen`/`issuesClosed`/`prsOpen`/`prsClosed`/`ciStatus` fields all returned `null` because no source existed. The `ExtensionContext` does not expose GitHub data, so a dedicated `gh`-backed reader is needed.

## Deliverables
- [ ] `src/git/githubStats.ts` — `GitHubStatsReader` class with injectable `exec` function
- [ ] `issuesOpen()` / `issuesClosed()` via `gh issue list --state open|closed --json number --jq 'length'`
- [ ] `prsOpen()` / `prsClosed()` via `gh pr list --state open|closed --json number --jq 'length'`
- [ ] `ciStatus()` via `gh run list --limit 1 --json status --jq '.[0].status'`, mapped to `pending`/`failed`/`green`/`nit`/`null`
- [ ] Results throttled (2s cache) so the footer can read every render
- [ ] Controller wires all five fields into `ForgeryFooterContext`
- [ ] Unit tests with injectable `exec` (counts, failure → null, status mapping, throttle)

## Definition of Done
- [ ] `npm run --silent typecheck` → exit 0
- [ ] `npx tsx --test tests/*.test.ts` → all pass, 0 fail
- [ ] `gh` unavailable → all fields return `null`, never throws

## Verification Steps
1. `npm run --silent typecheck` → exit 0
2. `cd extensions/forgery && npx tsx --test tests/*.test.ts` → all pass

## Anti-Drift Rules
- Never throws — returns `null` on any failure
- Results cached for 2s to avoid shelling out every frame
- `gh` CLI only; no GitHub API token handling, no `@octokit` dependency
- No new npm dependencies

## Non-Goals
- GitHub REST API directly (use `gh` CLI)
- Auth token management
- Persistent caching beyond the 2s throttle

## Estimated Effort
~45 minutes
