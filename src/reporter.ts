/**
 * Console/JSON/HTML output formatting for MCP Eval Runner.
 */

import type { SuiteRunResult, CaseRunResult, StepRunResult } from "./runner.js";
import type { AssertionResult } from "./assertions.js";

// ANSI color codes
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function pass(s: string): string {
  return `${GREEN}${s}${RESET}`;
}

function fail(s: string): string {
  return `${RED}${s}${RESET}`;
}

function warn(s: string): string {
  return `${YELLOW}${s}${RESET}`;
}

function bold(s: string): string {
  return `${BOLD}${s}${RESET}`;
}

function dim(s: string): string {
  return `${DIM}${s}${RESET}`;
}

function statusIcon(status: "pass" | "fail" | "error"): string {
  switch (status) {
    case "pass":
      return pass("✓");
    case "fail":
      return fail("✗");
    case "error":
      return warn("!");
  }
}

function formatAssertions(assertions: AssertionResult[], indent: string): string {
  return assertions
    .map((a) => {
      const icon = a.passed ? pass("  ✓") : fail("  ✗");
      return `${indent}${icon} [${a.type}] ${a.passed ? dim(a.message) : fail(a.message)}`;
    })
    .join("\n");
}

function formatStep(step: StepRunResult, indent = "    "): string {
  const icon = statusIcon(step.status);
  const lines = [
    `${indent}${icon} step:${step.step_id} (tool: ${step.tool}) ${dim(`${step.duration_ms}ms`)}`,
  ];
  if (step.assertions.length > 0) {
    lines.push(formatAssertions(step.assertions, indent + "  "));
  }
  if (step.error) {
    lines.push(`${indent}  ${fail("Error: " + step.error)}`);
  }
  return lines.join("\n");
}

function formatCase(c: CaseRunResult): string {
  const icon = statusIcon(c.status);
  const lines = [`  ${icon} ${bold(c.case_name)} ${dim(`(${c.duration_ms}ms)`)}`];
  for (const step of c.steps) {
    lines.push(formatStep(step));
  }
  if (c.error) {
    lines.push(`    ${fail("Error: " + c.error)}`);
  }
  return lines.join("\n");
}

export function formatConsole(result: SuiteRunResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(bold(`MCP Eval Runner — Suite: ${result.suite_name}`));
  lines.push(dim(`Run ID: ${result.run_id}`));
  lines.push(
    dim(
      `Started: ${new Date(result.started_at).toISOString()}  Duration: ${result.ended_at - result.started_at}ms`,
    ),
  );
  lines.push("");

  for (const c of result.cases) {
    lines.push(formatCase(c));
  }

  lines.push("");
  const summary =
    result.failed === 0
      ? pass(`✓ ${result.passed}/${result.total_cases} passed`)
      : fail(`✗ ${result.failed}/${result.total_cases} failed`) +
        (result.passed > 0 ? `, ${pass(String(result.passed))} passed` : "");
  lines.push(bold("Summary: ") + summary);
  lines.push("");

  return lines.join("\n");
}

export function formatJson(result: SuiteRunResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatHtml(result: SuiteRunResult): string {
  const rows = result.cases
    .map((c) => {
      const color = c.status === "pass" ? "#22c55e" : c.status === "fail" ? "#ef4444" : "#f59e0b";
      const stepsHtml = c.steps
        .map((s) => {
          const sc = s.status === "pass" ? "#22c55e" : "#ef4444";
          const assertionsHtml = s.assertions
            .map(
              (a) =>
                `<li style="color:${a.passed ? "#22c55e" : "#ef4444"}">${a.type}: ${escapeHtml(a.message)}</li>`,
            )
            .join("");
          return `
          <tr>
            <td style="padding-left:2em;color:${sc}">${escapeHtml(s.step_id)}</td>
            <td>${escapeHtml(s.tool)}</td>
            <td style="color:${sc}">${s.status}</td>
            <td>${s.duration_ms}ms</td>
            <td><ul>${assertionsHtml}</ul></td>
          </tr>`;
        })
        .join("");
      return `
        <tr>
          <td colspan="5" style="font-weight:bold;color:${color}">${escapeHtml(c.case_name)} — ${c.status} (${c.duration_ms}ms)</td>
        </tr>
        ${stepsHtml}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCP Eval Runner Report</title>
  <style>
    body { font-family: monospace; background: #111; color: #eee; padding: 2em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #333; }
    th { background: #222; }
    .pass { color: #22c55e; }
    .fail { color: #ef4444; }
  </style>
</head>
<body>
  <h1>MCP Eval Runner</h1>
  <p>Suite: <strong>${escapeHtml(result.suite_name)}</strong> | Run ID: ${escapeHtml(result.run_id)}</p>
  <p>Started: ${new Date(result.started_at).toISOString()} | Duration: ${result.ended_at - result.started_at}ms</p>
  <p class="${result.failed === 0 ? "pass" : "fail"}">
    ${result.passed}/${result.total_cases} passed, ${result.failed} failed
  </p>
  <table>
    <thead>
      <tr><th>Case / Step</th><th>Tool</th><th>Status</th><th>Duration</th><th>Assertions</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatResult(result: SuiteRunResult, format: "console" | "json" | "html"): string {
  switch (format) {
    case "json":
      return formatJson(result);
    case "html":
      return formatHtml(result);
    default:
      return formatConsole(result);
  }
}
