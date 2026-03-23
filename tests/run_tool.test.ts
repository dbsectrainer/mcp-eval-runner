import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { runSuiteTool, runCaseTool } from "../src/tools/run.js";
import type { RunToolOptions } from "../src/tools/run.js";
import type { EvalDb } from "../src/db.js";

function makeMockDb(): EvalDb {
  return {
    insertRun: vi.fn(),
    updateRun: vi.fn(),
    insertCaseResult: vi.fn(),
    getLastRun: vi.fn(() => undefined),
    getRunById: vi.fn(() => undefined),
    getCaseResultsForRun: vi.fn(() => []),
    getAllRuns: vi.fn(() => []),
    close: vi.fn(),
  } as unknown as EvalDb;
}

function makeOpts(fixturesDir: string, db: EvalDb): RunToolOptions {
  return {
    fixturesDir,
    db,
    runnerOptions: {
      fixturesDir,
      dbPath: ":memory:",
      timeoutMs: 5000,
      format: "console",
    },
  };
}

describe("runSuiteTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-suite-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a no-fixtures message when directory is empty", async () => {
    const db = makeMockDb();
    const result = await runSuiteTool(makeOpts(tmpDir, db));
    expect(result).toContain("No fixtures found");
  });

  it("runs all fixtures and returns console-format output", async () => {
    const fixtureContent =
      "name: simple_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: hello\n    expect:\n      output_contains: hello\n";
    fs.writeFileSync(path.join(tmpDir, "simple.yaml"), fixtureContent);

    const db = makeMockDb();
    const result = await runSuiteTool(makeOpts(tmpDir, db));
    expect(result).toContain("MCP Eval Runner");
  });

  it("returns JSON format output when format is json", async () => {
    const fixtureContent =
      "name: json_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: hello\n";
    fs.writeFileSync(path.join(tmpDir, "json.yaml"), fixtureContent);

    const db = makeMockDb();
    const opts: RunToolOptions = {
      fixturesDir: tmpDir,
      db,
      runnerOptions: {
        fixturesDir: tmpDir,
        dbPath: ":memory:",
        timeoutMs: 5000,
        format: "json",
      },
    };
    const result = await runSuiteTool(opts);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("calls db.insertRun and db.insertCaseResult", async () => {
    const fixtureContent =
      "name: db_suite_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "db.yaml"), fixtureContent);

    const db = makeMockDb();
    await runSuiteTool(makeOpts(tmpDir, db));
    expect(db.insertRun).toHaveBeenCalled();
    expect(db.insertCaseResult).toHaveBeenCalled();
  });

  it("handles fixture with failing assertion in suite", async () => {
    const fixtureContent =
      "name: fail_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: hello\n    expect:\n      output_contains: missing_text\n";
    fs.writeFileSync(path.join(tmpDir, "fail.yaml"), fixtureContent);

    const db = makeMockDb();
    const result = await runSuiteTool(makeOpts(tmpDir, db));
    expect(result).toContain("fail");
  });
});

describe("runCaseTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-case-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when fixture name is not found", async () => {
    const db = makeMockDb();
    await expect(runCaseTool("nonexistent", makeOpts(tmpDir, db))).rejects.toThrow(
      'No fixture named "nonexistent"',
    );
  });

  it("runs a fixture found by name", async () => {
    const fixtureContent =
      "name: named_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "named_test.yaml"), fixtureContent);

    const db = makeMockDb();
    const result = await runCaseTool("named_test", makeOpts(tmpDir, db));
    expect(result).toContain("named_test");
  });

  it("runs a fixture found by filename (fallback)", async () => {
    const fixtureContent =
      "name: file_fixture\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    // File is named differently from fixture name - triggers filename lookup
    fs.writeFileSync(path.join(tmpDir, "file_lookup.yaml"), fixtureContent);

    const db = makeMockDb();
    const result = await runCaseTool("file_lookup", makeOpts(tmpDir, db));
    expect(result).toContain("file_lookup");
  });

  it("returns JSON when format is json", async () => {
    const fixtureContent =
      "name: json_case\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "json_case.yaml"), fixtureContent);

    const db = makeMockDb();
    const opts: RunToolOptions = {
      fixturesDir: tmpDir,
      db,
      runnerOptions: {
        fixturesDir: tmpDir,
        dbPath: ":memory:",
        timeoutMs: 5000,
        format: "json",
      },
    };
    const result = await runCaseTool("json_case", opts);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("persists case result to db when fixture is found by name", async () => {
    const fixtureContent =
      "name: persist_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "persist_test.yaml"), fixtureContent);

    const db = makeMockDb();
    await runCaseTool("persist_test", makeOpts(tmpDir, db));
    expect(db.insertCaseResult).toHaveBeenCalled();
  });

  it("handles fixture with assertions found by name", async () => {
    const fixtureContent = [
      "name: assert_test",
      "steps:",
      "  - id: s1",
      "    tool: my_tool",
      "    expected_output: hello world",
      "    expect:",
      "      output_contains: hello",
      "      tool_called: my_tool",
    ].join("\n");
    fs.writeFileSync(path.join(tmpDir, "assert_test.yaml"), fixtureContent);

    const db = makeMockDb();
    const result = await runCaseTool("assert_test", makeOpts(tmpDir, db));
    expect(result).toContain("assert_test");
  });

  it("handles .json fixture files via filename fallback", async () => {
    const fixture = {
      name: "json_file_fixture",
      steps: [{ id: "s1", tool: "my_tool", input: {}, expected_output: "ok" }],
    };
    fs.writeFileSync(path.join(tmpDir, "json_file.json"), JSON.stringify(fixture));

    const db = makeMockDb();
    const result = await runCaseTool("json_file", makeOpts(tmpDir, db));
    expect(result).toContain("json_file");
  });

  it("handles .yml extension via filename fallback", async () => {
    const fixtureContent =
      "name: yml_fixture\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "yml_test.yml"), fixtureContent);

    const db = makeMockDb();
    const result = await runCaseTool("yml_test", makeOpts(tmpDir, db));
    expect(result).toContain("yml_test");
  });
});
