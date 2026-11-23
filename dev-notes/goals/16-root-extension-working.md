## Goal: Complete the root extension layout migration

### Objective
Make the root version of pi-forgery install, test, build, and load through `index.ts` while preserving the merged status-line telemetry.

### Context
Issue #16 tracks the existing relocation from `extensions/forgery/*` to the repository root. Root tests currently pass 266/268, with two contradictory `shortenCwd` expectations; the root dependency manifest/lockfile are empty and CI still installs the deleted nested package.

### Deliverables
- [ ] Root `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` provide reproducible dependencies and explicit build policy.
- [ ] `.github/workflows/ci.yml` installs and validates the root package.
- [ ] `tests/format.test.ts` and `tests/render.test.ts` consistently specify basename cwd rendering with exact home as `~`.
- [ ] `README.md`, `docs/development.md`, `docs/layout.md`, and `docs/index.html` describe the root entrypoint/workflow.
- [ ] The existing root relocation retains all status-line and metric behavior merged in #14.

### Definition of Done
- [ ] Clean `pnpm install --frozen-lockfile` succeeds at root without network-fetched placeholder tools.
- [ ] `pnpm run typecheck`, all 268 tests, and `pnpm run build` pass; `dist/index.js` exists.
- [ ] Root `index.ts` loads in the real Pi host using the explicit smoke command.
- [ ] Active docs/config contain no instructions that depend on the deleted nested extension path.
- [ ] No dependency upgrades, new features, automatic merge, or rewrites of historical dev-notes.

### Verification Steps
1. Remove ignored `node_modules` and run `CI=true pnpm install --frozen-lockfile` from the root.
2. Run `pnpm run typecheck`, `pnpm test`, and `pnpm run build`; require zero failures and confirm `dist/index.js`.
3. Run `timeout 60 pi --no-extensions --no-session -e /home/dimona/Dream-Pixels-Forge/Dev/extension/pi-forgery/index.ts --print "Reply with OK"`.
4. Inspect active docs/workflow paths, the diff, and independent review evidence before opening the PR.

### Anti-Drift Rules
- Preserve the current root relocation and all merged telemetry behavior.
- Update only the two inconsistent cwd expectations; do not change `shortenCwd` production behavior.
- Keep the prior nested lockfile deleted and use pnpm at root.
- Do not merge without the user's approval after green CI.

### Estimated Effort
Medium: packaging/CI completion, two test corrections, active documentation, and clean-host verification.
