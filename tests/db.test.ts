import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// node:sqlite is an experimental Node.js 22.5+ built-in that Vite can't resolve.
// We mock it at the module level so Vitest intercepts before Vite tries to bundle it.
vi.mock("node:sqlite", () => {
  // Minimal in-memory SQLite implementation using a Map to simulate tables.
  class StatementSync {
    private sql: string;
    private db: MockDb;
    constructor(db: MockDb, sql: string) {
      this.db = db;
      this.sql = sql;
    }
    run(...args: unknown[]) {
      this.db._exec(this.sql, args);
    }
    get(...args: unknown[]) {
      return this.db._query(this.sql, args, true);
    }
    all(...args: unknown[]) {
      return this.db._query(this.sql, args, false);
    }
  }

  class MockDb {
    private tables: Record<string, Record<string, unknown>[]> = {};
    _exec(sql: string, params: unknown[]) {
      // Handle CREATE TABLE IF NOT EXISTS (ignore, just ensure table exists)
      const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (createMatch) {
        if (!this.tables[createMatch[1]]) this.tables[createMatch[1]] = [];
        return;
      }
      // Handle INSERT INTO
      const insertMatch = sql.match(/INSERT INTO (\w+)/i);
      if (insertMatch) {
        const tableName = insertMatch[1];
        if (!this.tables[tableName]) this.tables[tableName] = [];
        // Extract column names from the SQL
        const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        if (colMatch) {
          const cols = colMatch[1].split(",").map((c) => c.trim());
          const row: Record<string, unknown> = {};
          cols.forEach((col, i) => {
            row[col] = params[i];
          });
          this.tables[tableName].push(row);
        }
        return;
      }
      // Handle UPDATE
      const updateMatch = sql.match(/UPDATE (\w+) SET (.+) WHERE (\w+) = \?/i);
      if (updateMatch) {
        const tableName = updateMatch[1];
        const setClause = updateMatch[2];
        const whereCol = updateMatch[3];
        const setCols = setClause.split(",").map((c) => c.trim().split(" = ")[0]);
        const whereVal = params[params.length - 1];
        const setVals = params.slice(0, params.length - 1);
        if (this.tables[tableName]) {
          this.tables[tableName].forEach((row) => {
            if (row[whereCol] === whereVal) {
              setCols.forEach((col, i) => {
                row[col] = setVals[i];
              });
            }
          });
        }
        return;
      }
    }
    _query(sql: string, params: unknown[], single: boolean) {
      // SELECT * FROM table WHERE col = ? ORDER BY ... LIMIT ?
      const tableMatch = sql.match(/FROM (\w+)/i);
      if (!tableMatch) return single ? undefined : [];
      const tableName = tableMatch[1];
      let rows = (this.tables[tableName] ?? []).slice();

      // WHERE col = ?
      const whereMatch = sql.match(/WHERE (\w+) = \?/i);
      if (whereMatch) {
        const col = whereMatch[1];
        rows = rows.filter((r) => r[col] === params[0]);
      }

      // ORDER BY col DESC
      const orderMatch = sql.match(/ORDER BY (\w+) (ASC|DESC)/i);
      if (orderMatch) {
        const col = orderMatch[1];
        const dir = orderMatch[2].toUpperCase();
        rows = rows.sort((a, b) => {
          const av = a[col] as number;
          const bv = b[col] as number;
          return dir === "DESC" ? bv - av : av - bv;
        });
      }

      // LIMIT ?
      const limitMatch = sql.match(/LIMIT \?/i);
      if (limitMatch) {
        const limitIdx = params.length - 1;
        rows = rows.slice(0, params[limitIdx] as number);
      }

      return single ? rows[0] : rows;
    }
    exec(sql: string) {
      // Handle multi-statement DDL (separated by semicolons)
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        this._exec(stmt, []);
      }
    }
    prepare(sql: string) {
      return new StatementSync(this, sql);
    }
    close() {}
  }

  return {
    DatabaseSync: MockDb,
  };
});

import { EvalDb, expandHome } from "../src/db.js";

describe("expandHome", () => {
  it("expands ~ at the start of a path", () => {
    const result = expandHome("~/foo/bar");
    expect(result).not.toContain("~");
    expect(result).toContain("foo/bar");
  });

  it("expands ~ alone to the home directory", () => {
    const result = expandHome("~");
    expect(result).toBe(os.homedir());
  });

  it("leaves non-home paths unchanged", () => {
    const result = expandHome("/absolute/path");
    expect(result).toBe("/absolute/path");
  });

  it("leaves relative paths unchanged", () => {
    const result = expandHome("relative/path");
    expect(result).toBe("relative/path");
  });
});

describe("EvalDb", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: EvalDb;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-db-test-"));
    dbPath = path.join(tmpDir, "test.db");
    db = new EvalDb(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("insertRun / getRunById", () => {
    it("inserts and retrieves a run by ID", () => {
      db.insertRun({
        id: "run-001",
        suite_name: "my_suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 5,
        passed: 3,
        failed: 2,
        format: "console",
      });

      const found = db.getRunById("run-001");
      expect(found).toBeDefined();
      expect(found!.id).toBe("run-001");
      expect(found!.suite_name).toBe("my_suite");
      expect(found!.total_cases).toBe(5);
      expect(found!.passed).toBe(3);
      expect(found!.failed).toBe(2);
    });

    it("returns undefined for a non-existent run ID", () => {
      expect(db.getRunById("does-not-exist")).toBeUndefined();
    });
  });

  describe("updateRun", () => {
    it("updates ended_at on a run", () => {
      db.insertRun({
        id: "run-002",
        suite_name: "suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 1,
        passed: 0,
        failed: 0,
        format: "console",
      });

      db.updateRun("run-002", { ended_at: 1700000005000, passed: 1 });

      const found = db.getRunById("run-002");
      expect(found!.ended_at).toBe(1700000005000);
      expect(found!.passed).toBe(1);
    });

    it("does nothing when updates are empty", () => {
      db.insertRun({
        id: "run-003",
        suite_name: "suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 1,
        passed: 0,
        failed: 0,
        format: "console",
      });
      expect(() => db.updateRun("run-003", {})).not.toThrow();
    });
  });

  describe("insertCaseResult / getCaseResultsForRun", () => {
    it("inserts and retrieves case results for a run", () => {
      db.insertRun({
        id: "run-case-001",
        suite_name: "suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 1,
        passed: 0,
        failed: 0,
        format: "console",
      });

      db.insertCaseResult({
        id: "case-001",
        run_id: "run-case-001",
        case_name: "my_test",
        status: "pass",
        duration_ms: 150,
        error_message: null,
        assertions_json: "[]",
        created_at: 1700000001000,
      });

      const cases = db.getCaseResultsForRun("run-case-001");
      expect(cases).toHaveLength(1);
      expect(cases[0].case_name).toBe("my_test");
      expect(cases[0].status).toBe("pass");
    });

    it("returns empty array for a run with no cases", () => {
      db.insertRun({
        id: "run-empty",
        suite_name: "suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 0,
        passed: 0,
        failed: 0,
        format: "console",
      });

      const cases = db.getCaseResultsForRun("run-empty");
      expect(cases).toHaveLength(0);
    });
  });

  describe("getLastRun", () => {
    it("returns undefined when no runs exist", () => {
      expect(db.getLastRun()).toBeUndefined();
    });

    it("returns the most recent run", () => {
      db.insertRun({
        id: "run-old",
        suite_name: "suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 1,
        passed: 1,
        failed: 0,
        format: "console",
      });
      db.insertRun({
        id: "run-new",
        suite_name: "suite",
        started_at: 1700000010000,
        ended_at: null,
        total_cases: 1,
        passed: 1,
        failed: 0,
        format: "console",
      });

      const last = db.getLastRun();
      expect(last!.id).toBe("run-new");
    });

    it("filters by suite name when provided", () => {
      db.insertRun({
        id: "run-suite-a",
        suite_name: "suite_a",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 1,
        passed: 1,
        failed: 0,
        format: "console",
      });
      db.insertRun({
        id: "run-suite-b",
        suite_name: "suite_b",
        started_at: 1700000010000,
        ended_at: null,
        total_cases: 1,
        passed: 1,
        failed: 0,
        format: "console",
      });

      const last = db.getLastRun("suite_a");
      expect(last!.id).toBe("run-suite-a");
    });
  });

  describe("getAllRuns", () => {
    it("returns empty array when no runs exist", () => {
      expect(db.getAllRuns()).toHaveLength(0);
    });

    it("returns all runs ordered by started_at descending", () => {
      db.insertRun({
        id: "run-first",
        suite_name: "suite",
        started_at: 1700000000000,
        ended_at: null,
        total_cases: 1,
        passed: 1,
        failed: 0,
        format: "console",
      });
      db.insertRun({
        id: "run-second",
        suite_name: "suite",
        started_at: 1700000010000,
        ended_at: null,
        total_cases: 1,
        passed: 1,
        failed: 0,
        format: "console",
      });

      const all = db.getAllRuns();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe("run-second"); // most recent first
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        db.insertRun({
          id: `run-lim-${i}`,
          suite_name: "suite",
          started_at: 1700000000000 + i * 1000,
          ended_at: null,
          total_cases: 1,
          passed: 1,
          failed: 0,
          format: "console",
        });
      }

      const limited = db.getAllRuns(3);
      expect(limited).toHaveLength(3);
    });
  });

  it("creates parent directories for nested db paths", () => {
    const nestedPath = path.join(tmpDir, "nested", "subdir", "test.db");
    const nestedDb = new EvalDb(nestedPath);
    // The parent dir should be created even though the mock db doesn't create a real file
    expect(fs.existsSync(path.join(tmpDir, "nested", "subdir"))).toBe(true);
    nestedDb.close();
  });
});
