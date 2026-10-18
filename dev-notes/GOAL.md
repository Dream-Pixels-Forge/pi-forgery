# GOAL.md — pi-forgery

## Project Vision

pi-forgery is a focused, cleaner reimplementation of the best parts of
[fabric-runtime/pi-fabric](https://github.com/fabric-runtime/pi-fabric), a
"programmable tool and agent runtime for Pi." It gives Pi one flat
execution tool (`forgery_exec`) plus one-shot agent runs, a live activity
widget above the editor, a rich footer/status-line component, and a full-screen
`/forgery` dashboard modal — all driven by a single in-memory activity
snapshot. It deliberately drops pi-fabric's speculative machinery (Bend proof
kernels, durable-residency actor mesh, councils, Jev, speculative PTC,
entropy certifiers, prompt-cache warming) to stay small, auditable, and cheap
to boot.

## Verification Gates

- [ ] Gate 1 (typecheck): `npx tsc --noEmit` passes on the extension.
- [ ] Gate 2 (tests): full unit suite green (store, snapshot, format, exec-tool contract, agent runner, footer/widget renderers).
- [ ] Gate 3 (build): `npm run build` produces a clean `dist/` bundle that Pi can load.
- [ ] Gate 4 (install): `pi install <path>` or `pi -e` reports the extension loads with no errors and registers `forgery_exec`, `/forgery`, the widget, and the footer.
- [ ] Gate 5 (honesty): every value rendered in the footer/widget/dashboard comes from the activity store or the live `ctx` — no fabricated telemetry.

## Acceptance Criteria

### Feature: forgery_exec (programmable tool)
- [ ] A single tool the LLM can call with a `code` string that composes Pi core tools.
- [ ] The program can call `pi.read`, `pi.bash`, `pi.edit`, `pi.write`, `pi.find`, `pi.grep`, `pi.ls` plus `agents.run` for one-shot agents, with independent calls running in parallel.
- [ ] Static schema validation of host calls before execution (no arbitrary property access on a god object).
- [ ] Each host call is recorded into the activity store as a call/phase/item.
- [ ] Returns the program's return value (JSON) to the conversation; failures return structured error.

### Feature: one-shot agents
- [ ] `agents.run({task, ...})` runs a child Pi session in a subprocess and returns `text` + `value` + `usage`.
- [ ] Runs appear in the activity snapshot as agents with status/turns/toolCalls.
- [ ] Bounded concurrency + timeout.

### Feature: status line / footer
- [ ] A custom footer component that always shows git branch, context tokens/percent, and one compact live status derived from the active run.
- [ ] A `setStatus` slot so other extensions see live run status in Pi's built-in footer.
- [ ] Token formatting (1.2k, 12.3k) and branch fallback ("no-repo"/"detached").

### Feature: activity widget (above editor)
- [ ] A compact widget auto-hidden when idle; visible while a run is active or recently completed.
- [ ] Header row with run glyph + aggregate metrics (calls, phase, agents, shells, tokens, cost, duration).
- [ ] Participant rows (active agents first) with current tool / status.
- [ ] Focus + expand shows an inline 12-row activity transcript of the focused participant.

### Feature: /forgery dashboard
- [ ] `/forgery` opens a full-screen modal with an Activity view and a Settings view.
- [ ] Activity view: phase panels + entity list, status filter, step between runs, entity detail.
- [ ] Subcommands: `dashboard`, `status`, `agents`, `log <id>`, `stop <id>`.
- [ ] Openable via shortcut (ctrl+alt+f).

## Non-Goals
- No durable-residency actors, mesh topics, councils, recursion graphs.
- No speculative PTC, prompt-cache warming, entropy/proof certifiers.
- No Python/Monty kernel (TypeScript only; Python is a follow-up).
- No separate provider registry or MCP bridge (single `pi` host).
- No CI publishing pipeline (out of scope for this increment).
