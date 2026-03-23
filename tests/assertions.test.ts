import { describe, it, expect } from "vitest";
import {
  evaluateAssertion,
  evaluateAllAssertions,
  type Assertion,
  type StepResult,
} from "../src/assertions.js";

const baseResult: StepResult = {
  tool: "my_tool",
  output: "hello world",
  latency_ms: 50,
};

describe("evaluateAssertion", () => {
  describe("output_contains", () => {
    it("passes when output contains the substring", () => {
      const assertion: Assertion = { output_contains: "hello" };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].type).toBe("output_contains");
    });

    it("fails when output does not contain the substring", () => {
      const assertion: Assertion = { output_contains: "missing" };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results[0].passed).toBe(false);
    });
  });

  describe("output_equals", () => {
    it("passes when output exactly matches", () => {
      const assertion: Assertion = { output_equals: "hello world" };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results[0].passed).toBe(true);
    });

    it("fails when output does not exactly match", () => {
      const assertion: Assertion = { output_equals: "hello" };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results[0].passed).toBe(false);
    });
  });

  describe("tool_called", () => {
    it("passes when tool name matches", () => {
      const assertion: Assertion = { tool_called: "my_tool" };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results[0].passed).toBe(true);
    });

    it("fails when tool name does not match", () => {
      const assertion: Assertion = { tool_called: "other_tool" };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results[0].passed).toBe(false);
    });
  });

  describe("latency_under", () => {
    it("passes when latency is under the threshold", () => {
      const assertion: Assertion = { latency_under: 100 };
      const results = evaluateAssertion(assertion, baseResult);
      expect(results[0].passed).toBe(true);
    });

    it("fails when latency is at or above the threshold", () => {
      const assertion: Assertion = { latency_under: 50 };
      const results = evaluateAssertion(assertion, {
        ...baseResult,
        latency_ms: 50,
      });
      expect(results[0].passed).toBe(false);
    });

    it("passes when latency is strictly less than threshold", () => {
      const assertion: Assertion = { latency_under: 51 };
      const results = evaluateAssertion(assertion, {
        ...baseResult,
        latency_ms: 50,
      });
      expect(results[0].passed).toBe(true);
    });
  });

  it("handles multiple assertion types in one object", () => {
    const assertion: Assertion = {
      output_contains: "hello",
      tool_called: "my_tool",
      latency_under: 100,
    };
    const results = evaluateAssertion(assertion, baseResult);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("returns empty array when no assertion fields provided", () => {
    const results = evaluateAssertion({}, baseResult);
    expect(results).toHaveLength(0);
  });
});

describe("evaluateAllAssertions", () => {
  it("returns passed=true when all assertions pass", () => {
    const { passed, results } = evaluateAllAssertions(
      { output_contains: "hello", tool_called: "my_tool" },
      baseResult,
    );
    expect(passed).toBe(true);
    expect(results).toHaveLength(2);
  });

  it("returns passed=false when any assertion fails", () => {
    const { passed, results } = evaluateAllAssertions(
      { output_contains: "hello", tool_called: "wrong_tool" },
      baseResult,
    );
    expect(passed).toBe(false);
    expect(results.some((r) => !r.passed)).toBe(true);
  });

  it("returns passed=true when no assertions are specified", () => {
    const { passed, results } = evaluateAllAssertions({}, baseResult);
    expect(passed).toBe(true);
    expect(results).toHaveLength(0);
  });
});
