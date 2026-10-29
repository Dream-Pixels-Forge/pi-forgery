/**
 * pi-forgery — terminal image display.
 *
 * Displays images and video directly in the terminal using Pi's TUI render
 * loop via `ctx.ui.custom()` + `@earendil-works/pi-tui` `Image` component.
 * This replaces the previous approach of writing raw Kitty escape sequences
 * to `process.stdout`, which Pi's TUI render loop could overwrite between
 * renders.
 *
 * Supported terminals draw the image inline (Ghostty, Kitty, Warp, WezTerm,
 * iTerm2). When the terminal cannot render inline images, a text fallback is
 * shown instead.
 *
 * Kitty requires PNG data (f=100), so non-PNG images are transcoded with
 * pi-coding-agent's convertToPng before encoding.
 */

import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { isAbsolute, resolve as pathResolve, extname } from "node:path";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  Image,
  type ImageTheme,
  type ImageOptions,
  type Component,
  type Focusable,
  getCapabilities,
  getImageDimensions,
  imageFallback,
} from "@earendil-works/pi-tui";
import { convertToPng } from "@earendil-works/pi-coding-agent";

export interface ShowImageResult {
  /** Resolved absolute path of the image file. */
  path: string;
  /** Image width in pixels. */
  widthPx: number;
  /** Image height in pixels. */
  heightPx: number;
  /** Whether the image was drawn inline (true) or only reported as text (false). */
  displayed: boolean;
  /** "kitty" | "iterm2" | null */
  protocol: "kitty" | "iterm2" | null;
  /** Text fallback shown when the terminal cannot render inline images. */
  fallback?: string;
}

function resolvePath(cwd: string, p: string): string {
  return isAbsolute(p) ? p : pathResolve(cwd, p);
}

function mimeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

/** Theme adapter: maps ImageTheme.fallbackColor to pi-coding-agent Theme. */
function makeImageTheme(theme: ReturnType<typeof getCapabilities> extends never ? unknown : unknown): ImageTheme {
  return {
    fallbackColor: (text: string) => text,
  };
}

/**
 * An overlay component that shows an Image and dismisses on any key press.
 * Used for single image display via ctx.ui.custom().
 */
class ImageOverlay implements Component, Focusable {
  focused = false;
  private image: Image;
  private done: () => void;

  constructor(image: Image, done: () => void) {
    this.image = image;
    this.done = done;
  }

  invalidate(): void {}

  render(width: number): string[] {
    return this.image.render(width);
  }

  handleInput(data: string): void {
    // Any key dismisses the overlay
    this.done();
  }
}

/**
 * An overlay component that cycles through video frames and dismisses when
 * all frames are shown or any key is pressed.
 */
class VideoOverlay implements Component, Focusable {
  focused = false;
  private frames: string[];   // base64 PNG data per frame
  private mime: string;
  private theme: ImageTheme;
  private options: ImageOptions;
  private currentIndex: number = 0;
  private image: Image | null = null;
  private done: () => void;
  private interval?: NodeJS.Timeout;
  private frameDelayMs: number;

  constructor(
    frames: string[],
    mime: string,
    theme: ImageTheme,
    options: ImageOptions,
    done: () => void,
    frameDelayMs: number,
  ) {
    this.frames = frames;
    this.mime = mime;
    this.theme = theme;
    this.options = options;
    this.done = done;
    this.frameDelayMs = frameDelayMs;
    this.createImage(0);
  }

  private createImage(index: number): void {
    this.image = new Image(this.frames[index], this.mime, this.theme, {
      ...this.options,
    });
  }

  invalidate(): void {}

  render(width: number): string[] {
    return this.image ? this.image.render(width) : [];
  }

  handleInput(data: string): void {
    // Any key dismisses early
    this.stop();
    this.done();
  }

  private advance(): void {
    this.currentIndex++;
    if (this.currentIndex >= this.frames.length) {
      this.stop();
      this.done();
      return;
    }
    this.createImage(this.currentIndex);
  }

  start(): void {
    this.interval = setInterval(() => this.advance(), this.frameDelayMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}

/**
 * Show an image inline in the terminal via Pi's TUI render loop.
 * Opens an overlay with the Image component; dismisses on any key press.
 */
export async function showImage(
  ui: ExtensionUIContext,
  cwd: string,
  path: string,
  options: { maxWidthCells?: number; maxHeightCells?: number } = {},
): Promise<ShowImageResult> {
  const full = resolvePath(cwd, path);

  let bytes: Buffer;
  try {
    bytes = readFileSync(full);
  } catch (e) {
    throw new Error(
      `showImage: cannot read "${path}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const base64 = bytes.toString("base64");
  const mime = mimeForPath(full);
  const dimensions = getImageDimensions(base64, mime) ?? {
    widthPx: 800,
    heightPx: 600,
  };

  const caps = getCapabilities();
  const protocol: "kitty" | "iterm2" | null =
    caps.images === "kitty" ? "kitty" : caps.images === "iterm2" ? "iterm2" : null;

  if (!protocol) {
    // Terminal cannot render inline images — text fallback only.
    const fallback = imageFallback(mime, dimensions, path);
    ui.notify(`forgery: inline images not supported — ${fallback}`, "info");
    return {
      path: full,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      displayed: false,
      protocol: null,
      fallback,
    };
  }

  // Transcode non-PNG images to PNG for Kitty protocol.
  let pngBase64 = base64;
  if (mime !== "image/png") {
    const converted = await convertToPng(base64, mime);
    if (converted) {
      pngBase64 = converted.data;
      const pngDims = getImageDimensions(pngBase64, "image/png");
      if (pngDims) {
        dimensions.widthPx = pngDims.widthPx;
        dimensions.heightPx = pngDims.heightPx;
      }
    } else {
      const fallback = imageFallback(mime, dimensions, path);
      ui.notify(`forgery: image transcoding failed — ${fallback}`, "info");
      return {
        path: full,
        widthPx: dimensions.widthPx,
        heightPx: dimensions.heightPx,
        displayed: false,
        protocol: null,
        fallback,
      };
    }
  }

  const imageTheme: ImageTheme = {
    fallbackColor: (text: string) => text,
  };

  const imageOpts: ImageOptions = {
    ...(options.maxWidthCells ? { maxWidthCells: options.maxWidthCells } : {}),
    ...(options.maxHeightCells ? { maxHeightCells: options.maxHeightCells } : {}),
  };

  const image = new Image(pngBase64, mime, imageTheme, imageOpts, dimensions);

  await new Promise<void>((resolve) => {
    ui.custom<void>(
      (tui, _theme, _keybindings, done) => {
        const overlay = new ImageOverlay(image, () => {
          done(undefined);
          resolve();
        });
        tui.showOverlay(overlay, {
          anchor: "center",
          margin: 1,
        });
        return overlay;
      },
      { overlay: true },
    );
  });

  return {
    path: full,
    widthPx: dimensions.widthPx,
    heightPx: dimensions.heightPx,
    displayed: true,
    protocol,
  };
}

/** Display several images in sequence, one after another. */
export async function showImages(
  ui: ExtensionUIContext,
  cwd: string,
  paths: string[],
  options: { maxWidthCells?: number; maxHeightCells?: number } = {},
): Promise<ShowImageResult[]> {
  const results: ShowImageResult[] = [];
  for (const path of paths) {
    results.push(await showImage(ui, cwd, path, options));
  }
  return results;
}

// ── Video display ──────────────────────────────────────────────────────

export interface ShowVideoResult {
  /** Resolved absolute path of the video file. */
  path: string;
  /** Video width in pixels. */
  widthPx: number;
  /** Video height in pixels. */
  heightPx: number;
  /** Duration in seconds. */
  duration: number;
  /** Frames extracted and displayed. */
  framesShown: number;
  /** Whether the video was drawn inline (true) or only reported as text (false). */
  displayed: boolean;
  /** "kitty" | "iterm2" | null */
  protocol: "kitty" | "iterm2" | null;
  /** Text fallback shown when the terminal cannot render inline images. */
  fallback?: string;
}

const execFileAsync = promisify(execFile);

/** Maximum frames to extract (12 fps × 300 s cap). */
const MAX_VIDEO_FRAMES = 3600;

/** Target frame delay in ms (~12 fps). */
const FRAME_DELAY_MS = 83;

/** Extract video frames as PNG base64 via ffmpeg, then draw each inline. */
export async function showVideo(
  ui: ExtensionUIContext,
  cwd: string,
  path: string,
  options: { maxWidthCells?: number; maxHeightCells?: number } = {},
): Promise<ShowVideoResult> {
  const full = resolvePath(cwd, path);

  // Probe duration and dimensions.
  let duration = 0;
  let widthPx = 800;
  let heightPx = 600;
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        full,
      ],
      { encoding: "utf-8" },
    );
    const lines = stdout.trim().split("\n");
    if (lines.length >= 2) {
      widthPx = Number(lines[0].split(",")[0]) || widthPx;
      heightPx = Number(lines[0].split(",")[1]) || heightPx;
      duration = Number(lines[1]) || 0;
    }
  } catch {
    // ffprobe unavailable or failed — use defaults.
  }

  const caps = getCapabilities();
  const protocol: "kitty" | "iterm2" | null =
    caps.images === "kitty" ? "kitty" : caps.images === "iterm2" ? "iterm2" : null;

  if (!protocol) {
    const fallback = imageFallback("video/mp4", { widthPx, heightPx }, path);
    ui.notify(`forgery: inline video not supported — ${fallback}`, "info");
    return {
      path: full,
      widthPx,
      heightPx,
      duration,
      framesShown: 0,
      displayed: false,
      protocol: null,
      fallback,
    };
  }

  // Extract frames at up to 12 fps into a temp dir as PNG.
  const tmpDir = pathJoin(tmpdir(), `pi-forgery-video-${Date.now()}`);
  try {
    await execFileAsync("mkdir", ["-p", tmpDir]);
  } catch {
    /* ignore */
  }

  const fps = Math.min(12, Math.ceil(MAX_VIDEO_FRAMES / Math.max(duration, 1)));
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        full,
        "-vf",
        `fps=${fps},scale=${options.maxWidthCells ? Math.min(options.maxWidthCells * 12, 1280) : -2}:-2`,
        "-vsync",
        "vfr",
        "-frames:v",
        String(MAX_VIDEO_FRAMES),
        pathJoin(tmpDir, "frame-%04d.png"),
      ],
      { encoding: "utf-8" },
    );
  } catch (e) {
    throw new Error(
      `showVideo: ffmpeg failed for "${path}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Read frames as base64.
  const fs = await import("node:fs");
  const entries = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".png")).sort();
  const framesShown = entries.length;

  if (framesShown === 0) {
    try {
      await execFileAsync("rm", ["-rf", tmpDir]);
    } catch {
      /* ignore */
    }
    return {
      path: full,
      widthPx,
      heightPx,
      duration,
      framesShown: 0,
      displayed: false,
      protocol,
      fallback: "no frames extracted",
    };
  }

  const frameBase64s: string[] = [];
  for (const entry of entries) {
    const framePath = pathJoin(tmpDir, entry);
    const frameBytes = fs.readFileSync(framePath);
    frameBase64s.push(frameBytes.toString("base64"));
  }

  // Clean up temp dir.
  try {
    await execFileAsync("rm", ["-rf", tmpDir]);
  } catch {
    /* ignore */
  }

  const imageTheme: ImageTheme = {
    fallbackColor: (text: string) => text,
  };

  const imageOpts: ImageOptions = {
    ...(options.maxWidthCells ? { maxWidthCells: options.maxWidthCells } : {}),
    ...(options.maxHeightCells ? { maxHeightCells: options.maxHeightCells } : {}),
  };

  const frameDelayMs = Math.round(1000 / fps);

  await new Promise<void>((resolve) => {
    ui.custom<void>(
      (tui, _theme, _keybindings, done) => {
        const overlay = new VideoOverlay(
          frameBase64s,
          "image/png",
          imageTheme,
          imageOpts,
          () => {
            done(undefined);
            resolve();
          },
          frameDelayMs,
        );
        tui.showOverlay(overlay, {
          anchor: "center",
          margin: 1,
        });
        overlay.start();
        return overlay;
      },
      { overlay: true },
    );
  });

  return {
    path: full,
    widthPx,
    heightPx,
    duration,
    framesShown,
    displayed: true,
    protocol,
  };
}
