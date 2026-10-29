/**
 * pi-forgery — terminal image display.
 *
 * Displays images directly in the terminal using the Kitty graphics protocol,
 * the same mechanism claude-show-your-work uses. Supported terminals draw the
 * image inline (Ghostty, Kitty, Warp, WezTerm, iTerm2). When the terminal
 * cannot render inline images, a text fallback is printed instead.
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
import {
  encodeKitty,
  encodeITerm2,
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

/**
 * Read an image file and draw it inline in the terminal via the Kitty graphics
 * protocol (or iTerm2 inline images). Writes escape sequences directly to
 * process.stdout so the image appears in the terminal output.
 */
export async function showImage(
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

  if (protocol === "kitty") {
    // Kitty requires PNG (f=100). Transcode non-PNG images first.
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
        // Transcoding unavailable: fall back to text instead of sending
        // invalid PNG frames to the terminal.
        const fallback = imageFallback(mime, dimensions, path);
        process.stdout.write(fallback + "\n");
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

    const sequence = encodeKitty(pngBase64, {
      ...(options.maxWidthCells ? { columns: options.maxWidthCells } : {}),
      ...(options.maxHeightCells ? { rows: options.maxHeightCells } : {}),
      moveCursor: false,
    });
    process.stdout.write(sequence + "\n");
    return {
      path: full,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      displayed: true,
      protocol: "kitty",
    };
  }

  if (protocol === "iterm2") {
    const sequence = encodeITerm2(base64, {
      inline: true,
      preserveAspectRatio: true,
    });
    process.stdout.write(sequence + "\n");
    return {
      path: full,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      displayed: true,
      protocol: "iterm2",
    };
  }

  // No inline image support: text fallback.
  const fallback = imageFallback(mime, dimensions, path);
  process.stdout.write(fallback + "\n");
  return {
    path: full,
    widthPx: dimensions.widthPx,
    heightPx: dimensions.heightPx,
    displayed: false,
    protocol: null,
    fallback,
  };
}

/** Display several images in sequence, one after another. */
export async function showImages(
  cwd: string,
  paths: string[],
  options: { maxWidthCells?: number; maxHeightCells?: number } = {},
): Promise<ShowImageResult[]> {
  const results: ShowImageResult[] = [];
  for (const path of paths) {
    results.push(await showImage(cwd, path, options));
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

/** Extract video frames as PNG base64 via ffmpeg, then draw each inline. */
export async function showVideo(
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

  if (protocol !== "kitty" && protocol !== "iterm2") {
    const fallback = imageFallback("video/mp4", { widthPx, heightPx }, path);
    process.stdout.write(fallback + "\n");
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

  // Read frames.
  const fs = await import("node:fs");
  const entries = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".png")).sort();
  const framesShown = entries.length;

  // Draw each frame inline with a small delay for animation.
  for (const entry of entries) {
    const framePath = pathJoin(tmpDir, entry);
    const bytes = fs.readFileSync(framePath);
    const base64 = bytes.toString("base64");

    if (protocol === "kitty") {
      const sequence = encodeKitty(base64, {
        ...(options.maxWidthCells ? { columns: options.maxWidthCells } : {}),
        ...(options.maxHeightCells ? { rows: options.maxHeightCells } : {}),
        moveCursor: false,
      });
      process.stdout.write(sequence + "\n");
    } else {
      // iTerm2
      const sequence = encodeITerm2(base64, {
        inline: true,
        preserveAspectRatio: true,
      });
      process.stdout.write(sequence + "\n");
    }

    // Small delay between frames (~83 ms for 12 fps).
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  // Clean up temp dir.
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
    framesShown,
    displayed: true,
    protocol,
  };
}
