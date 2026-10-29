/**
 * pi-forgery — GitHub stats reader.
 *
 * Reads open/closed issue and PR counts plus CI status via the `gh` CLI.
 * Never throws — returns `null` when `gh` is unavailable, not in a repo,
 * or any command fails. Results are throttled (2 s cache) so the footer
 * can read them on every render without shelling out each frame.
 *
 * `exec` is injectable (defaults to `node:child_process` `execSync`) so
 * the reader can be unit-tested without shelling out.
 */

import type { ExecSyncOptions } from "node:child_process";
import { execSync as defaultExecSync } from "node:child_process";

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

/** Throttled `gh` CLI reader for issues / PRs / CI. */
export class GitHubStatsReader {
  private exec: (cmd: string, opts?: ExecSyncOptions) => string;
  private cache: { issuesOpen: number | null; issuesClosed: number | null; prsOpen: number | null; prsClosed: number | null; ciStatus: GhStatus } | null = null;
  private lastUpdated = 0;
  private readonly throttleInterval = 2000; // ms

  constructor(exec?: (cmd: string, opts?: ExecSyncOptions) => string) {
    this.exec = exec ?? (defaultExecSync as (cmd: string, opts?: ExecSyncOptions) => string);
  }

  /** Open issue count, or null when unavailable. */
  issuesOpen(): number | null {
    return this.#refresh().issuesOpen;
  }

  /** Closed issue count, or null when unavailable. */
  issuesClosed(): number | null {
    return this.#refresh().issuesClosed;
  }

  /** Open PR count, or null when unavailable. */
  prsOpen(): number | null {
    return this.#refresh().prsOpen;
  }

  /** Closed PR count, or null when unavailable. */
  prsClosed(): number | null {
    return this.#refresh().prsClosed;
  }

  /** CI status: "pending" | "failed" | "green" | null. */
  ciStatus(): GhStatus {
    return this.#refresh().ciStatus;
  }

  #refresh(): {
    issuesOpen: number | null;
    issuesClosed: number | null;
    prsOpen: number | null;
    prsClosed: number | null;
    ciStatus: GhStatus;
  } {
    const now = Date.now();
    if (
      now - this.lastUpdated < this.throttleInterval &&
      this.cache !== null
    ) {
      return this.cache;
    }

    const result = {
      issuesOpen: this.#ghCount("issue", "open"),
      issuesClosed: this.#ghCount("issue", "closed"),
      prsOpen: this.#ghCount("pr", "open"),
      prsClosed: this.#ghCount("pr", "closed"),
      ciStatus: this.#ghCiStatus(),
    };

    this.cache = result;
    this.lastUpdated = now;
    return result;
  }

  /** `gh <type> list --state <state> --json number --jq 'length'` → count. */
  #ghCount(type: "issue" | "pr", state: "open" | "closed"): number | null {
    try {
      const output = this.exec(
        `gh ${type} list --state ${state} --json number --jq 'length'`,
        { encoding: "utf8", maxBuffer: 1024, stdio: ["pipe", "pipe", "pipe"] },
      );
      const n = Number(output.trim());
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  /** `gh run list --limit 1 --json status --jq '.[0].status'` → mapped status. */
  #ghCiStatus(): GhStatus {
    try {
      const output = this.exec(
        "gh run list --limit 1 --json status --jq '.[0].status'",
        { encoding: "utf8", maxBuffer: 1024, stdio: ["pipe", "pipe", "pipe"] },
      );
      return mapCiStatus(output.trim());
    } catch {
      return null;
    }
  }
}
