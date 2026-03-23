/**
 * Tests for src/audit-log.ts — append-only audit log with temp dir.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { AuditLog, type AuditEntry } from "../src/audit-log.js";

describe("AuditLog", () => {
  let tmpDir: string;
  let logPath: string;
  let auditLog: AuditLog;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-log-test-"));
    logPath = path.join(tmpDir, "test-audit.jsonl");
    auditLog = new AuditLog(logPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("record()", () => {
    it("creates the log file on first record", () => {
      auditLog.record({
        timestamp: new Date().toISOString(),
        run_id: "run-001",
        fixture_name: "my_fixture",
        passed: true,
        duration_ms: 100,
      });

      expect(fs.existsSync(logPath)).toBe(true);
    });

    it("appends entries as JSONL (one JSON per line)", () => {
      const entry1: AuditEntry = {
        timestamp: "2024-01-01T00:00:00.000Z",
        run_id: "run-001",
        fixture_name: "fixture_a",
        passed: true,
        duration_ms: 50,
      };
      const entry2: AuditEntry = {
        timestamp: "2024-01-01T00:01:00.000Z",
        run_id: "run-002",
        fixture_name: "fixture_b",
        passed: false,
        duration_ms: 200,
      };

      auditLog.record(entry1);
      auditLog.record(entry2);

      const raw = fs.readFileSync(logPath, "utf-8");
      const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({ run_id: "run-001" });
      expect(JSON.parse(lines[1])).toMatchObject({ run_id: "run-002" });
    });

    it("includes all required fields in the log entry", () => {
      const entry: AuditEntry = {
        timestamp: "2024-06-15T12:00:00.000Z",
        run_id: "abc-123",
        fixture_name: "my_test",
        passed: true,
        duration_ms: 300,
        user_id: "user42",
      };

      auditLog.record(entry);

      const raw = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(raw.trim()) as AuditEntry;

      expect(parsed.timestamp).toBe("2024-06-15T12:00:00.000Z");
      expect(parsed.run_id).toBe("abc-123");
      expect(parsed.fixture_name).toBe("my_test");
      expect(parsed.passed).toBe(true);
      expect(parsed.duration_ms).toBe(300);
      expect(parsed.user_id).toBe("user42");
    });

    it("creates parent directories if they do not exist", () => {
      const nestedPath = path.join(tmpDir, "nested", "dirs", "audit.jsonl");
      const nestedLog = new AuditLog(nestedPath);
      nestedLog.record({
        timestamp: new Date().toISOString(),
        run_id: "r1",
        fixture_name: "f1",
        passed: true,
        duration_ms: 10,
      });
      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe("export()", () => {
    beforeEach(() => {
      const entries: AuditEntry[] = [
        {
          timestamp: "2024-01-01T00:00:00.000Z",
          run_id: "r1",
          fixture_name: "f1",
          passed: true,
          duration_ms: 10,
        },
        {
          timestamp: "2024-01-15T12:00:00.000Z",
          run_id: "r2",
          fixture_name: "f2",
          passed: false,
          duration_ms: 20,
        },
        {
          timestamp: "2024-02-01T00:00:00.000Z",
          run_id: "r3",
          fixture_name: "f3",
          passed: true,
          duration_ms: 30,
        },
      ];
      for (const e of entries) auditLog.record(e);
    });

    it("returns all entries when no filters are applied", () => {
      const result = auditLog.export();
      expect(result).toHaveLength(3);
    });

    it("filters by 'from' timestamp (inclusive)", () => {
      const result = auditLog.export("2024-01-15T12:00:00.000Z");
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.run_id)).toEqual(["r2", "r3"]);
    });

    it("filters by 'to' timestamp (inclusive)", () => {
      const result = auditLog.export(undefined, "2024-01-15T12:00:00.000Z");
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.run_id)).toEqual(["r1", "r2"]);
    });

    it("filters by both 'from' and 'to'", () => {
      const result = auditLog.export("2024-01-15T12:00:00.000Z", "2024-01-15T12:00:00.000Z");
      expect(result).toHaveLength(1);
      expect(result[0].run_id).toBe("r2");
    });

    it("returns empty array when log file does not exist", () => {
      const emptyLog = new AuditLog(path.join(tmpDir, "nonexistent.jsonl"));
      // Don't call record, so file doesn't exist
      const result = emptyLog.export();
      expect(result).toHaveLength(0);
    });

    it("returns empty array when no entries match the filter", () => {
      const result = auditLog.export("2025-01-01T00:00:00.000Z");
      expect(result).toHaveLength(0);
    });
  });
});
