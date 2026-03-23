/**
 * run_suite and run_case MCP tool implementations.
 */
import { loadFixturesFromDir, loadFixture } from "../fixture.js";
import { runSuite, runCase } from "../runner.js";
import { formatResult } from "../reporter.js";
import path from "path";
import fs from "fs";
import crypto from "crypto";
/**
 * Send a progress notification for the current suite run.
 */
async function sendProgress(server, suiteId, progress, total) {
  if (!server) return;
  try {
    await server.server.notification({
      method: "notifications/progress",
      params: {
        progressToken: `eval-run-${suiteId}`,
        progress,
        total,
      },
    });
  } catch {
    // Notifications are best-effort; ignore send errors
  }
}
/**
 * Send an MCP logging notification for an assertion result.
 */
async function sendAssertionLog(server, assertionType, caseId, passed) {
  if (!server) return;
  try {
    await server.server.notification({
      method: "notifications/message",
      params: {
        level: "info",
        logger: "eval-runner",
        data: `Assertion ${assertionType} on case ${caseId}: ${passed ? "PASS" : "FAIL"}`,
      },
    });
  } catch {
    // Notifications are best-effort; ignore send errors
  }
}
/**
 * run_suite — execute all fixtures in the fixtures directory.
 */
export async function runSuiteTool(opts) {
  const fixtures = loadFixturesFromDir(opts.fixturesDir);
  if (fixtures.length === 0) {
    return [
      "No fixtures found in: " + opts.fixturesDir,
      "",
      "NOTE: This runs in simulation mode (Phase 1).",
      "Create fixtures with create_test_case or add YAML files to the fixtures directory.",
    ].join("\n");
  }
  const total = fixtures.length;
  const suiteId = crypto.randomUUID();
  let completed = 0;
  // Run fixtures one at a time, emitting progress + assertion logs per case
  const caseResultsAcc = [];
  for (const fixture of fixtures) {
    const caseResult = await runCase(fixture, opts.runnerOptions);
    caseResultsAcc.push(caseResult);
    // Emit assertion-level logging notifications
    for (const step of caseResult.steps) {
      for (const assertion of step.assertions) {
        await sendAssertionLog(opts.server, assertion.type, fixture.name, assertion.passed);
      }
    }
    completed++;
    await sendProgress(opts.server, suiteId, completed, total);
  }
  // Persist results through runSuite (which also recalculates pass/fail totals)
  const result = await runSuite(fixtures, "default", opts.runnerOptions, opts.db);
  const formatted = formatResult(result, opts.runnerOptions.format);
  return formatted;
}
/**
 * run_case — run a single named test case.
 */
export async function runCaseTool(name, opts) {
  // Find the fixture file by name
  const fixtures = loadFixturesFromDir(opts.fixturesDir);
  const fixture = fixtures.find((f) => f.name === name);
  if (!fixture) {
    // Try to find by filename as well
    const candidates = [
      path.join(opts.fixturesDir, `${name}.yaml`),
      path.join(opts.fixturesDir, `${name}.yml`),
      path.join(opts.fixturesDir, `${name}.json`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const loaded = loadFixture(c);
        const caseResult = await runCase(loaded, opts.runnerOptions);
        // Emit assertion-level logging notifications
        for (const step of caseResult.steps) {
          for (const assertion of step.assertions) {
            await sendAssertionLog(opts.server, assertion.type, loaded.name, assertion.passed);
          }
        }
        const suiteResult = {
          run_id: crypto.randomUUID(),
          suite_name: name,
          started_at: Date.now() - caseResult.duration_ms,
          ended_at: Date.now(),
          total_cases: 1,
          passed: caseResult.status === "pass" ? 1 : 0,
          failed: caseResult.status !== "pass" ? 1 : 0,
          cases: [caseResult],
        };
        return formatResult(suiteResult, opts.runnerOptions.format);
      }
    }
    throw new Error(`No fixture named "${name}" found in ${opts.fixturesDir}`);
  }
  const caseResult = await runCase(fixture, opts.runnerOptions);
  // Emit assertion-level logging notifications
  for (const step of caseResult.steps) {
    for (const assertion of step.assertions) {
      await sendAssertionLog(opts.server, assertion.type, fixture.name, assertion.passed);
    }
  }
  // Persist to DB — run record must exist before case_result (foreign key)
  const runId = crypto.randomUUID();
  const now = Date.now();
  opts.db.insertRun({
    id: runId,
    suite_name: name,
    started_at: now - caseResult.duration_ms,
    ended_at: now,
    total_cases: 1,
    passed: caseResult.status === "pass" ? 1 : 0,
    failed: caseResult.status !== "pass" ? 1 : 0,
    format: opts.runnerOptions.format ?? "console",
  });
  opts.db.insertCaseResult({
    id: crypto.randomUUID(),
    run_id: runId,
    case_name: caseResult.case_name,
    status: caseResult.status,
    duration_ms: caseResult.duration_ms,
    error_message: caseResult.error ?? null,
    assertions_json: JSON.stringify(caseResult.steps.map((s) => s.assertions)),
    created_at: now,
  });
  const suiteResult = {
    run_id: runId,
    suite_name: name,
    started_at: now - caseResult.duration_ms,
    ended_at: now,
    total_cases: 1,
    passed: caseResult.status === "pass" ? 1 : 0,
    failed: caseResult.status !== "pass" ? 1 : 0,
    cases: [caseResult],
  };
  const formatted = formatResult(suiteResult, opts.runnerOptions.format);
  return formatted;
}
