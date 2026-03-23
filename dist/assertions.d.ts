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
export interface Assertion {
    output_contains?: string;
    output_not_contains?: string;
    output_equals?: string;
    output_matches?: string;
    tool_called?: string;
    latency_under?: number;
    schema_match?: JsonSchema;
    llm_judge?: LlmJudgeAssertion;
}
export interface JsonSchema {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: boolean | JsonSchema;
    items?: JsonSchema;
    [key: string]: unknown;
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
export declare function evaluateAssertion(assertion: Assertion, result: StepResult): AssertionResult[];
/**
 * Evaluate all assertions for a step, returning aggregate pass/fail.
 */
export declare function evaluateAllAssertions(assertions: Assertion, result: StepResult): {
    passed: boolean;
    results: AssertionResult[];
};
/**
 * Evaluate all assertions for a step including async assertion types (e.g. llm_judge).
 */
export declare function evaluateAllAssertionsAsync(assertions: Assertion, result: StepResult): Promise<{
    passed: boolean;
    results: AssertionResult[];
}>;
