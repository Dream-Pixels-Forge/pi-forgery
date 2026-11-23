# pi-forgery

A focused programmable tool & agent runtime for [Pi](https://github.com/Dream-Pixels-Forge/pi).

[![Tests](https://img.shields.io/badge/tests-252_passing-brightgreen)](https://github.com/Dream-Pixels-Forge/pi-forgery/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Pages](https://img.shields.io/badge/docs-github_pages-blue)](https://dream-pixels-forge.github.io/pi-forgery/)

pi-forgery gives Pi **one programmable execution tool** (`forgery_exec`), **one-shot agent runs**, a **live activity widget**, a **status-line footer**, **terminal image/video display**, and a full-screen **`/forgery` dashboard** — all driven by a single in-memory activity snapshot. It deliberately drops speculative heavy machinery to stay small, auditable, and cheap to boot.

---

## ✨ What it does

| Capability | What it gives you |
|------------|-------------------|
| **`forgery_exec`** | One flat tool the LLM calls with a TypeScript program composing Pi core tools and one-shot agents. Independent calls run in parallel; each call is schema-validated before execution. |
| **One-shot agents** | `agents.run` spawns a child Pi session in a subprocess and returns text + usage. Bounded concurrency, timeouts, and cost budgets. |
| **Model routing** | `agents.route` recommends the cheapest model that historically completes this kind of task, based on per-model outcome history stored in the activity store. |
| **Workflow chains** | `workflow.chain` composes pipelines sequentially, threading each step's consolidated artifact into the next step's target, with pause/abort gates between stages. |
| **Activity distill** | `activity.distill` mines completed runs for repeated host-call sequences and proposes them as named presets / reusable skills. |
| **Budget circuit breaker** | Mid-run cost enforcement: warn at 80% of `maxCostPerRun`, hard-stop at 100%. Surfaces as a priority-0 footer segment (`⚠ budget NN%`). |
| **Durable journal** | `workflow.resume` replays completed phases from `.pi/forgery/journal/` so long chains survive a Pi restart. |
| **Status line & footer** | Custom footer showing git branch, context tokens/percent, model, active run metrics, and budget alerts — mirrored into Pi's built-in footer slot. |
| **Activity widget** | Above-editor box that auto-hides when idle. Focus + expand reveals an inline activity transcript of the focused participant. |
| **Terminal media** | Images and video inline via the Kitty graphics protocol (Ghostty, Kitty, Warp, WezTerm, iTerm2). Text fallback on unsupported terminals. |

---

## 📦 Install

The repository-root `package.json` declares the extension entry:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

Or install directly:

```sh
pi install /absolute/path/to/pi-forgery
```

For a one-off development run without installing:

```sh
pi -e /absolute/path/to/pi-forgery/index.ts
```

---

## 🚀 Quick start

Open the dashboard:

```
/forgery
```

Run a Goldfish review pipeline against a document:

```
/forgery workflow review DESIGN.md
```

Chain pipelines sequentially (each step's artifact threads into the next):

```ts
workflow.chain({
  steps: [
    { pipeline: "bootstrap", target: "src/lib/auth.ts" },
    { pipeline: "drift-report" },                  // target threads from step 1
    { pipeline: "review", target: "DESIGN.md", gate: "pause" },
  ],
})
```

Display an image inline in the terminal:

```
/forgery image screenshot.png
```

Play a video inline in the terminal:

```
/forgery video recording.mp4
```

Route an agent task to the cheapest historically-viable model:

```ts
const route = await agents.route({ task: "write a unit test for the auth module" });
// → { model: "claude-haiku", reason: "...", expectedCost: 0.02, historicalPassRate: 0.9 }
```

Set a cost budget and watch the footer alert:

```ts
cost.budget({ maxCostPerRun: 1.00, warningThreshold: 0.8 });
// Footer shows "⚠ budget 85%" at 80%, hard-stops at 100%
```

Resume an interrupted chain:

```ts
workflow.resume({ chainId: "run-abc123" });
// → { status: "resumable", completedSteps: [...], nextStep: 2, gate: "proceed" }
```

---

## 📚 Documentation

Full documentation lives in [`docs/`](./docs/) and is published to [GitHub Pages](https://dream-pixels-forge.github.io/pi-forgery/):

| Doc | Description |
|-----|-------------|
| [Usage](./docs/usage.md) | `forgery_exec` programs, media display, quick start |
| [Commands](./docs/commands.md) | All `/forgery` subcommands + keyboard shortcuts |
| [Host Calls](./docs/host-calls.md) | `pi.showImage`, `pi.showImages`, `pi.showVideo`, image protocol override |
| [Status Line / Footer](./docs/status-line.md) | Footer segments, context gauge, CI status, budget alerts |
| [Repository Layout](./docs/layout.md) | File placement and project structure |
| [Development](./docs/development.md) | Typecheck, build, test, release workflows |
| [Non-Goals](./docs/non-goals.md) | What pi-forgery deliberately does *not* do |
| [Activity Distill](./docs/activity.md) | Pattern mining → preset synthesis from run history |
| [Budget Circuit Breaker](./docs/budget.md) | Mid-run cost enforcement and footer segment |
| [Workflows](./docs/workflows.md) | `workflow.chain`, `workflow.gate`, `workflow.resume` |

---

## 🛠️ Development

```sh
cd /absolute/path/to/pi-forgery
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

Quality gates:

```sh
pnpm run --silent typecheck   # exit 0
pnpm test                     # all pass, 0 fail
pnpm run build                # emits dist/
```

---

## 🛡️ License

pi-forgery is [MIT licensed](./LICENSE).

Copyright (c) 2026 Dream Pixels Forge.

---

## 🔗 Links

- [GitHub Repository](https://github.com/Dream-Pixels-Forge/pi-forgery)
- [Documentation Site](https://dream-pixels-forge.github.io/pi-forgery/)
- [Issue Tracker](https://github.com/Dream-Pixels-Forge/pi-forgery/issues)
- [Pi Agent Framework](https://github.com/Dream-Pixels-Forge/pi)

---

*Built for [Pi](https://github.com/Dream-Pixels-Forge/pi) — the terminal-native agent framework. One programmable tool, not a kitchen sink.*
