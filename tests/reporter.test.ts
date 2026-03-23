import { describe, it, expect } from "vitest";
import { formatConsole, formatJson, formatHtml, formatResult } from "../src/reporter.js";
import type { SuiteRunResult } from "../src/runner.js";

function makeSuiteResult(overrides: Partial<SuiteRunResult> = {}): SuiteRunResult {
  return {
    run_id: "run-001",
    suite_name: "test_suite",
    started_at: 1700000000000,
    ended_at: 1700000005000,
    total_cases: 2,
    passed: 2,
    failed: 0,
    cases: [
      {
        case_name: "case_a",
        status: "pass",
        duration_ms: 100,
        steps: [
          {
            step_id: "s1",
            tool: "my_tool",
            status: "pass",
            duration_ms: 50,
            output: "hello",
            assertions: [
              { type: "output_contains", passed: true, message: 'Output contains "hello"' },
            ],
          },
        ],
      },
      {
        case_name: "case_b",
        status: "fail",
        duration_ms: 200,
        steps: [
          {
            step_id: "s1",
            tool: "other_tool",
            status: "fail",
            duration_ms: 100,
            output: "nope",
            assertions: [
              {
                type: "output_equals",
                passed: false,
                message: 'Expected "yes" but got "nope"',
              },
            ],
            error: "Step failed",
          },
        ],
        error: "Case failed",
      },
    ],
    ...overrides,
  };
}

describe("formatConsole", () => {
  it("returns a string with the suite name", () => {
    const result = makeSuiteResult();
    const output = formatConsole(result);
    expect(typeof output).toBe("string");
    expect(output).toContain("test_suite");
  });

  it("includes the run ID", () => {
    const output = formatConsole(makeSuiteResult());
    expect(output).toContain("run-001");
  });

  it("includes case names", () => {
    const output = formatConsole(makeSuiteResult());
    expect(output).toContain("case_a");
    expect(output).toContain("case_b");
  });

  it("includes assertion messages", () => {
    const output = formatConsole(makeSuiteResult());
    expect(output).toContain("output_contains");
    expect(output).toContain("output_equals");
  });

  it("shows pass summary when all cases pass", () => {
    const result = makeSuiteResult({ passed: 2, failed: 0 });
    const output = formatConsole(result);
    expect(output).toContain("2/2 passed");
  });

  it("shows fail summary when cases fail", () => {
    const result = makeSuiteResult({ passed: 1, failed: 1 });
    const output = formatConsole(result);
    expect(output).toContain("1/2 failed");
  });

  it("shows error in step output", () => {
    const output = formatConsole(makeSuiteResult());
    expect(output).toContain("Step failed");
  });

  it("shows error in case output", () => {
    const output = formatConsole(makeSuiteResult());
    expect(output).toContain("Case failed");
  });
});

describe("formatJson", () => {
  it("returns valid JSON", () => {
    const output = formatJson(makeSuiteResult());
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("includes run_id in JSON output", () => {
    const output = formatJson(makeSuiteResult());
    const parsed = JSON.parse(output);
    expect(parsed.run_id).toBe("run-001");
  });

  it("includes cases in JSON output", () => {
    const output = formatJson(makeSuiteResult());
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.cases)).toBe(true);
    expect(parsed.cases).toHaveLength(2);
  });
});

describe("formatHtml", () => {
  it("returns a string starting with <!DOCTYPE html>", () => {
    const output = formatHtml(makeSuiteResult());
    expect(output.trim().startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("includes suite name in HTML", () => {
    const output = formatHtml(makeSuiteResult());
    expect(output).toContain("test_suite");
  });

  it("includes case names in HTML", () => {
    const output = formatHtml(makeSuiteResult());
    expect(output).toContain("case_a");
    expect(output).toContain("case_b");
  });

  it("includes assertion messages in HTML", () => {
    const output = formatHtml(makeSuiteResult());
    expect(output).toContain("output_contains");
  });

  it("escapes HTML characters in suite name", () => {
    const result = makeSuiteResult({ suite_name: '<script>alert("xss")</script>' });
    const output = formatHtml(result);
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });
});

describe("formatResult", () => {
  it("dispatches to formatJson for format=json", () => {
    const output = formatResult(makeSuiteResult(), "json");
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("dispatches to formatHtml for format=html", () => {
    const output = formatResult(makeSuiteResult(), "html");
    expect(output.trim().startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("dispatches to formatConsole for format=console", () => {
    const output = formatResult(makeSuiteResult(), "console");
    expect(output).toContain("test_suite");
  });

  it("dispatches to formatConsole for unknown format", () => {
    const output = formatResult(makeSuiteResult(), "console");
    expect(output).toContain("MCP Eval Runner");
  });
});
