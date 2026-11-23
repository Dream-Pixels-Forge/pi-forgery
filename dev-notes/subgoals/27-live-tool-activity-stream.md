# SG-27 — Live Tool-Call Activity Stream in Widget & Dashboard

- **Status:** done
- **Priority:** P2
- **Area:** `src/activity/types.ts`, `src/ui/format.ts`, `src/ui/widget.ts`, `src/ui/dashboard.ts`

## Problem
Currently, agent rows only display a single truncated string for `current` activity (e.g. `reading src/auth.ts`). When an agent executes a sequence of tool calls (such as `grep` → `read` → `edit`), earlier steps are instantly overwritten, making it impossible to see an agent's progression or identify where it spent time.

## Evidence
- `src/ui/format.ts`: `agentRowCols` only displays `agent.current`, truncated to fit the flex column width.
- `src/activity/types.ts`: `ForgeryAgentRecord` tracks `turns` and `toolCalls`, but does not retain a recent history of tool call breadcrumbs.

## Proposed design
- Add `recentCalls?: Array<{ tool: string; target?: string; status: "running" | "done" | "failed" }>` to `ForgeryAgentRecord`.
- Update runner/activity store to track the last 3-5 sub-tool calls for active agents.
- Render breadcrumbs in the activity column when width allows:
  ```text
  ▌ ⠹ coder   [grep] ▸ [read: auth.ts] ▸ [edit: auth.ts]  t2  5  8.1k  $0.12
  ```
- Gracefully fall back to single-item current status on narrower terminals (< 90 columns).

## Acceptance criteria
- [x] Active agents show recent sequence breadcrumbs instead of a single static line.
- [x] Breadcrumbs indicate status (running vs completed) per tool badge.
- [x] Column width gracefully prioritizes the newest tool call on narrow viewports.

## Tests
- `tests/format.test.ts`: Verify `agentRowCols` formats tool call sequences with arrow connectors (`▸`).
- `tests/render.test.ts`: Verify responsive dropping of older breadcrumbs as width shrinks.
