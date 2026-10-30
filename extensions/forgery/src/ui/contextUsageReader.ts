/**
 * pi-forgery — Context usage reader with throttling.
 *
 * Reads live context usage from the host extension context with a
 * configurable throttle interval to avoid blocking the UI render loop.
 * Never throws — returns null when the host context is unavailable
 * or any call fails.
 *
 * The first call returns immediately with null and primes the cache
 * asynchronously to avoid blocking the UI on startup.
 */

import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Throttled context usage reader. */
export class ContextUsageReader {
  private getContext: () => ExtensionContext | undefined;
  private cache: ContextUsage | null = null;
  private lastUpdated = 0;
  private readonly throttleInterval: number;
  private primed = false;

  constructor(
    getContext: () => ExtensionContext | undefined,
    throttleInterval = 2000, // ms
  ) {
    this.getContext = getContext;
    this.throttleInterval = throttleInterval;
  }

  /** Current context usage, or null when unavailable. */
  get(): ContextUsage | null {
    const now = Date.now();
    if (
      now - this.lastUpdated < this.throttleInterval &&
      this.cache !== null
    ) {
      return this.cache;
    }
    if (!this.primed) {
      this.primed = true;
      // Prime cache asynchronously — don't block the first render.
      queueMicrotask(() => this.#refresh());
      return null;
    }
    this.#refresh();
    return this.cache;
  }

  #refresh(): void {
    try {
      const ctx = this.getContext();
      if (!ctx) {
        this.cache = null;
      } else {
        const usage = ctx.getContextUsage();
        this.cache = usage ?? null;
      }
    } catch {
      this.cache = null;
    }
    this.lastUpdated = Date.now();
  }

  /** Force a refresh on next get(). */
  invalidate(): void {
    this.cache = null;
    this.lastUpdated = 0;
    this.primed = false;
  }
}