/**
 * pi-forgery — Git branch reader tests.
 *
 * Tests the GitBranchReader with a mock async fetcher.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncCache } from "../src/git/asyncCache";

/** Wait for microtasks to flush (async cache refresh). */
async function flush(): Promise<void> {
  await new Promise((resolve) => queueMicrotask(resolve));
}

/** Wait until cache has a non-null value. */
async function waitForValue<T>(fn: () => T | null, timeout = 1000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Cache did not populate in time");
}

test("AsyncCache: returns cached value immediately", async () => {
  let fetchCount = 0;
  const cache = new AsyncCache<string | null>(1000);
  
  const value = cache.get("key", async () => {
    fetchCount++;
    return "cached-value";
  });

  // First call returns null (cache miss)
  assert.equal(value, null);
  
  await waitForValue(() => cache.get("key", async () => "unused"));
  
  // After flush, value should be cached
  const value2 = cache.get("key", async () => {
    fetchCount++;
    return "cached-value";
  });
  
  assert.equal(value2, "cached-value");
  assert.equal(fetchCount, 1, "fetcher should only be called once");
});

test("AsyncCache: returns stale value while refreshing in background (SWR pattern)", async () => {
  let fetchCount = 0;
  let currentValue = "v1";
  const cache = new AsyncCache<string | null>(1000);
  
  // First fetch
  cache.get("key", async () => {
    fetchCount++;
    return currentValue;
  });
  await waitForValue(() => cache.get("key", async () => "unused"));
  
  assert.equal(cache.get("key", async () => "unused"), "v1");
  
  // Invalidate and change value - SWR: should return stale value immediately
  currentValue = "v2";
  cache.invalidate("key");
  
  // Should return stale value immediately (SWR)
  assert.equal(cache.get("key", async () => currentValue), "v1");
  
  // Wait for background refresh to complete
  await waitForValue(() => cache.get("key", async () => "unused"));
  
  // After refresh, should have new value
  assert.equal(cache.get("key", async () => "unused"), "v2");
  assert.equal(fetchCount, 2, "fetcher should be called twice");
});

test("AsyncCache: handles fetch errors gracefully", async () => {
  let shouldFail = true;
  const cache = new AsyncCache<string | null>(1000);
  
  // First fetch throws error
  cache.get("key", async () => {
    if (shouldFail) throw new Error("fetch failed");
    return "success";
  });
  
  // Wait a bit for the fetch to complete (it will fail)
  await new Promise((resolve) => setTimeout(resolve, 50));
  
  // After failed fetch, cache value should be null (error swallowed)
  const afterFail = cache.get("key", async () => "unused");
  assert.equal(afterFail, null);
  
  // Now succeed
  shouldFail = false;
  cache.invalidate("key");
  
  cache.get("key", async () => "success");
  await waitForValue(() => cache.get("key", async () => "unused"));
  
  assert.equal(cache.get("key", async () => "unused"), "success");
});

test("AsyncCache: multiple keys are independent", async () => {
  const cache = new AsyncCache<string | null>(1000);
  
  cache.get("key1", async () => "value1");
  cache.get("key2", async () => "value2");
  await waitForValue(() => cache.get("key1", async () => "unused"));
  await waitForValue(() => cache.get("key2", async () => "unused"));
  
  assert.equal(cache.get("key1", async () => "wrong"), "value1");
  assert.equal(cache.get("key2", async () => "wrong"), "value2");
  
  cache.invalidate("key1");
  // SWR: invalidate marks stale but keeps value
  assert.equal(cache.get("key1", async () => "wrong"), "value1");
  assert.equal(cache.get("key2", async () => "wrong"), "value2");
});