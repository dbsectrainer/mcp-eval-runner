/**
 * SQLite schema and queries for MCP Eval Runner run history.
 * Uses the built-in node:sqlite module (Node.js >= 22.5).
 */
// node:sqlite is a stable built-in since Node 22.5
import { DatabaseSync } from "node:sqlite";
import path from "path";
import os from "os";
import fs from "fs";
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
export function expandHome(p) {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}
export class EvalDb {
  db;
  constructor(dbPath) {
    const resolved = expandHome(dbPath);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(resolved);
    this.db.exec(SCHEMA);
  }
  insertRun(run) {
    const stmt = this.db
      .prepare(`INSERT INTO runs (id, suite_name, started_at, ended_at, total_cases, passed, failed, format)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
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
  updateRun(id, updates) {
    const entries = Object.entries(updates);
    if (entries.length === 0) return;
    const fields = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v);
    this.db.prepare(`UPDATE runs SET ${fields} WHERE id = ?`).run(...values, id);
  }
  insertCaseResult(result) {
    const stmt = this.db
      .prepare(`INSERT INTO case_results (id, run_id, case_name, status, duration_ms, error_message, assertions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
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
  getLastRun(suiteName) {
    if (suiteName) {
      return this.db
        .prepare(`SELECT * FROM runs WHERE suite_name = ? ORDER BY started_at DESC LIMIT 1`)
        .get(suiteName);
    }
    return this.db.prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT 1`).get();
  }
  getRunById(id) {
    return this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id);
  }
  getCaseResultsForRun(runId) {
    return this.db
      .prepare(`SELECT * FROM case_results WHERE run_id = ? ORDER BY created_at ASC`)
      .all(runId);
  }
  getAllRuns(limit = 50) {
    return this.db.prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ?`).all(limit);
  }
  close() {
    this.db.close();
  }
}
