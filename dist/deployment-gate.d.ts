/**
 * CI deployment gate for mcp-eval-runner.
 * Evaluates whether a recent set of runs meets a minimum pass rate threshold.
 * Intended for use in CI pipelines to block deploys on regressions.
 */
import type { EvalDb } from "./db.js";
export interface GateConfig {
  /** Optional: filter runs by workflow/suite name */
  workflow_name?: string;
  /** Minimum acceptable pass rate (0.0 – 1.0) */
  min_pass_rate: number;
  /** Number of most-recent runs to consider (default: 10) */
  lookback_runs?: number;
}
export interface GateResult {
  passed: boolean;
  current_rate: number;
  threshold: number;
  run_count: number;
}
/**
 * Evaluate the deployment gate against recent run history.
 *
 * Queries the last `lookback_runs` runs (optionally filtered by suite name),
 * computes the aggregate pass rate, and compares it to `min_pass_rate`.
 */
export declare function evaluateGate(db: EvalDb, config: GateConfig): GateResult;
