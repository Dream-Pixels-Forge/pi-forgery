/**
 * pi-forgery — Activity Distill.
 *
 * Mines completed runs in the activity store for repeated host-call
 * sequences (n-grams) and proposes them as named presets / reusable skills.
 *
 * Read-only: never mutates the store. Patterns are host-call ref sequences
 * (e.g. "pi.grep → pi.read → agents.run"), not LLM output — no task content
 * is leaked.
 */

import { ForgeryActivityStore } from "./store";

const DEFAULT_N = 3; // call-sequence length to mine

export interface DistilledPattern {
  /** Human-readable pattern, e.g. "pi.grep → pi.read → agents.run". */
  pattern: string;
  /** Suggested preset/skill name, e.g. "code-scan-review". */
  suggestedName: string;
  /** Number of distinct runs containing this pattern. */
  occurrences: number;
  /** Average total cost (USD) across runs containing the pattern. */
  avgCost: number;
  /** Average duration (ms) across runs containing the pattern. */
  avgDuration: number;
  /** Earliest run containing the pattern (epoch ms). */
  firstSeen: number;
  /** Latest run containing the pattern (epoch ms). */
  lastSeen: number;
}

/** Extract consecutive call-ref n-grams from a run's call list. */
function callNgrams(runRefs: string[], n: number): string[][] {
  const grams: string[][] = [];
  for (let i = 0; i + n <= runRefs.length; i++) {
    grams.push(runRefs.slice(i, i + n));
  }
  return grams;
}

/** Turn a ref sequence into a readable pattern string. */
function patternString(grams: string[]): string {
  return grams.join(" → ");
}

/** Suggest a preset/skill name from a pattern. */
function suggestName(grams: string[]): string {
  const first = grams[0].replace(/^pi\./, "").replace(/^agents\./, "agent.");
  const last = grams[grams.length - 1].replace(/^pi\./, "").replace(/^agents\./, "agent.");
  const len = grams.length;
  if (len <= 2) return `${first}-to-${last}`;
  return `${first}-to-${last}-${len}step`;
}

export interface DistillOptions {
  /** Minimum number of distinct runs a pattern must appear in. Default: 2. */
  minOccurrences?: number;
  /** Only consider runs finished within this many ms. Default: 7 days. */
  windowMs?: number;
  /** N-gram length. Default: 3. */
  n?: number;
}

/**
 * Mine completed runs for repeated host-call sequences.
 *
 * Returns patterns sorted by occurrences descending. Each pattern includes
 * occurrence count, average cost/duration, and a suggested preset name.
 */
export function distill(
  store: ForgeryActivityStore,
  options: DistillOptions = {},
): DistilledPattern[] {
  const minOccurrences = options.minOccurrences ?? 2;
  const windowMs = options.windowMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  const n = options.n ?? DEFAULT_N;

  const now = Date.now();
  const cutoff = now - windowMs;

  // ── gather completed runs within the window ──────────────────────────

  const runs = store.runs().filter(
    (r) =>
      r.status === "completed" &&
      r.finishedAt !== undefined &&
      r.finishedAt >= cutoff,
  );

  if (runs.length === 0) return [];

  // ── map pattern → set of run indices containing it ───────────────────

  // patternKey → { occurrences, runIndices, totalCost, totalDuration, firstSeen, lastSeen }
  const patternData = new Map<
    string,
    {
      occurrences: number;
      runIndices: Set<number>;
      totalCost: number;
      totalDuration: number;
      firstSeen: number;
      lastSeen: number;
    }
  >();

  runs.forEach((run, ri) => {
    const refs = run.calls.map((c) => c.ref);
    if (refs.length < n) return;

    const grams = callNgrams(refs, n);
    const seenInThisRun = new Set<string>();

    for (const gram of grams) {
      const key = patternString(gram);
      // Count each pattern once per run (dedupe within a run).
      if (seenInThisRun.has(key)) continue;
      seenInThisRun.add(key);

      let data = patternData.get(key);
      if (!data) {
        data = {
          occurrences: 0,
          runIndices: new Set(),
          totalCost: 0,
          totalDuration: 0,
          firstSeen: run.startedAt,
          lastSeen: run.finishedAt ?? run.startedAt,
        };
        patternData.set(key, data);
      }
      data.occurrences += 1;
      data.runIndices.add(ri);

      const cost = run.metrics?.cost ?? 0;
      const duration = run.finishedAt ? run.finishedAt - run.startedAt : 0;
      data.totalCost += cost;
      data.totalDuration += duration;

      if (run.startedAt < data.firstSeen) data.firstSeen = run.startedAt;
      if ((run.finishedAt ?? run.startedAt) > data.lastSeen) {
        data.lastSeen = run.finishedAt ?? run.startedAt;
      }
    }
  });

  // ── build results, filter by minOccurrences, sort desc ──
  const results: DistilledPattern[] = [];

  for (const [key, data] of patternData) {
    if (data.occurrences < minOccurrences) continue;

    const grams = key.split(" → ");
    results.push({
      pattern: key,
      suggestedName: suggestName(grams),
      occurrences: data.occurrences,
      avgCost: data.occurrences > 0 ? data.totalCost / data.occurrences : 0,
      avgDuration: data.occurrences > 0 ? data.totalDuration / data.occurrences : 0,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    });
  }

  results.sort((a, b) => b.occurrences - a.occurrences);
  return results;
}

export default distill;
