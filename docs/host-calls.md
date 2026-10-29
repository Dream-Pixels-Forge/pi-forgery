# Host calls

These calls are available inside `forgery_exec` programs, alongside the core
Pi tool calls (`pi.read`, `pi.bash`, `pi.write`, etc.) and `agents.*` calls.

## Media display

| Call | Effect |
|------|--------|
| `pi.showImage({ path, maxWidthCells?, maxHeightCells? })` | Draw one image file inline via the Kitty graphics protocol (Ghostty, Kitty, Warp, WezTerm, iTerm2). Falls back to a text path when the terminal cannot render images. Non-PNG images are transcoded to PNG automatically. |
| `pi.showImages({ paths, maxWidthCells?, maxHeightCells? })` | Display several image files in sequence. |
| `pi.showVideo({ path, maxWidthCells?, maxHeightCells? })` | Play a video file inline via the Kitty graphics protocol. Uses ffmpeg to extract frames at up to 12 fps. Falls back to a text path when the terminal cannot render video. |

## Example forgery_exec program using media

```ts
// Take a screenshot, show it, then show a QA video
await pi.bash({ command: "playwright test --headed --screenshot" });
await pi.showImage({ path: "test-results/homepage.png", maxWidthCells: 100 });
await pi.showVideo({ path: "test-results/qa-recording.mp4", maxWidthCells: 100 });
```
