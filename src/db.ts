/**
 * SQLite schema and queries for MCP Eval Runner run history.
 * Uses the built-in node:sqlite module (Node.js >= 22.5).
 */

// node:sqlite is a stable built-in since Node 22.5
import { DatabaseSync } from "node:sqlite";
import path from "path";
import os from "os";
import fs from "fs";

export interface RunRecord {
  id: string;
  suite_name: string;
  started_at: number;
  ended_at: number | null;
  total_cases: number;
  passed: number;
  failed: number;
  format: string;
}

export interface CaseResultRecord {
  id: string;
  run_id: string;
  case_name: string;
  status: "pass" | "fail" | "error";
  duration_ms: number | null;
  error_message: string | null;
  assertions_json: string | null;
  created_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  suite_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'console'
);

CREATE TABLE IF NOT EXISTS case_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_name TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  assertions_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);
`;

/**
 * Expand ~ to the user's home directory.
 */
export function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export class EvalDb {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    const resolved = expandHome(dbPath);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(resolved);
    this.db.exec(SCHEMA);
  }

  insertRun(run: RunRecord): void {
    const stmt = this.db.prepare(
      `INSERT INTO runs (id, suite_name, started_at, ended_at, total_cases, passed, failed, format)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      run.id,
      run.suite_name,
      run.started_at,
      run.ended_at,
      run.total_cases,
      run.passed,
      run.failed,
      run.format,
    );
  }

  updateRun(
    id: string,
    updates: Partial<Pick<RunRecord, "ended_at" | "total_cases" | "passed" | "failed">>,
  ): void {
    const entries = Object.entries(updates);
    if (entries.length === 0) return;
    const fields = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v);
    this.db.prepare(`UPDATE runs SET ${fields} WHERE id = ?`).run(...values, id);
  }

  insertCaseResult(result: CaseResultRecord): void {
    const stmt = this.db.prepare(
      `INSERT INTO case_results (id, run_id, case_name, status, duration_ms, error_message, assertions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      result.id,
      result.run_id,
      result.case_name,
      result.status,
      result.duration_ms,
      result.error_message,
      result.assertions_json,
      result.created_at,
    );
  }

  getLastRun(suiteName?: string): RunRecord | undefined {
    if (suiteName) {
      return this.db
        .prepare(`SELECT * FROM runs WHERE suite_name = ? ORDER BY started_at DESC LIMIT 1`)
        .get(suiteName) as RunRecord | undefined;
    }
    return this.db.prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT 1`).get() as
      | RunRecord
      | undefined;
  }

  getRunById(id: string): RunRecord | undefined {
    return this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRecord | undefined;
  }

  getCaseResultsForRun(runId: string): CaseResultRecord[] {
    return this.db
      .prepare(`SELECT * FROM case_results WHERE run_id = ? ORDER BY created_at ASC`)
      .all(runId) as unknown as CaseResultRecord[];
  }

  getAllRuns(limit = 50): RunRecord[] {
    return this.db
      .prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ?`)
      .all(limit) as unknown as RunRecord[];
  }

  close(): void {
    this.db.close();
  }
}
