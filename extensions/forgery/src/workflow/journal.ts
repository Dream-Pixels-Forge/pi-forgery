/**
 * pi-forgery — Durable Run Journal.
 *
 * Persists workflow chain phase state + artifacts to `.pi/forgery/journal/`
 * so a long chain survives a Pi restart. `workflow.resume(runId)` replays
 * completed phases from the journal and continues from the first incomplete
 * phase.
 *
 * Write-ahead: journal entry is written *before* a phase starts and updated
 * on completion — crash-safe, no lost phase state.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const JOURNAL_DIR = ".pi/forgery/journal";

export interface JournalStepEntry {
  stepIndex: number;
  pipeline: string;
  target: string;
  artifactPath?: string;
  status: "pending" | "running" | "completed" | "failed" | "stopped" | "paused";
  phases: Array<{
    phaseId: string;
    phaseName: string;
    findings: number;
    totals: { blocker: number; major: number; nit: number };
  }>;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface JournalEntry {
  runId: string;
  steps: JournalStepEntry[];
  currentStep: number;
  status: "running" | "completed" | "failed" | "stopped" | "paused";
  gate: "proceed" | "pause" | "abort";
  createdAt: number;
  updatedAt: number;
}

/**
 * File-backed workflow journal. One JSON file per chain run id.
 */
export class WorkflowJournal {
  private dir: string;

  constructor(dir = JOURNAL_DIR) {
    this.dir = dir;
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* directory may already exist */
    }
  }

  /** Path for a run's journal file. */
  #path(runId: string): string {
    return join(this.dir, `${runId}.json`);
  }

  /** Write (create or overwrite) a journal entry. Write-ahead safe. */
  write(entry: JournalEntry): void {
    mkdirSync(this.dir, { recursive: true });
    const path = this.#path(entry.runId);
    const payload = { ...entry, updatedAt: Date.now() };
    writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
  }

  /** Read a journal entry by run id. Returns null if not found. */
  read(runId: string): JournalEntry | null {
    try {
      const raw = readFileSync(this.#path(runId), "utf8");
      return JSON.parse(raw) as JournalEntry;
    } catch {
      return null;
    }
  }

  /** List all journal entries (most recent first by mtime). */
  list(): JournalEntry[] {
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      const entries = files.map((f) => {
        try {
          return this.read(f.slice(0, -5));
        } catch {
          return null;
        }
      });
      return entries
        .filter((e): e is JournalEntry => e !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /** Check if a journal entry exists for a run id. */
  exists(runId: string): boolean {
    try {
      readFileSync(this.#path(runId));
      return true;
    } catch {
      return false;
    }
  }
}

export default WorkflowJournal;
