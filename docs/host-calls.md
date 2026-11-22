---
title: Host Calls
layout: default
permalink: /host-calls.html
---

# Host calls

These calls are available inside `forgery_exec` programs, alongside the core
Pi tool calls (`pi.read`, `pi.bash`, `pi.write`, etc.) and `agents.*` calls.

## Media display

| Call | Effect |
|------|--------|
| `pi.showImage({ path, maxWidthCells?, maxHeightCells? })` | Draw one image file inline via the Kitty graphics protocol (Ghostty, Kitty, Warp, WezTerm, iTerm2). Falls back to a text path when the terminal cannot render images. Non-PNG images are transcoded to PNG automatically. |
| `pi.showImages({ paths, maxWidthCells?, maxHeightCells? })` | Display several image files in sequence. |
| `pi.showVideo({ path, maxWidthCells?, maxHeightCells? })` | Play a video file inline via the Kitty graphics protocol. Uses ffmpeg to extract frames at up to 12 fps. Falls back to a text path when the terminal cannot render video. |

### Terminal protocol override

The image/video protocol is auto-detected from your terminal environment
(`TERM_PROGRAM`, `KITTY_WINDOW_ID`, `GHOSTTY_RESOURCES_DIR`, `WEZTERM_PANE`,
`WARP_SESSION_ID`, `ITERM_SESSION_ID`, etc.) plus a modern-terminal heuristic:
if `COLORTERM=truecolor|24bit` and stdout is a TTY, Kitty graphics protocol is
assumed. If auto-detection fails or you want to force a protocol:

- **`PI_IMAGE_PROTOCOL=kitty`** — force Kitty graphics protocol
- **`PI_IMAGE_PROTOCOL=iterm2`** — force iTerm2 inline images
- **`PI_IMAGE_PROTOCOL=none`** — disable inline images (text fallback only)
- **`PI_IMAGE_PROTOCOL=auto`** — re-enable auto-detection

Set this in your shell before running `pi`, e.g.:

```sh
export PI_IMAGE_PROTOCOL=kitty
pi
```

You can also change it at runtime from inside Pi:

```
/forgery image-protocol kitty
/forgery image-protocol   # show current protocol
/forgery image-protocol auto   # reset to auto-detect
```

## Agent model routing

| Call | Effect |
|------|--------|
| `agents.route({ task, candidates?, minPassRate? })` | Recommends the cheapest model that historically completes this kind of task, based on per-model outcome history in the activity store. Advisory only — the caller still passes `model` to `agents.run`. Returns `{ model, reason, expectedCost, historicalPassRate }`. |

- **`task`** — Natural-language task description. Used to classify the task (planning, code-gen, review, summarization, research, debug, general).
- **`candidates?`** — Model ids to choose from. Defaults to the router's default model (`claude-sonnet-4`).
- **`minPassRate?`** — Minimum historical pass rate (0–1, default 0.6). Models below this are excluded unless none qualify.

On cold start (no history for a model+task class), the model is assumed to have a 0.5 pass rate and its cost is estimated via the cost manager. Recorded outcomes (via `agents.run` completion + `store.recordOutcome`) influence subsequent routes — read-your-writes within the same session.

## Example forgery_exec program using media

```ts
// Take a screenshot, show it, then show a QA video
await pi.bash({ command: "playwright test --headed --screenshot" });
await pi.showImage({ path: "test-results/homepage.png", maxWidthCells: 100 });
await pi.showVideo({ path: "test-results/qa-recording.mp4", maxWidthCells: 100 });
```
