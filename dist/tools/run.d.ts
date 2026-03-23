/**
 * run_suite and run_case MCP tool implementations.
 */
import type { EvalDb } from "../db.js";
import type { RunnerOptions } from "../runner.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface RunToolOptions {
  fixturesDir: string;
  db: EvalDb;
  runnerOptions: RunnerOptions;
  server?: McpServer;
}
/**
 * run_suite — execute all fixtures in the fixtures directory.
 */
export declare function runSuiteTool(opts: RunToolOptions): Promise<string>;
/**
 * run_case — run a single named test case.
 */
export declare function runCaseTool(name: string, opts: RunToolOptions): Promise<string>;
