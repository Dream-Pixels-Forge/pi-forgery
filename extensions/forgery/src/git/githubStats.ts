/**
 * pi-forgery — GitHub stats reader.
 *
 * Reads open/closed issue and PR counts plus CI status via the `gh` CLI.
 * Uses SWR (Stale-While-Revalidate) async cache — returns cached value
 * immediately, triggers background refresh when stale.
 * Never throws — returns `null` when `gh` is unavailable, not in a repo,
 * or any command fails.
 *
 * `exec` is injectable (defaults to `node:child_process` `execFileAsync`) so
 * the reader can be unit-tested without shelling out.
 */

import type { ExecFileOptions } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AsyncCache, runGhAsync } from "./asyncCache";

const execFileAsync = promisify(execFile);

type GhStatus = "pending" | "failed" | "green" | "nit" | null;

/** Map a GitHub run status to the footer's CI segment vocabulary. */
function mapCiStatus(status: string): GhStatus {
  switch (status) {
    case "completed":
    case "success":
      return "green";
    case "failure":
    case "cancelled":
    case "timed_out":
      return "failed";
    case "queued":
    case "in_progress":
    case "waiting":
    case "pending":
      return "pending";
    case "requested":
    case "skipped":
    case "stale":
      return "nit";
    default:
      return null;
  }
}

/** Result shape for GitHub stats. */
interface GitHubStats {
  issuesOpen: number | null;
  issuesClosed: number | null;
  prsOpen: number | null;
  prsClosed: number | null;
  ciStatus: GhStatus;
}

/** Throttled `gh` CLI reader for issues / PRs / CI with SWR cache. */
export class GitHubStatsReader {
  private exec: (cmd: string, opts?: ExecFileOptions) => Promise<string>;
  private readonly cache: AsyncCache<GitHubStats>;

  constructor(
    exec?: (cmd: string, opts?: ExecFileOptions) => Promise<string>,
    requestRender?: () => void,
  ) {
    this.exec = exec ?? defaultExecAsync;
    this.cache = new AsyncCache<GitHubStats>(2000, requestRender);
  }

  /** Open issue count, or null when unavailable. */
  issuesOpen(): number | null {
    return this.getStats().issuesOpen;
  }

  /** Closed issue count, or null when unavailable. */
  issuesClosed(): number | null {
    return this.getStats().issuesClosed;
  }

  /** Open PR count, or null when unavailable. */
  prsOpen(): number | null {
    return this.getStats().prsOpen;
  }

  /** Closed PR count, or null when unavailable. */
  prsClosed(): number | null {
    return this.getStats().prsClosed;
  }

  /** CI status: "pending" | "failed" | "green" | null. */
  ciStatus(): GhStatus {
    return this.getStats().ciStatus;
  }

  /** Get all stats at once (uses shared cache). */
  private getStats(): GitHubStats {
    const stats = this.cache.get("stats", async () => {
      const result: GitHubStats = {
        issuesOpen: await this.#ghCount("issue", "open"),
        issuesClosed: await this.#ghCount("issue", "closed"),
        prsOpen: await this.#ghCount("pr", "open"),
        prsClosed: await this.#ghCount("pr", "closed"),
        ciStatus: await this.#ghCiStatus(),
      };
      return result;
    });
    // Return default empty stats if cache is empty (first call before refresh)
    return stats ?? {
      issuesOpen: null,
      issuesClosed: null,
      prsOpen: null,
      prsClosed: null,
      ciStatus: null,
    };
  }

  /** `gh <type> list --state <state> --json number --jq 'length'` → count. */
  async #ghCount(type: "issue" | "pr", state: "open" | "closed"): Promise<number | null> {
    try {
      const output = await this.exec(
        `gh ${type} list --state ${state} --json number --jq 'length'`,
        { encoding: "utf8", maxBuffer: 1024, windowsHide: true },
      );
      const n = Number(output.trim());
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  /** `gh run list --limit 1 --json status --jq '.[0].status'` → mapped status. */
  async #ghCiStatus(): Promise<GhStatus> {
    try {
      const output = await this.exec(
        "gh run list --limit 1 --json status --jq '.[0].status'",
        { encoding: "utf8", maxBuffer: 1024, windowsHide: true },
      );
      return mapCiStatus(output.trim());
    } catch {
      return null;
    }
  }

  /** Force a refresh on next call. */
  invalidate(): void {
    this.cache.invalidate("stats");
  }
}

/** Default async exec using execFileAsync. */
async function defaultExecAsync(cmd: string, opts?: ExecFileOptions): Promise<string> {
  // Parse command into program + args for execFileAsync
  const [program, ...args] = cmd.split(" ");
  const { stdout } = await execFileAsync(program, args, {
    encoding: "utf8",
    maxBuffer: 4096,
    windowsHide: true,
    ...opts,
  });
  return stdout as string;
}