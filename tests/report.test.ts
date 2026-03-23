import { describe, it, expect, vi } from "vitest";
import { regressionReportTool, compareResultsTool } from "../src/tools/report.js";
import type { EvalDb, RunRecord, CaseResultRecord } from "../src/db.js";

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-001",
    suite_name: "default",
    started_at: 1700000000000,
    ended_at: 1700000005000,
    total_cases: 1,
    passed: 1,
    failed: 0,
    format: "console",
    ...overrides,
  };
}

function makeCase(overrides: Partial<CaseResultRecord> = {}): CaseResultRecord {
  return {
    id: "case-001",
    run_id: "run-001",
    case_name: "my_test",
    status: "pass",
    duration_ms: 100,
    error_message: null,
    assertions_json: "[]",
    created_at: 1700000001000,
    ...overrides,
  };
}

function makeDb(runs: RunRecord[], casesByRunId: Record<string, CaseResultRecord[]>): EvalDb {
  return {
    getAllRuns: vi.fn(() => runs),
    getRunById: vi.fn((id: string) => runs.find((r) => r.id === id)),
    getCaseResultsForRun: vi.fn((runId: string) => casesByRunId[runId] ?? []),
    insertRun: vi.fn(),
    updateRun: vi.fn(),
    insertCaseResult: vi.fn(),
    getLastRun: vi.fn(),
    close: vi.fn(),
  } as unknown as EvalDb;
}

describe("regressionReportTool", () => {
  it("returns a message when no run history exists", async () => {
    const db = makeDb([], {});
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("No run history found");
  });

  it("returns single-run message when only one run exists", async () => {
    const run = makeRun({ id: "run-001" });
    const db = makeDb([run], { "run-001": [makeCase()] });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("Only one run found");
    expect(result).toContain("run-001");
  });

  it("shows case status in single-run report", async () => {
    const run = makeRun({ id: "run-001" });
    const db = makeDb([run], { "run-001": [makeCase({ case_name: "my_test", status: "pass" })] });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("my_test");
  });

  it("shows single-run failing case with x symbol", async () => {
    const run = makeRun({ id: "run-001", failed: 1, passed: 0 });
    const db = makeDb([run], {
      "run-001": [makeCase({ case_name: "bad_test", status: "fail" })],
    });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("bad_test");
  });

  it("shows regression when a previously passing case now fails", async () => {
    const latest = makeRun({ id: "run-002", started_at: 1700000010000 });
    const previous = makeRun({ id: "run-001", started_at: 1700000000000 });
    const db = makeDb([latest, previous], {
      "run-001": [makeCase({ case_name: "flaky_test", status: "pass", run_id: "run-001" })],
      "run-002": [
        makeCase({ id: "c2", case_name: "flaky_test", status: "fail", run_id: "run-002" }),
      ],
    });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("REGRESSION");
    expect(result).toContain("flaky_test");
  });

  it("shows fixed cases when a previously failing case now passes", async () => {
    const latest = makeRun({ id: "run-002", started_at: 1700000010000 });
    const previous = makeRun({ id: "run-001", started_at: 1700000000000 });
    const db = makeDb([latest, previous], {
      "run-001": [makeCase({ case_name: "fixed_test", status: "fail", run_id: "run-001" })],
      "run-002": [
        makeCase({ id: "c2", case_name: "fixed_test", status: "pass", run_id: "run-002" }),
      ],
    });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("FIXED");
    expect(result).toContain("fixed_test");
  });

  it("shows new cases added since last run", async () => {
    const latest = makeRun({ id: "run-002", started_at: 1700000010000 });
    const previous = makeRun({ id: "run-001", started_at: 1700000000000 });
    const db = makeDb([latest, previous], {
      "run-001": [],
      "run-002": [makeCase({ id: "c2", case_name: "new_test", run_id: "run-002" })],
    });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("NEW CASES");
    expect(result).toContain("new_test");
  });

  it("shows removed cases since last run", async () => {
    const latest = makeRun({ id: "run-002", started_at: 1700000010000 });
    const previous = makeRun({ id: "run-001", started_at: 1700000000000 });
    const db = makeDb([latest, previous], {
      "run-001": [makeCase({ case_name: "removed_test", run_id: "run-001" })],
      "run-002": [],
    });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("REMOVED");
    expect(result).toContain("removed_test");
  });

  it("shows no changes when all cases are unchanged", async () => {
    const latest = makeRun({ id: "run-002", started_at: 1700000010000 });
    const previous = makeRun({ id: "run-001", started_at: 1700000000000 });
    const db = makeDb([latest, previous], {
      "run-001": [makeCase({ case_name: "stable_test", status: "pass", run_id: "run-001" })],
      "run-002": [
        makeCase({ id: "c2", case_name: "stable_test", status: "pass", run_id: "run-002" }),
      ],
    });
    const result = await regressionReportTool("/tmp/fixtures", db);
    expect(result).toContain("No changes detected");
  });
});

describe("compareResultsTool", () => {
  it("throws when run A is not found", async () => {
    const db = makeDb([], {});
    await expect(compareResultsTool("missing-a", "missing-b", db)).rejects.toThrow(
      "Run not found: missing-a",
    );
  });

  it("throws when run B is not found", async () => {
    const runA = makeRun({ id: "run-a" });
    const db = makeDb([runA], {});
    await expect(compareResultsTool("run-a", "missing-b", db)).rejects.toThrow(
      "Run not found: missing-b",
    );
  });

  it("returns a diff report comparing two runs", async () => {
    const runA = makeRun({ id: "run-a", started_at: 1700000000000 });
    const runB = makeRun({ id: "run-b", started_at: 1700000010000 });
    const db = makeDb([runA, runB], {
      "run-a": [makeCase({ case_name: "test_1", status: "pass", run_id: "run-a" })],
      "run-b": [makeCase({ id: "c2", case_name: "test_1", status: "pass", run_id: "run-b" })],
    });
    const result = await compareResultsTool("run-a", "run-b", db);
    expect(result).toContain("Regression Report");
    expect(result).toContain("run-a");
    expect(result).toContain("run-b");
  });

  it("shows regressions between the two specified runs", async () => {
    const runA = makeRun({ id: "run-a" });
    const runB = makeRun({ id: "run-b" });
    const db = makeDb([runA, runB], {
      "run-a": [makeCase({ case_name: "regressed_test", status: "pass", run_id: "run-a" })],
      "run-b": [
        makeCase({ id: "c2", case_name: "regressed_test", status: "fail", run_id: "run-b" }),
      ],
    });
    const result = await compareResultsTool("run-a", "run-b", db);
    expect(result).toContain("REGRESSION");
    expect(result).toContain("regressed_test");
  });
});
