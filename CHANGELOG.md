# Changelog

All notable changes to pi-forgery are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] — 2026-11-24

### Added
- `/forgery distill` CLI subcommand — mine completed runs for repeated host-call patterns (n-grams) directly from the terminal, with optional `min-occurrences`, `window-days`, and `n` args (Goal 38)
- `CONTEXT.md` — shared language / ubiquitous language for the extension (AGENTS.md mandate)

### Fixed
- Issue #27: connect budget config, accounting, and execution abort — single shared `CostManager` injected across basic/enhanced/dev-loop/routing/UI paths; provider-total-aware cost accounting; hard-budget abort callback with pre-spawn checks; `forgery_exec` aborts at the hard budget and prevents the next spawn

## [0.4.0] — 2026-11-24

### Added
- `forgery_exec` programmable tool + one-shot agent runs (`agents.run`)
- Live activity widget (above editor) + status-line footer
- Full-screen `/forgery` dashboard (Activity + Settings views)
- Activity query host calls (`activity.snapshot`, `activity.runs`, `activity.agents`, `activity.subgoals`)
- Dry-run / validation-only mode (`dryRun`)
- Activity export & replay (`activity.export`, `activity.import`)
- Non-Anthropic cache pricing (OpenAI + Google)
- Workflow chain (`workflow.chain`) + pause/abort gates
- Budget circuit breaker (warn at 80%, hard-stop at 100%)
- Agent model routing (`agents.route`)
- Subgoal progress tracking across UI
- Terminal image/video display (Kitty graphics protocol)
- Durable cross-session persistence (auto save/load activity snapshot)
- Cross-session persistence auto-load on `session_start`, auto-save on `session_shutdown`
