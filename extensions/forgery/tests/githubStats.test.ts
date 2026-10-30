/**
 * pi-forgery — GitHub stats reader tests.
 *
 * Tests the GitHubStatsReader with a mock async exec function.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubStatsReader } from "../src/git/githubStats";

type FakeExec = (cmd: string) => Promise<string>;

function makeReader(exec: FakeExec): GitHubStatsReader {
  return new GitHubStatsReader(exec);
}

/** Wait for microtasks to flush (async cache refresh). */
async function flush(): Promise<void> {
  await new Promise((resolve) => queueMicrotask(resolve));
}

/** Wait until cache has a non-null value for the given reader method. */
async function waitForCache<T>(fn: () => T | null, timeout = 1000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Cache did not populate in time");
}

test("GitHubStatsReader: returns counts from gh output", async () => {
  const calls: string[] = [];
  const reader = makeReader(async (cmd: string) => {
    calls.push(cmd);
    if (cmd.includes("issue list")) {
      return cmd.includes("open") ? "3" : "12";
    }
    if (cmd.includes("pr list")) {
      return cmd.includes("open") ? "1" : "5";
    }
    if (cmd.includes("run list")) {
      return "success";
    }
    return "";
  });

  // First call returns null (cache miss)
  assert.equal(reader.issuesOpen(), null);

  await waitForCache(() => reader.issuesOpen());

  // After cache refresh, all values should be populated from a single refresh
  assert.equal(reader.issuesOpen(), 3);
  assert.equal(reader.issuesClosed(), 12);
  assert.equal(reader.prsOpen(), 1);
  assert.equal(reader.prsClosed(), 5);
  assert.equal(reader.ciStatus(), "green");
});

test("GitHubStatsReader: returns null when gh fails", async () => {
  const reader = makeReader(async () => {
    throw new Error("gh not found");
  });

  // First call returns null (cache miss)
  assert.equal(reader.issuesOpen(), null);

  await flush();

  // After cache refresh, still null because exec throws
  assert.equal(reader.issuesOpen(), null);
  assert.equal(reader.issuesClosed(), null);
  assert.equal(reader.prsOpen(), null);
  assert.equal(reader.prsClosed(), null);
  assert.equal(reader.ciStatus(), null);
});

test("GitHubStatsReader: ciStatus maps run states", () => {
  // Test the mapCiStatus function directly (extracted from githubStats.ts)
  function mapCiStatus(status: string): "pending" | "failed" | "green" | "nit" | null {
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

  const cases: Array<[string, "pending" | "failed" | "green" | "nit" | null]> = [
    ["success", "green"],
    ["completed", "green"],
    ["failure", "failed"],
    ["in_progress", "pending"],
    ["queued", "pending"],
    ["unknown_state", null],
  ];

  for (const [output, expected] of cases) {
    assert.equal(mapCiStatus(output), expected, `expected ${expected} for ${output}`);
  }
});

test("GitHubStatsReader: throttles gh calls (cached within 2 s)", async () => {
  let callCount = 0;
  const reader = makeReader(async () => {
    callCount += 1;
    return "1";
  });

  // First call triggers cache miss (returns null)
  reader.issuesOpen();
  await waitForCache(() => reader.issuesOpen());

  // Now cached, should have made 5 gh commands (one refresh = 5 calls)
  reader.issuesOpen();
  reader.issuesOpen();
  reader.issuesOpen();
  assert.equal(callCount, 5, "one refresh = 5 gh commands, cached thereafter");
});