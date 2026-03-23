/**
 * Console/JSON/HTML output formatting for MCP Eval Runner.
 */
import type { SuiteRunResult } from "./runner.js";
export declare function formatConsole(result: SuiteRunResult): string;
export declare function formatJson(result: SuiteRunResult): string;
export declare function formatHtml(result: SuiteRunResult): string;
export declare function formatResult(result: SuiteRunResult, format: "console" | "json" | "html"): string;
