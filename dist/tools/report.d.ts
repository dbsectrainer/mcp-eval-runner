/**
 * regression_report and compare_results MCP tool implementations.
 */
import type { EvalDb } from "../db.js";
/**
 * regression_report — compare current state to the last run; returns what changed.
 */
export declare function regressionReportTool(fixturesDir: string, db: EvalDb): Promise<string>;
/**
 * compare_results — diff two named run results by run ID.
 */
export declare function compareResultsTool(runIdA: string, runIdB: string, db: EvalDb): Promise<string>;
