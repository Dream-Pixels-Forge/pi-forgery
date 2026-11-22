---
title: Usage
layout: default
permalink: /usage.html
---

# Usage

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

## Terminal media display

### Images

`pi.showImage` draws one image file inline in the terminal via the Kitty
graphics protocol. Supported terminals (Ghostty, Kitty, Warp, WezTerm, iTerm2)
render the image directly; other terminals show a text path fallback. Non-PNG
images are transcoded to PNG automatically.

```ts
await pi.showImage({ path: "screenshot.png", maxWidthCells: 80 });
```

### Multiple images

`pi.showImages` displays several image files in sequence:

```ts
await pi.showImages({
  paths: ["a.png", "b.png", "c.png"],
  maxWidthCells: 60,
});
```

### Video

`pi.showVideo` plays a video file inline via the Kitty graphics protocol. It
uses ffmpeg to extract frames at up to 12 fps and draws them as an animation.

```ts
await pi.showVideo({ path: "recording.mp4", maxWidthCells: 100 });
```

## Terminals

Media display works in any terminal that supports the Kitty graphics protocol,
on macOS, Linux and Windows:

- **Ghostty and Kitty:** pictures and video work straight away.
- **Warp, WezTerm and Konsole:** media works when the terminal supports inline images.
- **iTerm2:** supported via the iTerm2 inline image protocol.

When the terminal cannot render inline media, a text fallback is shown instead
(the file path, MIME type, and dimensions).

### Forcing the image protocol

Auto-detection checks your terminal environment (TERM_PROGRAM, KITTY_WINDOW_ID,
GHOSTTY_RESOURCES_DIR, WEZTERM_PANE, WARP_SESSION_ID, ITERM_SESSION_ID, etc.)
plus a modern-terminal heuristic: if `COLORTERM=truecolor|24bit` and stdout is
a TTY, Kitty graphics protocol is assumed. If auto-detection does not pick up
your terminal's capabilities, set the `PI_IMAGE_PROTOCOL` environment variable
before starting Pi:

```sh
export PI_IMAGE_PROTOCOL=kitty
pi
```

Valid values: `kitty`, `iterm2`, `none`, `auto`.

You can also check and change the protocol from inside Pi:

```sh
/forgery image-protocol        # show current protocol
/forgery image-protocol kitty  # force Kitty graphics
/forgery image-protocol auto   # reset to auto-detect
```

