# DECISIONS.md — pi-forgery

## 2026-06-15: Local DPF extension layout (not a compiled dist layout)
- **Decision:** Extend `extensions/forgery/index.ts` as the entry, with its
  own `package.json` declaring `pi.extensions: ["./index.ts"]` and the
  `@earendil-works/pi-coding-agent` + `@earendil-works/pi-tui` + `typebox`
  peers. Root repo has a thin `package.json` pointing `main` at the entry.
- **Rationale:** Matches pi-songsy, pi-prides, pi-brandly, pi-memorius in this
  workspace. No esbuild/bun build step required; Pi's loader transpiles TS
  directly (jiti). Simpler to review and cheaper to boot.
- **Alternatives considered:** a compiled `dist/extension-bootstrap.js` layout
  compiled layout (rejected: heavyweight, needs `bun run build` + proof
  artifacts, pulls in esbuild).
- **Impact:** `package.json` at repo root + `extensions/forgery/package.json`.
- **Decided by:** orchestrator.

## 2026-06-15: TypeScript-only execution kernel
- **Decision:** `forgery_exec` runs `new Function` program bodies with a
  validated `pi` host-proxy whitelist. No QuickJS, no Monty, no CPython.
- **Rationale:** QuickJS/Monty kernels are the single largest
  dependency and are not needed for the "improved version" goal. The host
  already provides `pi.read/bash/edit/...` — composing those is the actual
  value. Keeps the surface auditable.
- **Alternatives considered:** QuickJS sandbox (rejected: 50MB+ native
  blob, startup cost), child-process `tsx` eval (rejected: no isolation,
  still needs a TS loader).
- **Impact:** `exec/runtime.ts` is ~250 lines. A Python kernel is a future
  opt-in flag, not in this increment.
- **Decided by:** orchestrator.

## 2026-06-15: Footer surface = custom setFooter + setStatus slot
- **Decision:** Render a custom footer component via `ctx.ui.setFooter(...)`
  showing branch / context / active run / cost, AND mirror a compact status
  string into `ctx.ui.setStatus("forgery", text)` so Pi's built-in footer
  also shows live run status when another extension overrides the footer.
- **Rationale:** Covers both "footer" and "status line" naming the user
  asked for, with no loss if a third-party extension reclaims the footer.
- **Alternatives considered:** statusLine-only (rejected: no token/branch
  context in built-in footer), widget-only (rejected: doesn't match "footer").
- **Impact:** `ui/footer.ts` + controller `start`/`stop`.
