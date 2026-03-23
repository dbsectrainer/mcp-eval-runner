/**
 * LLM-as-judge assertion for mcp-eval-runner.
 * Calls an external LLM API via HTTP POST to score semantic similarity
 * between actual and expected outputs.
 *
 * Credentials: LLM_JUDGE_API_KEY + LLM_JUDGE_BASE_URL env vars.
 * Assertion type: llm_judge with prompt_template, min_score, model fields.
 */
import type { AssertionResult } from "./assertions.js";
export interface LlmJudgeAssertion {
    prompt_template: string;
    min_score: number;
    model: string;
    expected?: string;
}
/**
 * Run an LLM-as-judge assertion.
 *
 * Renders the prompt template with {actual} and {expected} placeholders,
 * calls the LLM API, and extracts a score from the response (0.0–1.0).
 * Expects the LLM to respond with a JSON object containing a "score" field,
 * or a plain number.
 */
export declare function runLlmJudge(assertion: LlmJudgeAssertion, actual: string, expected: string): Promise<AssertionResult>;
