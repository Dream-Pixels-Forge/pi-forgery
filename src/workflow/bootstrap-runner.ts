/**
 * pi-forgery — bootstrap runner.
 *
 * EGM bootstrap mode: recursive bottom-up codebase documentation. For each
 * source module, runs the bootstrap pipeline (scan modules → document
 * interface → document invariants → document side-effects → upsert sentinel
 * blocks) and writes `/// @forgery-bootstrap` sentinel comment blocks so
 * future drift detection can verify docs match code.
 *
 * Runs are read-then-write on source files only (sentinel block insertion),
 * never rewriting logic. One pass per module.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkflowEngine, type WorkflowResult } from "./engine.js";

export interface SentinelData {
  interface: string;
  invariants: string;
  sideEffects: string;
}

/** Sentinel block inserted at the top of each documented module. */
export function sentinelBlock(data: SentinelData): string {
  const lines = [
    "/// @forgery-bootstrap",
    `///   interface: ${data.interface || "—"}`,
    `///   invariants: ${data.invariants || "—"}`,
    `///   sideEffects: ${data.sideEffects || "—"}`,
    "/// @end",
  ];
  return lines.join("\n") + "\n";
}

export class BootstrapRunner {
  private readonly engine: WorkflowEngine;
  private readonly cwd: string;

  constructor(engine: WorkflowEngine, cwd: string) {
    this.engine = engine;
    this.cwd = cwd;
  }

  /** Enumerate TypeScript source modules under src/, recursively. */
  enumerateModules(srcDir = join(this.cwd, "src")): string[] {
    const modules: string[] = [];
    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = join(dir, name);
        let isDir = false;
        try {
          isDir = statSync(full).isDirectory();
        } catch {
          continue;
        }
        if (isDir) {
          walk(full);
        } else if (name.endsWith(".ts")) {
          modules.push(full);
        }
      }
    };
    walk(srcDir);
    return modules.sort();
  }

  /** Run the bootstrap pipeline against a single module. */
  async runModule(modulePath: string): Promise<WorkflowResult> {
    const result = await this.engine.run("bootstrap", modulePath);
    if ("error" in result) {
      throw new Error(`bootstrap run failed: ${result.error}`);
    }
    return result;
  }

  /** Upsert a @forgery-bootstrap sentinel block at the top of a file. */
  upsertSentinel(filePath: string, data: SentinelData): void {
    if (!existsSync(filePath)) {
      throw new Error(`bootstrap: cannot upsert sentinel, missing file ${filePath}`);
    }
    const existing = readFileSync(filePath, "utf8");
    const block = sentinelBlock(data);
    // Idempotent: if a sentinel block already exists, replace it in place.
    const updated = this.#replaceOrPrependSentinel(existing, block);
    writeFileSync(filePath, updated, "utf8");
  }

  #replaceOrPrependSentinel(content: string, block: string): string {
    const startMarker = "/// @forgery-bootstrap";
    const endMarker = "/// @end";
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) {
      // No existing sentinel: prepend after any leading file header comment.
      return block + "\n" + content;
    }
    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
      // Malformed sentinel: append block at end of file.
      return content.trimEnd() + "\n\n" + block;
    }
    const endLineEnd = content.indexOf("\n", endIdx);
    const after = endLineEnd === -1 ? "" : content.slice(endLineEnd + 1);
    return block + after;
  }
}