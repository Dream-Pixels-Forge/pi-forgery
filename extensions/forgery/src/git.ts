import { AsyncCache, runGitAsync } from "./git/asyncCache";

/**
 * Reads the current git branch with SWR (Stale-While-Revalidate) async cache.
 * Returns cached value immediately, triggers background refresh when stale.
 * Never throws — returns null when not in a git repository or when git
 * is unavailable, so callers never need to handle git errors.
 */
export class GitBranchReader {
  private readonly cache: AsyncCache<string | null>;

  constructor(requestRender?: () => void) {
    this.cache = new AsyncCache<string | null>(2000, requestRender);
  }

  /**
   * Current branch, or null when unavailable.
   * Returns cached value immediately; refreshes in background if stale.
   */
  getBranch(): string | null {
    return this.cache.get("branch", async () => {
      try {
        return await runGitAsync(["rev-parse", "--abbrev-ref", "HEAD"]);
      } catch {
        return null;
      }
    });
  }

  /** Force a refresh on next getBranch(). */
  invalidate(): void {
    this.cache.invalidate("branch");
  }
}