import { execSync } from 'node:child_process';

/**
 * Reads the current git branch with caching and throttling.
 * Updates at most every throttleInterval milliseconds.
 *
 * Never throws — returns null when not in a git repository or when git
 * is unavailable, so callers never need to handle git errors.
 */
export class GitBranchReader {
  private branch: string | null = null;
  private lastUpdated = 0;
  private readonly throttleInterval = 2000; // ms

  /** Returns the cached branch if fresh, otherwise updates and returns the new value.
   *  Always returns null (never throws) when not in a git repository. */
  getBranch(): string | null {
    const now = Date.now();
    if (now - this.lastUpdated < this.throttleInterval && this.branch !== null) {
      return this.branch;
    }
    try {
      // Run git from the current working directory of the process.
      // Wrapped in try/catch so a missing git binary or non-git directory
      // never throws — we simply report no branch.
      const output = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        maxBuffer: 1024,
        // Suppress stderr so git's "not a git repository" error doesn't leak
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      this.branch = output.length > 0 ? output : null;
    } catch (_) {
      this.branch = null;
    }
    this.lastUpdated = now;
    return this.branch;
  }
}