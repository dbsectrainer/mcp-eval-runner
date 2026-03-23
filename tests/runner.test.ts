import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCase, runSuite } from "../src/runner.js";
import type { Fixture } from "../src/fixture.js";
import type { EvalDb } from "../src/db.js";

// Minimal EvalDb mock — avoids node:sqlite dependency in tests
function createMockDb(): EvalDb {
  const runs: Record<string, unknown> = {};
  const caseResults: unknown[] = [];

  return {
    insertRun: vi.fn((run) => {
      runs[run.id] = run;
    }),
    updateRun: vi.fn((id, updates) => {
      if (runs[id]) Object.assign(runs[id] as object, updates);
    }),
    insertCaseResult: vi.fn((result) => {
      caseResults.push(result);
    }),
    getLastRun: vi.fn(() => undefined),
    getRunById: vi.fn((id) => runs[id] as ReturnType<EvalDb["getRunById"]>),
    getCaseResultsForRun: vi.fn(() => caseResults as ReturnType<EvalDb["getCaseResultsForRun"]>),
    getAllRuns: vi.fn(() => Object.values(runs) as ReturnType<EvalDb["getAllRuns"]>),
    close: vi.fn(),
  } as unknown as EvalDb;
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    name: "test_fixture",
    steps: [
      {
        id: "s1",
        tool: "my_tool",
        input: {},
      },
    ],
    ...overrides,
  };
}

describe("runCase", () => {
  it("returns pass for a fixture with no assertions", async () => {
    const result = await runCase(makeFixture(), { timeoutMs: 5000 });
    expect(result.status).toBe("pass");
    expect(result.case_name).toBe("test_fixture");
    expect(result.steps).toHaveLength(1);
  });

  it("returns pass when assertions all succeed", async () => {
    const fixture = makeFixture({
      steps: [
        {
          id: "s1",
          tool: "my_tool",
          input: {},
          expected_output: "hello world",
          expect: { output_contains: "hello", tool_called: "my_tool" },
        },
      ],
    });
    const result = await runCase(fixture, { timeoutMs: 5000 });
    expect(result.status).toBe("pass");
    expect(result.steps[0].assertions.every((a) => a.passed)).toBe(true);
  });

  it("returns fail when an assertion fails", async () => {
    const fixture = makeFixture({
      steps: [
        {
          id: "s1",
          tool: "my_tool",
          input: {},
          expected_output: "hello world",
          expect: { output_contains: "missing_text" },
        },
      ],
    });
    const result = await runCase(fixture, { timeoutMs: 5000 });
    expect(result.status).toBe("fail");
    expect(result.steps[0].assertions.some((a) => !a.passed)).toBe(true);
  });

  it("returns fail when tool_called assertion does not match", async () => {
    const fixture = makeFixture({
      steps: [
        {
          id: "s1",
          tool: "my_tool",
          input: {},
          expect: { tool_called: "other_tool" },
        },
      ],
    });
    const result = await runCase(fixture, { timeoutMs: 5000 });
    expect(result.status).toBe("fail");
  });

  it("tracks duration_ms", async () => {
    const result = await runCase(makeFixture(), { timeoutMs: 5000 });
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("handles multiple steps and fails if any step fails", async () => {
    const fixture = makeFixture({
      steps: [
        { id: "s1", tool: "tool_a", input: {}, expected_output: "ok" },
        {
          id: "s2",
          tool: "tool_b",
          input: {},
          expected_output: "hello",
          expect: { output_equals: "nope" },
        },
      ],
    });
    const result = await runCase(fixture, { timeoutMs: 5000 });
    expect(result.status).toBe("fail");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe("pass");
    expect(result.steps[1].status).toBe("fail");
  });
});

describe("runSuite", () => {
  let db: EvalDb;

  beforeEach(() => {
    db = createMockDb();
  });

  it("runs a suite and returns correct pass/fail counts", async () => {
    const fixtures: Fixture[] = [
      makeFixture({ name: "passing" }),
      makeFixture({
        name: "failing",
        steps: [
          {
            id: "s1",
            tool: "t",
            input: {},
            expected_output: "x",
            expect: { output_equals: "y" },
          },
        ],
      }),
    ];

    const opts = {
      fixturesDir: "/tmp/test-evals",
      dbPath: "/tmp/test.db",
      timeoutMs: 5000,
      format: "console" as const,
    };

    const result = await runSuite(fixtures, "test_suite", opts, db);
    expect(result.total_cases).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.suite_name).toBe("test_suite");
    expect(result.run_id).toBeTruthy();
  });

  it("calls insertRun and insertCaseResult on the db", async () => {
    const fixtures: Fixture[] = [makeFixture({ name: "db_test" })];
    const opts = {
      fixturesDir: "/tmp/test-evals",
      dbPath: "/tmp/test.db",
      timeoutMs: 5000,
      format: "console" as const,
    };

    await runSuite(fixtures, "db_suite", opts, db);

    expect(db.insertRun).toHaveBeenCalledTimes(1);
    expect(db.insertCaseResult).toHaveBeenCalledTimes(1);
    expect(db.updateRun).toHaveBeenCalled();

    const insertRunCall = (db.insertRun as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertRunCall.suite_name).toBe("db_suite");
  });

  it("handles empty fixture list", async () => {
    const opts = {
      fixturesDir: "/tmp/test-evals",
      dbPath: "/tmp/test.db",
      timeoutMs: 5000,
      format: "console" as const,
    };
    const result = await runSuite([], "empty_suite", opts, db);
    expect(result.total_cases).toBe(0);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("records the run_id in the result", async () => {
    const opts = {
      fixturesDir: "/tmp/test-evals",
      dbPath: "/tmp/test.db",
      timeoutMs: 5000,
      format: "console" as const,
    };
    const result = await runSuite([makeFixture({ name: "id_test" })], "id_suite", opts, db);
    expect(typeof result.run_id).toBe("string");
    expect(result.run_id.length).toBeGreaterThan(0);
  });
});
