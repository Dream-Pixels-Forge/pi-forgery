# pi-forgery

An improved, focused reimplementation of [fabric-runtime/pi-fabric](https://github.com/fabric-runtime/pi-fabric) for Pi.

pi-fabric is a *very* large programmable tool + agent runtime (TypeScript/Python
sandboxed execution, agents/actors/mesh/councils, a native TUI dashboard,
verified proof kernels). pi-forgery keeps pi-fabric's best, most-used parts and
drops the speculative heavy machinery so the extension stays small, auditable,
and cheap to boot.

## What pi-forgery gives you

| Feature | What it is |
|---------|-----------|
| `forgery_exec` | One flat tool the LLM calls with a small TypeScript program that composes Pi core tools + one-shot agents. Independent calls run in parallel; each call is schema-validated before it runs and recorded in the activity store. |
| One-shot agents | `agents.run` spawns a child `pi --print "<task>"` subprocess and returns the final text + usage. Runs appear in the activity surface. |
| Status line / footer | A custom footer component (`ctx.ui.setFooter`) showing git branch, context tokens/percent, and the active run's live metrics, plus a compact `setStatus("forgery", …)` slot so Pi's *built-in* footer also shows live state. |
| Activity widget | A compact box above the editor (like pi-supervisor) that auto-hides when idle and shows the active run's header + participant rows. Focus + expand reveals a transcript of the focused participant. |
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

## Usage

You ask in plain language. Pi writes one `forgery_exec` program that composes
the required tools and agents:

```ts
// A forgery_exec program the model can author
const [manifest, sources] = await Promise.all([
  pi.read({ path: "package.json" }),
  pi.find({ pattern: "**/*.ts", path: "src" }),
]);
return {
  package: JSON.parse(manifest).name,
  sourceCount: sources.split("\n").filter(Boolean).length,
};
```

Independent calls run in parallel. `agents.run` spawns one-shot Pi
subprocesses for tasks that need their own context.

### Commands

| Command | Effect |
|---------|--------|
| `/forgery` | Open the dashboard (Activity view) |
| `/forgery status` | Print a compact config + activity summary |
| `/forgery agents` | List recorded one-shot agents |
| `/forgery log <agent-id>` | Show one agent's transcript |
| `/forgery stop <agent-id>` | Stop one running agent |
| `/forgery settings` | Read-only host-call + agent runner config |

### Shortcuts

| Shortcut | Effect |
|----------|--------|
| `ctrl+alt+f` | Open the dashboard |
| `ctrl+alt+e` | Focus the activity widget (expand a participant) |

## Status line / footer

When a run is active the footer shows:

```
⎇ main · ctx 42% · 21.3k tok · claude-sonnet · ◐ demo · 12 calls · 1.2k tok · $0.42 · 3m12s
```

Every value comes from the live activity store or the host context — no
fabricated telemetry. When the custom footer slot is reclaimed by another
extension, the compact status string is mirrored into
`setStatus("forgery", …)` so Pi's built-in footer still shows it.

## What pi-forgery does NOT do

- No durable-residency actors, mesh topics, councils, recursion graphs.
- No speculative PTC, prompt-cache warming, entropy/proof certifiers.
- No Python/Monty execution kernel (TypeScript only; a Python kernel is a
  follow-up opt-in flag).
- No separate provider registry or MCP bridge.
- No Bend verified policy kernels.

These are the parts of pi-fabric that add large native dependencies and
startup cost without helping the "programmable tool + live status" goal.

## Repository layout

```
pi-forgery/
├── extensions/forgery/
│   ├── index.ts            # extension factory (default export)
│   ├── package.json        # pi.extensions entry + peer deps
│   ├── tsconfig.json
│   ├── src/
│   │   ├── activity/       # data model + in-memory store (source of truth)
│   │   │   ├── types.ts
│   │   │   └── store.ts
│   │   ├── agents/
│   │   │   └── runner.ts   # one-shot agent subprocess runner
│   │   ├── exec/
│   │   │   ├── runtime.ts  # program execution + host proxy + bridging
│   │   │   ├── schemas.ts  # TypeBox schemas for host calls
│   │   │   └── tool.ts     # forgery_exec ToolDefinition
│   │   └── ui/
│   │       ├── format.ts   # pure text presenters
│   │       ├── footer.ts   # status-line footer component
│   │       ├── widget.ts   # above-editor activity widget
│   │       ├── dashboard.ts# /forgery modal
│   │       └── controller.ts # mount/refresh orchestration
│   └── tests/
│       ├── store.test.ts
│       ├── format.test.ts
│       └── runtime.test.ts
├── dev-notes/              # GOAL / SPEC / PROGRESS / DECISIONS
├── package.json            # thin root wrapper
└── README.md
```

## Development

```sh
cd extensions/forgery
npm install              # installs tsx + @types/node; links host types
npm run typecheck        # npx tsc --noEmit
npm test                 # npx tsx --test tests/*.test.ts
```

Typecheck and tests run against the sibling Pi host's `@earendil-works/*`
type declarations. No network, no native dependencies.
