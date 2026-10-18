import { execSync } from 'node:child_process';

/**
 * Reads the current git branch with caching and throttling.
 * Updates at most every throttleInterval milliseconds.
 */
export class GitBranchReader {
  private branch: string | null = null;
  private lastUpdated = 0;
  private readonly throttleInterval = 2000; // ms

  /** Returns the cached branch if fresh, otherwise updates and returns the new value. */
  getBranch(): string | null {
    const now = Date.now();
    if (now - this.lastUpdated < this.throttleInterval && this.branch !== null) {
      return this.branch;
    }
    try {
      // Run git from the current working directory of the process.
      const output = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', maxBuffer: 1024 }).trim();
      this.branch = output.length > 0 ? output : null;
    } catch (_) {
      this.branch = null;
    }
    this.lastUpdated = now;
    return this.branch;
  }
}