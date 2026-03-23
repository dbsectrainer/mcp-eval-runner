/**
 * Assertion evaluators for MCP Eval Runner.
 * Each assertion checks a specific property of a step result.
 *
 * Supported assertion types:
 *   output_contains: "substring"       — output includes substring
 *   output_not_contains: "substring"   — output must NOT include substring
 *   output_equals: "exact string"      — output exactly matches
 *   output_matches: "regex"            — output matches a regular expression
 *   tool_called: "tool_name"           — step used the named tool
 *   latency_under: 500                 — latency in ms must be below threshold
 *   schema_match: { type: "object", properties: {...}, required: [...] }
 *                                      — output (parsed as JSON) matches JSON Schema
 *   llm_judge: { prompt_template, min_score, model, expected }
 *                                      — semantic similarity via LLM judge
 */

import type { LlmJudgeAssertion } from "./llm-judge.js";
import { runLlmJudge } from "./llm-judge.js";

export interface Assertion {
  output_contains?: string;
  output_not_contains?: string;
  output_equals?: string;
  output_matches?: string; // regex pattern
  tool_called?: string;
  latency_under?: number; // ms
  schema_match?: JsonSchema;
  llm_judge?: LlmJudgeAssertion;
}

// ── Minimal JSON Schema types ────────────────────────────────────────────────

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  [key: string]: unknown;
}

// ── Minimal inline JSON Schema validator ─────────────────────────────────────

function validateJsonSchema(schema: JsonSchema, value: unknown, path = ""): string | null {
  // type check
  if (schema.type !== undefined) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    const nullType = value === null ? "null" : null;
    const effectiveType = nullType ?? actualType;
    if (effectiveType !== schema.type) {
      return `${path || "value"}: expected type "${schema.type}", got "${effectiveType}"`;
    }
  }

  if (
    schema.type === "object" ||
    (schema.properties && value !== null && typeof value === "object" && !Array.isArray(value))
  ) {
    const obj = value as Record<string, unknown>;

    // required fields
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          return `${path || "value"}: missing required property "${key}"`;
        }
      }
    }

    // properties
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const err = validateJsonSchema(subSchema, obj[key], path ? `${path}.${key}` : key);
          if (err) return err;
        }
      }
    }

    // additionalProperties
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          return `${path || "value"}: unexpected additional property "${key}"`;
        }
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const err = validateJsonSchema(schema.items, value[i], `${path || "value"}[${i}]`);
      if (err) return err;
    }
  }

  return null;
}

export interface AssertionResult {
  type: string;
  passed: boolean;
  message: string;
}

export interface StepResult {
  tool: string;
  output: string;
  latency_ms: number;
}

/**
 * Evaluate a single assertion against a step result.
 */
export function evaluateAssertion(assertion: Assertion, result: StepResult): AssertionResult[] {
  const results: AssertionResult[] = [];

  if (assertion.output_contains !== undefined) {
    const passed = result.output.includes(assertion.output_contains);
    results.push({
      type: "output_contains",
      passed,
      message: passed
        ? `Output contains "${assertion.output_contains}"`
        : `Expected output to contain "${assertion.output_contains}", but got: "${result.output}"`,
    });
  }

  if (assertion.output_not_contains !== undefined) {
    const passed = !result.output.includes(assertion.output_not_contains);
    results.push({
      type: "output_not_contains",
      passed,
      message: passed
        ? `Output does not contain "${assertion.output_not_contains}"`
        : `Expected output NOT to contain "${assertion.output_not_contains}"`,
    });
  }

  if (assertion.output_matches !== undefined) {
    let passed = false;
    let message: string;
    try {
      const regex = new RegExp(assertion.output_matches);
      passed = regex.test(result.output);
      message = passed
        ? `Output matches pattern /${assertion.output_matches}/`
        : `Output does not match pattern /${assertion.output_matches}/`;
    } catch {
      message = `Invalid regex pattern: "${assertion.output_matches}"`;
    }
    results.push({ type: "output_matches", passed, message });
  }

  if (assertion.output_equals !== undefined) {
    const passed = result.output === assertion.output_equals;
    results.push({
      type: "output_equals",
      passed,
      message: passed
        ? `Output equals "${assertion.output_equals}"`
        : `Expected output to equal "${assertion.output_equals}", but got: "${result.output}"`,
    });
  }

  if (assertion.tool_called !== undefined) {
    const passed = result.tool === assertion.tool_called;
    results.push({
      type: "tool_called",
      passed,
      message: passed
        ? `Tool "${assertion.tool_called}" was called`
        : `Expected tool "${assertion.tool_called}" to be called, but got "${result.tool}"`,
    });
  }

  if (assertion.latency_under !== undefined) {
    const passed = result.latency_ms < assertion.latency_under;
    results.push({
      type: "latency_under",
      passed,
      message: passed
        ? `Latency ${result.latency_ms}ms < ${assertion.latency_under}ms`
        : `Expected latency under ${assertion.latency_under}ms, but got ${result.latency_ms}ms`,
    });
  }

  if (assertion.schema_match !== undefined) {
    let parsed: unknown;
    let parseError: string | undefined;
    try {
      parsed = JSON.parse(result.output);
    } catch {
      parseError = `Output is not valid JSON: "${result.output}"`;
    }
    if (parseError) {
      results.push({
        type: "schema_match",
        passed: false,
        message: parseError,
      });
    } else {
      const err = validateJsonSchema(assertion.schema_match, parsed);
      const passed = err === null;
      results.push({
        type: "schema_match",
        passed,
        message: passed ? `Output matches JSON schema` : `Schema validation failed: ${err}`,
      });
    }
  }

  return results;
}

/**
 * Evaluate all assertions for a step, returning aggregate pass/fail.
 */
export function evaluateAllAssertions(
  assertions: Assertion,
  result: StepResult,
): { passed: boolean; results: AssertionResult[] } {
  const results = evaluateAssertion(assertions, result);
  const passed = results.every((r) => r.passed);
  return { passed, results };
}

/**
 * Evaluate all assertions for a step including async assertion types (e.g. llm_judge).
 */
export async function evaluateAllAssertionsAsync(
  assertions: Assertion,
  result: StepResult,
): Promise<{ passed: boolean; results: AssertionResult[] }> {
  const results = evaluateAssertion(assertions, result);

  // Handle async llm_judge assertion
  if (assertions.llm_judge !== undefined) {
    const expected = assertions.llm_judge.expected ?? result.output;
    const judgeResult = await runLlmJudge(assertions.llm_judge, result.output, expected);
    results.push(judgeResult);
  }

  const passed = results.every((r) => r.passed);
  return { passed, results };
}
