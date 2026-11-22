---
title: pi-forgery
layout: default
permalink: /
---

# pi-forgery

An improved, focused programmable tool and agent runtime for Pi.

A focused programmable tool + agent runtime (TypeScript sandboxed execution,
agents/actors/mesh/councils, a native TUI dashboard). pi-forgery keeps the best,
most-used parts and drops the speculative heavy machinery so the extension stays
small, auditable, and cheap to boot.

## What pi-forgery gives you

| Feature | What it is |
|---------|-----------|
| `forgery_exec` | One flat tool the LLM calls with a small TypeScript program that composes Pi core tools + one-shot agents. Independent calls run in parallel; each call is schema-validated before it runs and recorded in the activity store. |
| One-shot agents | `agents.run` spawns a child `pi --print "<task>"` subprocess and returns the final text + usage. Runs appear in the activity surface. |
| Status line / footer | A custom footer component (`ctx.ui.setFooter`) showing git branch, context tokens/percent, and the active run's live metrics, plus a compact `setStatus("forgery", …)` slot so Pi's *built-in* footer also shows live state. |
| Activity widget | A compact box above the editor (like pi-supervisor) that auto-hides when idle and shows the active run's header + participant rows. Focus + expand reveals a transcript of the focused participant. |
| Terminal image + video | `pi.showImage` / `pi.showImages` / `pi.showVideo` draw media inline via the Kitty graphics protocol (Ghostty, Kitty, Warp, WezTerm, iTerm2). Falls back to a text path on unsupported terminals. |
| `/forgery` dashboard | A full-screen modal with an Activity view (phase panels + agent list, status filter, step between runs) and a Settings view. Open via `/forgery` or `ctrl+alt+f`. |

## Install

```
pi install /absolute/path/to/pi-forgery
```

or, for one development run:

```
pi -e /absolute/path/to/pi-forgery
```

The entry is `extensions/forgery/index.ts` (declared in
`extensions/forgery/package.json` → `pi.extensions`). Pi's loader
transpiles TS directly (jiti) — no build step required.

## Navigation

- [Usage](./usage.md)
- [Commands](./commands.md)
- [Host calls](./host-calls.md)
- [Status line / footer](./status-line.md)
- [Repository layout](./layout.md)
- [Development](./development.md)
- [Non-goals](./non-goals.md)
