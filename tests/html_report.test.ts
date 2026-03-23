import { describe, it, expect, vi } from "vitest";
import { generateHtmlReportTool } from "../src/tools/html_report.js";
import type { EvalDb, RunRecord, CaseResultRecord } from "../src/db.js";

function makeDb(run: RunRecord | undefined, cases: CaseResultRecord[]): EvalDb {
  return {
    getRunById: vi.fn(() => run),
    getCaseResultsForRun: vi.fn(() => cases),
    insertRun: vi.fn(),
    updateRun: vi.fn(),
    insertCaseResult: vi.fn(),
    getLastRun: vi.fn(),
    getAllRuns: vi.fn(() => []),
    close: vi.fn(),
  } as unknown as EvalDb;
}

const baseRun: RunRecord = {
  id: "run-abc-123",
  suite_name: "my_suite",
  started_at: 1700000000000,
  ended_at: 1700000005000,
  total_cases: 2,
  passed: 1,
  failed: 1,
  format: "console",
};

const passingCase: CaseResultRecord = {
  id: "case-1",
  run_id: "run-abc-123",
  case_name: "happy_path",
  status: "pass",
  duration_ms: 42,
  error_message: null,
  assertions_json: JSON.stringify([
    [{ type: "output_contains", passed: true, message: 'Output contains "ok"' }],
  ]),
  created_at: 1700000001000,
};

const failingCase: CaseResultRecord = {
  id: "case-2",
  run_id: "run-abc-123",
  case_name: "bad_path",
  status: "fail",
  duration_ms: 77,
  error_message: null,
  assertions_json: JSON.stringify([
    [
      {
        type: "output_equals",
        passed: false,
        message: 'Expected "x" but got "y"',
      },
    ],
  ]),
  created_at: 1700000002000,
};

describe("generateHtmlReportTool", () => {
  it("throws when run_id is not found", () => {
    const db = makeDb(undefined, []);
    expect(() => generateHtmlReportTool("no-such-id", db)).toThrow("Run not found");
  });

  it("returns a string starting with <!DOCTYPE html>", () => {
    const db = makeDb(baseRun, [passingCase, failingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(typeof html).toBe("string");
    expect(html.trim().startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("includes the suite name in the HTML", () => {
    const db = makeDb(baseRun, [passingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("my_suite");
  });

  it("includes the run ID in the HTML", () => {
    const db = makeDb(baseRun, [passingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("run-abc-123");
  });

  it("includes passing and failing case names", () => {
    const db = makeDb(baseRun, [passingCase, failingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("happy_path");
    expect(html).toContain("bad_path");
  });

  it("includes pass/fail counts in summary", () => {
    const db = makeDb(baseRun, [passingCase, failingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    // Summary stat cards should show counts
    expect(html).toContain("1"); // passed
    expect(html).toContain("2"); // total
  });

  it("includes assertion messages in expandable sections", () => {
    const db = makeDb(baseRun, [passingCase, failingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("output_contains");
    expect(html).toContain("output_equals");
  });

  it("uses green color for passing overall result", () => {
    const allPassRun: RunRecord = { ...baseRun, passed: 2, failed: 0 };
    const db = makeDb(allPassRun, [passingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("#22c55e");
  });

  it("uses red color for failing overall result", () => {
    const db = makeDb(baseRun, [failingCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("#ef4444");
  });

  it("handles a run with no cases", () => {
    const emptyRun: RunRecord = { ...baseRun, total_cases: 0, passed: 0, failed: 0 };
    const db = makeDb(emptyRun, []);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("No cases found");
  });

  it("handles a case with null duration_ms gracefully", () => {
    const noTime: CaseResultRecord = { ...passingCase, duration_ms: null };
    const db = makeDb(baseRun, [noTime]);
    const html = generateHtmlReportTool("run-abc-123", db);
    // Should render dash for missing duration
    expect(html).toContain("—");
  });

  it("handles a case with an error_message", () => {
    const errCase: CaseResultRecord = {
      ...failingCase,
      status: "error",
      error_message: "Connection refused",
    };
    const db = makeDb(baseRun, [errCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).toContain("Connection refused");
  });

  it("escapes HTML special characters in case names", () => {
    const xssCase: CaseResultRecord = {
      ...passingCase,
      case_name: '<script>alert("xss")</script>',
    };
    const db = makeDb(baseRun, [xssCase]);
    const html = generateHtmlReportTool("run-abc-123", db);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles null ended_at (still-running)", () => {
    const inProgress: RunRecord = { ...baseRun, ended_at: null };
    const db = makeDb(inProgress, []);
    const html = generateHtmlReportTool("run-abc-123", db);
    // Should show dash instead of a duration
    expect(html).toContain("—");
  });

  it("handles malformed assertions_json without throwing", () => {
    const badJson: CaseResultRecord = { ...passingCase, assertions_json: "not-json{{{" };
    const db = makeDb(baseRun, [badJson]);
    expect(() => generateHtmlReportTool("run-abc-123", db)).not.toThrow();
  });
});
