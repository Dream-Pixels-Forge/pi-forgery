# Development

```sh
cd extensions/forgery
npm install              # installs tsx + @types/node; links host types
npm run typecheck        # npx tsc --noEmit
npm test                 # npx tsx --test tests/*.test.ts
```

Typecheck and tests run against the sibling Pi host's `@earendil-works/*`
type declarations. No network, no native dependencies.

## Key implementation notes

- **Host call validation**: every `pi.*` and `agents.*` call is validated
  against a TypeBox schema before execution (`src/exec/runtime.ts`).
- **Activity bridging**: each host call is recorded into the activity store
  so the widget/dashboard show live progress.
- **Parallel execution**: independent calls run via `Promise.all`.
- **Media rendering**: Kitty graphics protocol escape sequences are written
  to `process.stdout`; non-PNG images are transcoded via `convertToPng` from
  `@earendil-works/pi-coding-agent`; video frames are extracted with ffmpeg.
- **Footer updates**: `refresh()` re-mounts the footer factory so the TUI
  re-renders on every activity-store/agent-revision change.
