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
import crypto from "crypto";
import { spawn } from "child_process";
import { evaluateAllAssertions, evaluateAllAssertionsAsync, } from "./assertions.js";
/**
 * Resolve `{{steps.<id>.output}}` placeholders in input values.
 */
function resolveInputPlaceholders(input, context) {
    const resolved = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === "string") {
            resolved[key] = value.replace(/\{\{steps\.([^}]+)\.output\}\}/g, (_match, stepId) => {
                return context.get(stepId) ?? "";
            });
        }
        else {
            resolved[key] = value;
        }
    }
    return resolved;
}
/**
 * Minimal MCP stdio client.
 * Spawns the server command, sends JSON-RPC requests over stdin/stdout.
 */
class McpStdioClient {
    proc;
    buffer = "";
    pending = new Map();
    nextId = 1;
    ready = false;
    initPromise;
    constructor(command, args, env) {
        this.proc = spawn(command, args, {
            env: { ...process.env, ...env },
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.proc.stdout.on("data", (chunk) => {
            this.buffer += chunk.toString("utf-8");
            this.flushBuffer();
        });
        this.proc.stderr.on("data", () => {
            // Ignore stderr from the server under test
        });
        this.initPromise = this.initialize();
    }
    flushBuffer() {
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const msg = JSON.parse(trimmed);
                const handler = this.pending.get(msg.id);
                if (handler) {
                    this.pending.delete(msg.id);
                    handler.resolve(msg);
                }
            }
            catch {
                // Non-JSON line from server — ignore
            }
        }
    }
    send(req) {
        return new Promise((resolve, reject) => {
            this.pending.set(req.id, { resolve, reject });
            this.proc.stdin.write(JSON.stringify(req) + "\n");
        });
    }
    async initialize() {
        const initReq = {
            jsonrpc: "2.0",
            id: this.nextId++,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "mcp-eval-runner", version: "1.0.0" },
            },
        };
        await this.send(initReq);
        // Send initialized notification (no response expected)
        this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
        this.ready = true;
    }
    async callTool(toolName, toolInput, timeoutMs) {
        await this.initPromise;
        if (!this.ready)
            throw new Error("MCP client not initialized");
        const req = {
            jsonrpc: "2.0",
            id: this.nextId++,
            method: "tools/call",
            params: { name: toolName, arguments: toolInput },
        };
        const responsePromise = this.send(req);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool call timed out after ${timeoutMs}ms`)), timeoutMs));
        const response = await Promise.race([responsePromise, timeoutPromise]);
        if (response.error) {
            throw new Error(`MCP error ${response.error.code}: ${response.error.message}`);
        }
        // Extract text content from the result
        const result = response.result;
        if (result?.content) {
            return result.content
                .filter((c) => c.type === "text")
                .map((c) => c.text ?? "")
                .join("\n");
        }
        return JSON.stringify(result);
    }
    close() {
        try {
            this.proc.stdin.end();
            this.proc.kill();
        }
        catch {
            // best-effort
        }
    }
}
// ── Live step execution ───────────────────────────────────────────────────────
async function executeStepLive(step, client, timeoutMs, context) {
    const start = Date.now();
    const resolvedInput = resolveInputPlaceholders(step.input, context);
    let output;
    let status = "pass";
    let error;
    const assertionResults = [];
    try {
        output = await client.callTool(step.tool, resolvedInput, timeoutMs);
    }
    catch (err) {
        output = "";
        error = err instanceof Error ? err.message : String(err);
        status = "error";
        const duration_ms = Date.now() - start;
        return {
            step_id: step.id,
            tool: step.tool,
            status,
            duration_ms,
            output,
            assertions: [],
            error,
            mode: "live",
        };
    }
    const duration_ms = Date.now() - start;
    if (step.expect) {
        const { passed, results } = await evaluateAllAssertionsAsync(step.expect, {
            tool: step.tool,
            output,
            latency_ms: duration_ms,
        });
        assertionResults.push(...results);
        if (!passed)
            status = "fail";
    }
    return {
        step_id: step.id,
        tool: step.tool,
        status,
        duration_ms,
        output,
        assertions: assertionResults,
        error,
        mode: "live",
    };
}
// ── Simulation step execution ─────────────────────────────────────────────────
function simulateStep(step, context) {
    const start = Date.now();
    const simulatedLatency = Math.floor(Math.random() * 10) + 1;
    // Resolve placeholders even in simulation mode
    const resolvedInput = resolveInputPlaceholders(step.input, context);
    void resolvedInput; // used for placeholder resolution side-effect
    const output = step.expected_output ?? "";
    const assertionResults = [];
    let status = "pass";
    if (step.expect) {
        const { passed, results } = evaluateAllAssertions(step.expect, {
            tool: step.tool,
            output,
            latency_ms: simulatedLatency,
        });
        assertionResults.push(...results);
        if (!passed)
            status = "fail";
    }
    const duration_ms = Date.now() - start + simulatedLatency;
    return {
        step_id: step.id,
        tool: step.tool,
        status,
        duration_ms,
        output,
        assertions: assertionResults,
        mode: "simulation",
    };
}
// ── Case runner ───────────────────────────────────────────────────────────────
export async function runCase(fixture, options) {
    const start = Date.now();
    const stepResults = [];
    const context = new Map();
    // Determine if live execution is possible
    const serverConfig = fixture.server;
    let client = null;
    if (serverConfig?.command) {
        try {
            client = new McpStdioClient(serverConfig.command, serverConfig.args ?? [], serverConfig.env);
        }
        catch (err) {
            const duration_ms = Date.now() - start;
            return {
                case_name: fixture.name,
                status: "error",
                duration_ms,
                steps: [],
                error: `Failed to start server: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }
    try {
        for (const step of fixture.steps) {
            let stepResult;
            if (client) {
                stepResult = await executeStepLive(step, client, options.timeoutMs, context);
            }
            else {
                stepResult = simulateStep(step, context);
            }
            stepResults.push(stepResult);
            // Store output for downstream step piping
            context.set(step.id, stepResult.output);
            // Stop on first error in live mode to avoid cascading failures
            if (stepResult.status === "error" && client) {
                break;
            }
        }
    }
    catch (err) {
        const duration_ms = Date.now() - start;
        client?.close();
        return {
            case_name: fixture.name,
            status: "error",
            duration_ms,
            steps: stepResults,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    client?.close();
    const duration_ms = Date.now() - start;
    const allPassed = stepResults.every((s) => s.status === "pass");
    const status = allPassed
        ? "pass"
        : stepResults.some((s) => s.status === "error")
            ? "error"
            : "fail";
    return { case_name: fixture.name, status, duration_ms, steps: stepResults };
}
// ── Suite runner ──────────────────────────────────────────────────────────────
export async function runSuite(fixtures, suiteName, options, db) {
    const run_id = crypto.randomUUID();
    const started_at = Date.now();
    const concurrency = Math.max(1, options.concurrency ?? 1);
    db.insertRun({
        id: run_id,
        suite_name: suiteName,
        started_at,
        ended_at: null,
        total_cases: fixtures.length,
        passed: 0,
        failed: 0,
        format: options.format,
    });
    const caseResults = new Array(fixtures.length);
    let passed = 0;
    let failed = 0;
    // Process in batches of `concurrency`
    for (let i = 0; i < fixtures.length; i += concurrency) {
        const batch = fixtures.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map((fixture) => runCase(fixture, options)));
        for (let j = 0; j < batchResults.length; j++) {
            const caseResult = batchResults[j];
            caseResults[i + j] = caseResult;
            if (caseResult.status === "pass") {
                passed++;
            }
            else {
                failed++;
            }
            db.insertCaseResult({
                id: crypto.randomUUID(),
                run_id,
                case_name: caseResult.case_name,
                status: caseResult.status,
                duration_ms: caseResult.duration_ms,
                error_message: caseResult.error ?? null,
                assertions_json: JSON.stringify(caseResult.steps.map((s) => s.assertions)),
                created_at: Date.now(),
            });
        }
    }
    const ended_at = Date.now();
    db.updateRun(run_id, { ended_at, total_cases: fixtures.length, passed, failed });
    return {
        run_id,
        suite_name: suiteName,
        started_at,
        ended_at,
        total_cases: fixtures.length,
        passed,
        failed,
        cases: caseResults,
    };
}
