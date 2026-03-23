/**
 * Test execution engine for MCP Eval Runner.
 *
 * Supports two execution modes:
 *
 * 1. Live mode (default when server config is present in fixture):
 *    Spawns the target MCP server as a child process (stdio transport) or
 *    connects via HTTP, calls each step's tool with the provided input, and
 *    evaluates assertions against the real response.
 *
 * 2. Simulation mode (fallback when no server config is present):
 *    Evaluates assertions against `expected_output` from the fixture.
 *    Useful for authoring and CI dry-runs without a running server.
 *
 * Step output piping:
 *    Steps can reference the output of a previous step using the
 *    `{{steps.<step_id>.output}}` placeholder in their `input` values.
 */
import { type AssertionResult } from "./assertions.js";
import type { Fixture } from "./fixture.js";
import type { EvalDb } from "./db.js";
export interface StepRunResult {
  step_id: string;
  tool: string;
  status: "pass" | "fail" | "error";
  duration_ms: number;
  output: string;
  assertions: AssertionResult[];
  error?: string;
  mode: "live" | "simulation";
}
export interface CaseRunResult {
  case_name: string;
  status: "pass" | "fail" | "error";
  duration_ms: number;
  steps: StepRunResult[];
  error?: string;
}
export interface SuiteRunResult {
  run_id: string;
  suite_name: string;
  started_at: number;
  ended_at: number;
  total_cases: number;
  passed: number;
  failed: number;
  cases: CaseRunResult[];
}
export interface RunnerOptions {
  fixturesDir: string;
  dbPath: string;
  timeoutMs: number;
  format: "console" | "json" | "html";
  concurrency?: number;
}
export declare function runCase(
  fixture: Fixture,
  options: Pick<RunnerOptions, "timeoutMs">,
): Promise<CaseRunResult>;
export declare function runSuite(
  fixtures: Fixture[],
  suiteName: string,
  options: RunnerOptions,
  db: EvalDb,
): Promise<SuiteRunResult>;
