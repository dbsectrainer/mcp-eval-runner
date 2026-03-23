#!/usr/bin/env node
/**
 * CLI entry point for mcp-eval-runner.
 *
 * Usage:
 *   mcp-eval-runner [options]
 *
 * Options:
 *   --fixtures, --fixtures-dir  Path to fixtures directory (default: ./evals)
 *   --db, --db-path             Path to SQLite database (default: ~/.mcp/evals.db)
 *   --timeout                   Timeout per step in ms (default: 30000)
 *   --format                    Output format: console|json|html (default: console)
 *   --watch                     Watch fixtures directory for changes and re-run affected fixtures
 */
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import os from "os";
import { startServer } from "./server.js";
import { startHttpServer } from "./http-server.js";
import { EvalDb } from "./db.js";
import { loadFixture } from "./fixture.js";
import { runCase } from "./runner.js";
import { formatResult } from "./reporter.js";
const argv = yargs(hideBin(process.argv))
  .option("fixtures", {
    alias: "fixtures-dir",
    type: "string",
    description: "Path to fixtures directory",
    default: "./evals",
  })
  .option("db", {
    alias: "db-path",
    type: "string",
    description: "Path to SQLite database",
    default: "~/.mcp/evals.db",
  })
  .option("timeout", {
    type: "number",
    description: "Timeout per step in milliseconds",
    default: 30000,
  })
  .option("format", {
    type: "string",
    choices: ["console", "json", "html"],
    description: "Output format",
    default: "console",
  })
  .option("watch", {
    type: "boolean",
    description: "Watch fixtures directory for changes and re-run affected fixtures",
    default: false,
  })
  .option("concurrency", {
    type: "number",
    description: "Number of test cases to run in parallel (default: 1)",
    default: 1,
  })
  .option("http-port", {
    type: "number",
    description: "Start an HTTP server on this port instead of stdio transport",
  })
  .help()
  .parseSync();
// Resolve fixtures dir relative to cwd
const fixturesDir = path.resolve(process.cwd(), argv.fixtures);
// Expand ~ in db path
const rawDb = argv.db;
const dbPath = rawDb.startsWith("~/") ? path.join(os.homedir(), rawDb.slice(2)) : rawDb;
const format = argv.format;
// Enhanced watch mode: re-run the affected fixture when a file changes
if (argv.watch) {
  import("chokidar").then(({ default: chokidar }) => {
    const watcher = chokidar.watch(fixturesDir, {
      ignoreInitial: true,
      persistent: true,
    });
    const db = new EvalDb(dbPath);
    const runnerOpts = {
      fixturesDir,
      dbPath,
      timeoutMs: argv.timeout,
      format,
    };
    watcher.on("all", async (event, filePath) => {
      process.stderr.write(`[mcp-eval-runner] watch: ${event} ${filePath}\n`);
      // Only re-run on add / change of fixture files
      const isFixture =
        filePath.endsWith(".yaml") || filePath.endsWith(".yml") || filePath.endsWith(".json");
      if (!isFixture || (event !== "add" && event !== "change")) {
        return;
      }
      try {
        process.stderr.write(`[mcp-eval-runner] Re-running fixture: ${filePath}\n`);
        const fixture = loadFixture(filePath);
        const caseResult = await runCase(fixture, { timeoutMs: argv.timeout });
        const suiteResult = {
          run_id: crypto.randomUUID(),
          suite_name: fixture.name,
          started_at: Date.now() - caseResult.duration_ms,
          ended_at: Date.now(),
          total_cases: 1,
          passed: caseResult.status === "pass" ? 1 : 0,
          failed: caseResult.status !== "pass" ? 1 : 0,
          cases: [caseResult],
        };
        // Persist result
        db.insertRun({
          id: suiteResult.run_id,
          suite_name: suiteResult.suite_name,
          started_at: suiteResult.started_at,
          ended_at: suiteResult.ended_at,
          total_cases: 1,
          passed: suiteResult.passed,
          failed: suiteResult.failed,
          format: runnerOpts.format,
        });
        db.insertCaseResult({
          id: crypto.randomUUID(),
          run_id: suiteResult.run_id,
          case_name: caseResult.case_name,
          status: caseResult.status,
          duration_ms: caseResult.duration_ms,
          error_message: caseResult.error ?? null,
          assertions_json: JSON.stringify(caseResult.steps.map((s) => s.assertions)),
          created_at: Date.now(),
        });
        const formatted = formatResult(suiteResult, format);
        // Write results to stderr so they don't interfere with MCP stdio transport
        process.stderr.write(formatted + "\n");
      } catch (err) {
        process.stderr.write(`[mcp-eval-runner] Error re-running fixture ${filePath}: ${err}\n`);
      }
    });
    process.stderr.write(`[mcp-eval-runner] Watching ${fixturesDir} for changes...\n`);
  });
}
const serverOpts = {
  fixturesDir,
  dbPath,
  timeoutMs: argv.timeout,
  format,
  watch: argv.watch,
  concurrency: argv.concurrency,
};
const httpPort = argv["http-port"];
if (httpPort !== undefined) {
  startHttpServer(httpPort, serverOpts).catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
  });
} else {
  startServer(serverOpts).catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
  });
}
