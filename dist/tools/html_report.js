/**
 * generate_html_report tool implementation.
 *
 * Generates a full single-file HTML report for a given run_id.
 * All styles are inlined — no external CDN required.
 */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function statusBadge(status) {
  const color = status === "pass" ? "#22c55e" : status === "fail" ? "#ef4444" : "#f59e0b";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-weight:bold;font-size:.85em">${escapeHtml(status)}</span>`;
}
function assertionRows(assertions) {
  if (assertions.length === 0) {
    return `<tr><td colspan="3" style="color:#888;font-style:italic">no assertions</td></tr>`;
  }
  return assertions
    .map((a) => {
      const color = a.passed ? "#22c55e" : "#ef4444";
      return `<tr>
        <td style="color:${color}">${a.passed ? "✓" : "✗"}</td>
        <td><code>${escapeHtml(a.type)}</code></td>
        <td style="color:${color}">${escapeHtml(a.message)}</td>
      </tr>`;
    })
    .join("\n");
}
export function generateHtmlReportTool(runId, db) {
  const run = db.getRunById(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  const cases = db.getCaseResultsForRun(runId);
  const duration = run.ended_at !== null ? `${run.ended_at - run.started_at}ms` : "—";
  const overallColor = run.failed === 0 ? "#22c55e" : "#ef4444";
  const caseRows = cases
    .map((c) => {
      const caseColor =
        c.status === "pass" ? "#22c55e" : c.status === "fail" ? "#ef4444" : "#f59e0b";
      // Parse assertions_json — it is an array of AssertionResult[][]
      // (one array of assertion results per step)
      let stepsAssertions = [];
      try {
        if (c.assertions_json) {
          stepsAssertions = JSON.parse(c.assertions_json);
        }
      } catch {
        // ignore parse errors
      }
      const assertionSections = stepsAssertions
        .map((stepAssertions, idx) => {
          if (stepAssertions.length === 0) return "";
          return `<details style="margin-top:8px">
            <summary style="cursor:pointer;color:#aaa">Step ${idx + 1} assertions (${stepAssertions.length})</summary>
            <table style="width:100%;margin-top:4px;border-collapse:collapse">
              <thead><tr>
                <th style="width:2em;text-align:left"></th>
                <th style="text-align:left;color:#aaa">Type</th>
                <th style="text-align:left;color:#aaa">Message</th>
              </tr></thead>
              <tbody>${assertionRows(stepAssertions)}</tbody>
            </table>
          </details>`;
        })
        .join("");
      return `<tr>
        <td style="padding:12px 8px;font-weight:bold;color:${caseColor}">${escapeHtml(c.case_name)}</td>
        <td style="padding:12px 8px">${statusBadge(c.status)}</td>
        <td style="padding:12px 8px;color:#888">${c.duration_ms !== null ? `${c.duration_ms}ms` : "—"}</td>
        <td style="padding:12px 8px">
          ${c.error_message ? `<span style="color:#ef4444">${escapeHtml(c.error_message)}</span>` : ""}
          ${assertionSections}
        </td>
      </tr>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MCP Eval Report — ${escapeHtml(run.suite_name)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #0f1117;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    h1 { font-size: 1.5rem; margin-bottom: .5rem; }
    h2 { font-size: 1.1rem; margin: 1.5rem 0 .75rem; color: #94a3b8; }
    .meta { color: #64748b; font-size: .85rem; margin-bottom: 1.5rem; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: #1e2433;
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    .stat-card .value {
      font-size: 2rem;
      font-weight: bold;
      display: block;
    }
    .stat-card .label { font-size: .75rem; color: #64748b; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e2433;
      border-radius: 8px;
      overflow: hidden;
    }
    thead tr { background: #252d3d; }
    th {
      padding: 10px 8px;
      text-align: left;
      font-size: .8rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    tbody tr:hover { background: #252d3d; }
    tbody tr + tr td { border-top: 1px solid #2d3748; }
    td { vertical-align: top; }
    code { background: #2d3748; padding: 1px 4px; border-radius: 3px; font-size: .85em; }
    details summary { list-style: none; }
    details summary::-webkit-details-marker { display: none; }
    details[open] summary { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>MCP Eval Runner — Report</h1>
  <p class="meta">
    Suite: <strong>${escapeHtml(run.suite_name)}</strong> &nbsp;|&nbsp;
    Run ID: <code>${escapeHtml(run.id)}</code> &nbsp;|&nbsp;
    Started: ${new Date(run.started_at).toISOString()} &nbsp;|&nbsp;
    Duration: ${duration}
  </p>

  <div class="summary-grid">
    <div class="stat-card">
      <span class="value" style="color:#94a3b8">${run.total_cases}</span>
      <span class="label">Total Cases</span>
    </div>
    <div class="stat-card">
      <span class="value" style="color:#22c55e">${run.passed}</span>
      <span class="label">Passed</span>
    </div>
    <div class="stat-card">
      <span class="value" style="color:#ef4444">${run.failed}</span>
      <span class="label">Failed</span>
    </div>
    <div class="stat-card">
      <span class="value" style="color:${overallColor}">${run.failed === 0 ? "PASS" : "FAIL"}</span>
      <span class="label">Overall</span>
    </div>
  </div>

  <h2>Test Cases</h2>
  <table>
    <thead>
      <tr>
        <th>Case</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${cases.length > 0 ? caseRows : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b">No cases found for this run.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}
