/**
 * MCP Server for mcp-eval-runner.
 * Exposes tools: run_suite, run_case, list_cases, create_test_case,
 * regression_report, compare_results, generate_html_report, scaffold_fixture.
 * Exposes resources: eval://{fixture_name}
 * Exposes prompts: write-test-case
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface ServerOptions {
    fixturesDir: string;
    dbPath: string;
    timeoutMs: number;
    format: "console" | "json" | "html";
    watch: boolean;
    concurrency?: number;
}
/**
 * Check whether the given requestId has been cancelled by the client.
 */
export declare function isCancelled(requestId: string): boolean;
export declare function createServer(opts: ServerOptions): Promise<McpServer>;
export declare function startServer(opts: ServerOptions): Promise<void>;
