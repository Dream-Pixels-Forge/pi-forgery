/**
 * pi-forgery — GitHub stats reader tests.
 *
 * Injects a fake `exec` function so no real `gh` calls are made.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubStatsReader } from "../src/git/githubStats";

type FakeExec = (cmd: string) => string;

function makeReader(exec: FakeExec): GitHubStatsReader {
  return new GitHubStatsReader((cmd: string) => exec(cmd));
}

test("GitHubStatsReader: returns counts from gh output", () => {
  const calls: string[] = [];
  const reader = makeReader((cmd: string) => {
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

  assert.equal(reader.issuesOpen(), 3);
  assert.equal(reader.issuesClosed(), 12);
  assert.equal(reader.prsOpen(), 1);
  assert.equal(reader.prsClosed(), 5);
  assert.equal(reader.ciStatus(), "green");
});

test("GitHubStatsReader: returns null when gh fails", () => {
  const reader = makeReader(() => {
    throw new Error("gh not found");
  });

  assert.equal(reader.issuesOpen(), null);
  assert.equal(reader.issuesClosed(), null);
  assert.equal(reader.prsOpen(), null);
  assert.equal(reader.prsClosed(), null);
  assert.equal(reader.ciStatus(), null);
});

test("GitHubStatsReader: ciStatus maps run states", () => {
  const cases: Array<[string, "pending" | "failed" | "green" | "nit" | null]> = [
    ["success", "green"],
    ["completed", "green"],
    ["failure", "failed"],
    ["in_progress", "pending"],
    ["queued", "pending"],
    ["unknown_state", null],
  ];

  for (const [output, expected] of cases) {
    const reader = makeReader(() => output);
    assert.equal(reader.ciStatus(), expected, `expected ${expected} for ${output}`);
  }
});

test("GitHubStatsReader: throttles gh calls (cached within 2 s)", () => {
  let callCount = 0;
  const reader = makeReader(() => {
    callCount += 1;
    return "1";
  });

  // One #refresh() run fans out to all 5 gh commands; subsequent calls hit cache.
  reader.issuesOpen();
  reader.issuesOpen();
  reader.issuesOpen();
  assert.equal(callCount, 5, "one refresh = 5 gh commands, cached thereafter");
});
