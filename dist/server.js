/**
 * MCP Server for mcp-eval-runner.
 * Exposes tools: run_suite, run_case, list_cases, create_test_case,
 * regression_report, compare_results, generate_html_report, scaffold_fixture.
 * Exposes resources: eval://{fixture_name}
 * Exposes prompts: write-test-case
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CancelledNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EvalDb } from "./db.js";
import { runSuiteTool, runCaseTool } from "./tools/run.js";
import { listCasesTool, createTestCaseTool } from "./tools/manage.js";
import { regressionReportTool, compareResultsTool } from "./tools/report.js";
import { generateHtmlReportTool } from "./tools/html_report.js";
import { scaffoldFixtureTool } from "./tools/scaffold.js";
import { loadFixturesFromDir } from "./fixture.js";
import { evaluateGate } from "./deployment-gate.js";
import { discoverFixtures } from "./fixture-library.js";
import { AuditLog } from "./audit-log.js";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
// ── Cancellation registry ─────────────────────────────────────────────────────
const cancellationRegistry = new Map();
/**
 * Check whether the given requestId has been cancelled by the client.
 */
export function isCancelled(requestId) {
    return cancellationRegistry.get(requestId) === true;
}
export async function createServer(opts) {
    const db = new EvalDb(opts.dbPath);
    const auditLog = new AuditLog();
    const runnerOptions = {
        fixturesDir: opts.fixturesDir,
        dbPath: opts.dbPath,
        timeoutMs: opts.timeoutMs,
        format: opts.format,
        concurrency: opts.concurrency,
    };
    const server = new McpServer({
        name: "mcp-eval-runner",
        version: "0.2.0",
    });
    const toolOpts = {
        fixturesDir: opts.fixturesDir,
        db,
        runnerOptions,
        server,
    };
    // ── Cancellation handler ───────────────────────────────────────────────────
    // Intercept notifications/cancelled to track cancelled request IDs.
    server.server.setNotificationHandler(CancelledNotificationSchema, async (notification) => {
        const requestId = notification.params?.requestId;
        if (requestId !== undefined) {
            cancellationRegistry.set(String(requestId), true);
        }
    });
    // ── run_suite ─────────────────────────────────────────────────────────────
    server.tool("run_suite", [
        "Execute all fixtures in the fixtures directory. Returns a pass/fail summary.",
        "",
        "Execution modes:",
        "  Live mode:       fixture has a 'server' block with command/args — spawns the server",
        "                   and calls tools via real MCP stdio transport.",
        "  Simulation mode: no server block — assertions run against expected_output fields.",
        "",
        "Assertion types supported in fixture expect blocks:",
        '  output_contains: "substring"',
        '  output_not_contains: "substring"',
        '  output_equals: "exact text"',
        '  output_matches: "regex"',
        '  tool_called: "tool_name"',
        "  latency_under: 500",
        '  schema_match: { type: "object", required: ["result"], properties: { result: { type: "string" } } }',
        "",
        "Step output piping: use {{steps.<step_id>.output}} in input values to reference",
        "the output of a previous step.",
    ].join("\n"), {}, { readOnlyHint: false }, async () => {
        const runStart = Date.now();
        const runId = crypto.randomUUID();
        try {
            const text = await runSuiteTool(toolOpts);
            auditLog.record({
                timestamp: new Date().toISOString(),
                run_id: runId,
                fixture_name: "suite:all",
                passed: !text.toLowerCase().includes("failed"),
                duration_ms: Date.now() - runStart,
            });
            return { content: [{ type: "text", text }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            auditLog.record({
                timestamp: new Date().toISOString(),
                run_id: runId,
                fixture_name: "suite:all",
                passed: false,
                duration_ms: Date.now() - runStart,
            });
            return {
                content: [{ type: "text", text: `Error running suite: ${message}` }],
                isError: true,
            };
        }
    });
    // ── run_case ──────────────────────────────────────────────────────────────
    server.tool("run_case", [
        "Run a single named test case from the fixtures directory.",
        "",
        "Assertion types supported in fixture expect blocks:",
        '  output_contains: "substring"',
        '  output_equals: "exact text"',
        '  tool_called: "tool_name"',
        "  latency_under: 500",
        '  schema_match: { type: "object", required: ["id"], properties: { id: { type: "number" } } }',
    ].join("\n"), {
        name: z.string().describe("The name of the fixture to run"),
    }, { readOnlyHint: false }, async ({ name }) => {
        if (!name || name.trim() === "") {
            return {
                content: [
                    {
                        type: "text",
                        text: 'Error: "name" parameter is required and must be a non-empty string.',
                    },
                ],
                isError: true,
            };
        }
        const caseStart = Date.now();
        const caseRunId = crypto.randomUUID();
        try {
            const text = await runCaseTool(name, toolOpts);
            auditLog.record({
                timestamp: new Date().toISOString(),
                run_id: caseRunId,
                fixture_name: name,
                passed: !text.toLowerCase().includes("failed"),
                duration_ms: Date.now() - caseStart,
            });
            return { content: [{ type: "text", text }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            auditLog.record({
                timestamp: new Date().toISOString(),
                run_id: caseRunId,
                fixture_name: name,
                passed: false,
                duration_ms: Date.now() - caseStart,
            });
            return {
                content: [{ type: "text", text: `Error running case "${name}": ${message}` }],
                isError: true,
            };
        }
    });
    // ── list_cases ────────────────────────────────────────────────────────────
    server.tool("list_cases", "Enumerate all available fixtures with their step counts and assertion types.", {}, { readOnlyHint: true }, async () => {
        try {
            const text = listCasesTool(opts.fixturesDir);
            return { content: [{ type: "text", text }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error listing cases: ${message}` }],
                isError: true,
            };
        }
    });
    // ── create_test_case ──────────────────────────────────────────────────────
    server.tool("create_test_case", [
        "Create a new YAML fixture file in the fixtures directory.",
        "",
        "Supported assertion types in each step's expect block:",
        '  output_contains: "substring"        — checks output includes this text',
        '  output_equals: "exact"              — checks exact output match',
        '  tool_called: "tool_name"            — verifies which tool was called',
        "  latency_under: 500                  — asserts response time under N ms",
        "  schema_match: { type: 'object', ... } — validates output JSON against schema",
    ].join("\n"), {
        name: z.string().describe("The name of the new test case"),
        description: z.string().optional().describe("Optional description for the test case"),
        steps: z
            .array(z.object({
            id: z.string().describe("Unique step identifier"),
            description: z.string().optional(),
            tool: z.string().describe("Tool name to call"),
            input: z.record(z.string(), z.any()).optional().default({}),
            expected_output: z.string().optional(),
            expect: z
                .object({
                output_contains: z.string().optional(),
                output_equals: z.string().optional(),
                tool_called: z.string().optional(),
                latency_under: z.number().optional(),
                schema_match: z.record(z.string(), z.any()).optional(),
            })
                .optional(),
        }))
            .describe("Array of steps for the test case"),
    }, { readOnlyHint: false }, async ({ name, steps }) => {
        if (!name || name.trim() === "") {
            return {
                content: [
                    {
                        type: "text",
                        text: 'Error: "name" parameter is required and must be a non-empty string.',
                    },
                ],
                isError: true,
            };
        }
        if (!steps || steps.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: 'Error: "steps" parameter is required and must be a non-empty array.',
                    },
                ],
                isError: true,
            };
        }
        try {
            const text = createTestCaseTool(name, steps, opts.fixturesDir);
            return { content: [{ type: "text", text }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error creating test case "${name}": ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // ── regression_report ─────────────────────────────────────────────────────
    server.tool("regression_report", "Compare current state to the last run and return what changed (regressions, fixes, new cases).", {}, { readOnlyHint: true }, async () => {
        try {
            const text = await regressionReportTool(opts.fixturesDir, db);
            return { content: [{ type: "text", text }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error generating regression report: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // ── compare_results ───────────────────────────────────────────────────────
    server.tool("compare_results", "Diff two named run results by run ID. Shows regressions, fixes, new and removed cases.", {
        run_id_a: z.string().describe("First run ID to compare"),
        run_id_b: z.string().describe("Second run ID to compare"),
    }, { readOnlyHint: true }, async ({ run_id_a, run_id_b }) => {
        try {
            const text = await compareResultsTool(run_id_a, run_id_b, db);
            return { content: [{ type: "text", text }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error comparing results: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // ── generate_html_report ──────────────────────────────────────────────────
    server.tool("generate_html_report", [
        "Generate a full single-file HTML report for a completed run.",
        "The report includes: suite summary (pass/fail counts, duration),",
        "per-case drill-down with per-assertion pass/fail details, and",
        "color-coded status (green=pass, red=fail, yellow=error).",
        "",
        "Use run_suite or run_case first, then pass the returned run_id here.",
    ].join("\n"), {
        run_id: z.string().describe("The run ID returned by run_suite or run_case"),
    }, { readOnlyHint: true }, async ({ run_id }) => {
        try {
            const html = generateHtmlReportTool(run_id, db);
            return { content: [{ type: "text", text: html }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error generating HTML report: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // ── scaffold_fixture ──────────────────────────────────────────────────────
    server.tool("scaffold_fixture", [
        "Generate a boilerplate YAML fixture file in the fixtures directory.",
        "Each tool name provided becomes a documented step with placeholder",
        "input parameters and all supported assertion types pre-filled as comments.",
        "",
        "Example: scaffold_fixture({ name: 'search_test', tool_names: ['search', 'summarize'] })",
        "",
        "Supported assertion types (pre-filled as TODOs in the generated file):",
        "  output_contains, output_equals, tool_called, latency_under, schema_match",
    ].join("\n"), {
        name: z.string().describe("Name for the new fixture (becomes filename)"),
        tool_names: z.array(z.string()).describe("List of tool names — each becomes a fixture step"),
    }, { readOnlyHint: false }, async ({ name, tool_names }) => {
        try {
            const filePath = scaffoldFixtureTool(name, tool_names, opts.fixturesDir);
            return {
                content: [
                    {
                        type: "text",
                        text: [
                            `Scaffold created: ${filePath}`,
                            `  Name: ${name}`,
                            `  Steps: ${tool_names.length} (${tool_names.join(", ")})`,
                            "",
                            "Edit the TODO fields, then run run_case or run_suite.",
                        ].join("\n"),
                    },
                ],
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error scaffolding fixture: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // ── evaluate_deployment_gate ──────────────────────────────────────────────
    server.tool("evaluate_deployment_gate", [
        "CI gate — evaluate whether recent eval runs meet a minimum pass rate threshold.",
        "Fails (passed: false) if the pass rate of recent runs drops below min_pass_rate.",
        "Use this in CI pipelines to block deployments on regressions.",
    ].join("\n"), {
        workflow_name: z
            .string()
            .optional()
            .describe("Optional suite/workflow name to filter runs by"),
        min_pass_rate: z.number().min(0).max(1).describe("Minimum acceptable pass rate (0.0 – 1.0)"),
        lookback_runs: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Number of most-recent runs to consider (default: 10)"),
    }, { readOnlyHint: true }, async ({ workflow_name, min_pass_rate, lookback_runs }) => {
        try {
            const result = evaluateGate(db, { workflow_name, min_pass_rate, lookback_runs });
            const lines = [
                `Gate: ${result.passed ? "PASSED" : "FAILED"}`,
                `Current pass rate: ${(result.current_rate * 100).toFixed(1)}%`,
                `Threshold: ${(result.threshold * 100).toFixed(1)}%`,
                `Runs evaluated: ${result.run_count}`,
            ];
            return {
                content: [{ type: "text", text: lines.join("\n") }],
                isError: !result.passed,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error evaluating deployment gate: ${message}` }],
                isError: true,
            };
        }
    });
    // ── discover_fixtures ─────────────────────────────────────────────────────
    server.tool("discover_fixtures", [
        "Discover fixture files across one or more directories.",
        "Returns a list of fixtures with their names, paths, and step counts.",
        "If no dirs are provided, uses the configured fixtures directory and",
        "FIXTURE_LIBRARY_DIRS env var (colon-separated list of paths).",
    ].join("\n"), {
        dirs: z.array(z.string()).optional().describe("List of directories to scan for fixtures"),
    }, { readOnlyHint: true }, async ({ dirs }) => {
        try {
            // Build directory list: explicit dirs, env var dirs, and default dir
            const envDirs = (process.env.FIXTURE_LIBRARY_DIRS ?? "")
                .split(":")
                .map((d) => d.trim())
                .filter(Boolean)
                .map((d) => (d.startsWith("~") ? d.replace("~", os.homedir()) : d));
            const searchDirs = dirs && dirs.length > 0 ? dirs : [opts.fixturesDir, ...envDirs];
            const entries = discoverFixtures(searchDirs);
            if (entries.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No fixtures found in: ${searchDirs.join(", ")}`,
                        },
                    ],
                };
            }
            const lines = [
                `Found ${entries.length} fixture(s):`,
                "",
                ...entries.map((e) => `  ${e.name}\n    path: ${e.path}\n    suites: ${e.suite_count}, steps: ${e.case_count}`),
            ];
            return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: `Error discovering fixtures: ${message}` }],
                isError: true,
            };
        }
    });
    // ── MCP Resources: eval://{fixture_name} ─────────────────────────────────
    // Expose each fixture file as a resource accessible at eval://{fixture_name}
    const fixtureTemplate = new ResourceTemplate("eval://{fixture_name}", {
        list: async () => {
            const fixtures = loadFixturesFromDir(opts.fixturesDir);
            return {
                resources: fixtures.map((f) => ({
                    uri: `eval://${encodeURIComponent(f.name)}`,
                    name: f.name,
                    description: f.description ?? `Fixture "${f.name}" with ${f.steps.length} step(s)`,
                    mimeType: "application/yaml",
                })),
            };
        },
    });
    server.resource("fixture", fixtureTemplate, async (uri, { fixture_name }) => {
        const decodedName = decodeURIComponent(String(fixture_name));
        // Attempt to find by fixture name first
        const fixtures = loadFixturesFromDir(opts.fixturesDir);
        const found = fixtures.find((f) => f.name === decodedName);
        if (found) {
            // Try to read the raw file content
            const safeName = decodedName.replace(/[^a-z0-9_-]/gi, "_");
            const candidates = [
                path.join(opts.fixturesDir, `${safeName}.yaml`),
                path.join(opts.fixturesDir, `${safeName}.yml`),
                path.join(opts.fixturesDir, `${safeName}.json`),
            ];
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    const rawContent = fs.readFileSync(candidate, "utf-8");
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                mimeType: candidate.endsWith(".json") ? "application/json" : "application/yaml",
                                text: rawContent,
                            },
                        ],
                    };
                }
            }
        }
        // Try to load directly by filename variant
        const candidates = [
            path.join(opts.fixturesDir, `${decodedName}.yaml`),
            path.join(opts.fixturesDir, `${decodedName}.yml`),
            path.join(opts.fixturesDir, `${decodedName}.json`),
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                const rawContent = fs.readFileSync(candidate, "utf-8");
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: candidate.endsWith(".json") ? "application/json" : "application/yaml",
                            text: rawContent,
                        },
                    ],
                };
            }
        }
        throw new Error(`Fixture not found: ${decodedName}`);
    });
    // ── MCP Prompt: write-test-case ───────────────────────────────────────────
    server.prompt("write-test-case", {
        fixture_description: z
            .string()
            .describe("Describe what the fixture should test, e.g. 'search for a term and verify results contain it'"),
        tool_names: z
            .string()
            .optional()
            .describe("Comma-separated list of tool names used in this fixture"),
    }, async ({ fixture_description, tool_names }) => {
        const toolList = tool_names
            ? tool_names
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
        const toolSection = toolList.length > 0 ? `\nThe fixture should test these tools: ${toolList.join(", ")}.` : "";
        const promptText = [
            "You are helping write a YAML fixture file for mcp-eval-runner, a testing harness for MCP tool calls.",
            "",
            `Goal: ${fixture_description}${toolSection}`,
            "",
            "A valid fixture has this structure:",
            "```yaml",
            "name: my_test_case",
            "description: What this test does",
            "steps:",
            "  - id: step_1",
            "    description: Call the tool",
            "    tool: tool_name",
            "    input:",
            "      param: value",
            "    expected_output: The expected output text",
            "    expect:",
            '      output_contains: "expected substring"',
            '      output_equals: "exact expected text"   # optional',
            "      tool_called: tool_name                 # optional",
            "      latency_under: 5000                    # optional, ms",
            "      schema_match:                          # optional",
            "        type: object",
            "        required: [result]",
            "        properties:",
            "          result:",
            "            type: string",
            "```",
            "",
            "Rules:",
            "- Each step must have a unique `id` and a `tool` name.",
            "- `input` is a key-value map of parameters passed to the tool.",
            "- `expected_output` is the literal string output to simulate in Phase 1.",
            "- `expect` contains assertions evaluated against the simulated output.",
            "- `schema_match` validates that the output (parsed as JSON) matches a JSON Schema.",
            "  Supported keywords: type, properties, required, additionalProperties, items.",
            "- You may include multiple assertions in one step's `expect` block.",
            "",
            "Please write the complete YAML fixture file now.",
        ].join("\n");
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: promptText,
                    },
                },
            ],
        };
    });
    return server;
}
export async function startServer(opts) {
    const server = await createServer(opts);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
