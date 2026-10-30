/**
 * pi-forgery — SWR (Stale-While-Revalidate) async cache.
 *
 * Returns cached value immediately, triggers async refresh in background,
 * calls onUpdate when fresh data lands so the TUI can re-render.
 *
 * Based on patterns from @herbertgao/pi-extensions and
 * pi-extension-git-footer-status.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AsyncCacheEntry<T> {
  value: T | null;
  promise: Promise<T> | null;
  lastFetch: number;
  stale: boolean;
  fetcher: (() => Promise<T>) | null;
}

/** SWR cache with configurable TTL and optional onUpdate callback. */
export class AsyncCache<T> {
  private cache = new Map<string, AsyncCacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly onUpdate?: () => void;

  constructor(ttlMs: number, onUpdate?: () => void) {
    this.ttlMs = ttlMs;
    this.onUpdate = onUpdate;
  }

  /**
   * Get cached value or fetch new one.
   * Returns immediately with cached (possibly stale) value.
   * Triggers background refresh if stale or missing.
   * The fetcher is stored with the key for consistent background refreshes.
   */
  get(key: string, fetcher: () => Promise<T>): T | null {
    const entry = this.cache.get(key);
    const now = Date.now();

    // Fresh cache hit
    if (entry && entry.value !== null && now - entry.lastFetch < this.ttlMs && !entry.stale) {
      return entry.value;
    }

    // Stale or missing: trigger background refresh
    if (!entry || !entry.promise) {
      // Store the fetcher for future background refreshes
      const fetcherToUse = entry?.fetcher ?? fetcher;
      const promise = fetcherToUse()
        .then((value) => {
          this.cache.set(key, {
            value,
            promise: null,
            lastFetch: Date.now(),
            stale: false,
            fetcher: fetcherToUse,
          });
          this.onUpdate?.();
          return value;
        })
        .catch((err) => {
          // On error, mark as stale but keep value, clear promise so we retry next time
          const currentEntry = this.cache.get(key);
          if (currentEntry) {
            currentEntry.promise = null;
            currentEntry.stale = true;
          }
          // Don't re-throw - swallow error to avoid unhandled rejection
          return (currentEntry?.value ?? null) as T;
        });
      this.cache.set(key, {
        value: entry?.value ?? null,
        promise,
        lastFetch: now,
        stale: true,
        fetcher: fetcherToUse,
      });
    }

    return entry?.value ?? null;
  }

  /** Mark a key as stale (keep value, trigger refresh on next get). */
  invalidate(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.stale = true;
      entry.promise = null;
    }
  }

  /** Clear all entries. */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Run a git command asynchronously with proper Windows support.
 * Uses `--no-optional-locks` to avoid lock contention in reftable repos.
 */
export async function runGitAsync(args: string[], cwd?: string): Promise<string> {
  const fullArgs = ["--no-optional-locks", ...args];
  const { stdout } = await execFileAsync("git", fullArgs, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4096,
    windowsHide: true,
  });
  return stdout.trim();
}

/**
 * Run a gh command asynchronously with proper Windows support.
 */
export async function runGhAsync(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4096,
    windowsHide: true,
  });
  return stdout.trim();
}