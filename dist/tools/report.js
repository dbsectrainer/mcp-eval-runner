/**
 * regression_report and compare_results MCP tool implementations.
 */
/**
 * regression_report — compare current state to the last run; returns what changed.
 */
export async function regressionReportTool(fixturesDir, db) {
    const runs = db.getAllRuns(2);
    if (runs.length === 0) {
        return ["No run history found.", "", "Run run_suite first to establish a baseline."].join("\n");
    }
    if (runs.length === 1) {
        const [latest] = runs;
        const cases = db.getCaseResultsForRun(latest.id);
        const lines = [
            `Only one run found (Run ID: ${latest.id}).`,
            `Started: ${new Date(latest.started_at).toISOString()}`,
            `Results: ${latest.passed} passed, ${latest.failed} failed`,
            "",
            "Run again after making changes to see regressions.",
            "",
            "Cases:",
        ];
        for (const c of cases) {
            lines.push(`  ${c.status === "pass" ? "✓" : "✗"} ${c.case_name} — ${c.status}`);
        }
        return lines.join("\n");
    }
    const [latest, previous] = runs;
    return diffRuns(previous, latest, db);
}
/**
 * compare_results — diff two named run results by run ID.
 */
export async function compareResultsTool(runIdA, runIdB, db) {
    const runA = db.getRunById(runIdA);
    const runB = db.getRunById(runIdB);
    if (!runA) {
        throw new Error(`Run not found: ${runIdA}`);
    }
    if (!runB) {
        throw new Error(`Run not found: ${runIdB}`);
    }
    return diffRuns(runA, runB, db);
}
function diffRuns(previous, latest, db) {
    const prevCases = db.getCaseResultsForRun(previous.id);
    const latestCases = db.getCaseResultsForRun(latest.id);
    const prevMap = new Map(prevCases.map((c) => [c.case_name, c]));
    const latestMap = new Map(latestCases.map((c) => [c.case_name, c]));
    const regressions = [];
    const fixes = [];
    const newCases = [];
    const removed = [];
    const unchanged = [];
    // Check for regressions and fixes
    for (const [name, latestCase] of latestMap) {
        const prevCase = prevMap.get(name);
        if (!prevCase) {
            newCases.push(`  + ${name} (new, ${latestCase.status})`);
        }
        else if (prevCase.status === "pass" && latestCase.status !== "pass") {
            regressions.push(`  ✗ ${name}: ${prevCase.status} → ${latestCase.status}`);
        }
        else if (prevCase.status !== "pass" && latestCase.status === "pass") {
            fixes.push(`  ✓ ${name}: ${prevCase.status} → ${latestCase.status}`);
        }
        else {
            unchanged.push(`  = ${name}: ${latestCase.status}`);
        }
    }
    // Check for removed cases
    for (const [name] of prevMap) {
        if (!latestMap.has(name)) {
            removed.push(`  - ${name} (removed)`);
        }
    }
    const lines = [
        "=== Regression Report ===",
        "",
        `Previous run: ${previous.id}  (${new Date(previous.started_at).toISOString()})`,
        `  ${previous.passed}/${previous.total_cases} passed`,
        "",
        `Latest run:   ${latest.id}  (${new Date(latest.started_at).toISOString()})`,
        `  ${latest.passed}/${latest.total_cases} passed`,
        "",
    ];
    if (regressions.length > 0) {
        lines.push(`REGRESSIONS (${regressions.length}):`);
        lines.push(...regressions);
        lines.push("");
    }
    if (fixes.length > 0) {
        lines.push(`FIXED (${fixes.length}):`);
        lines.push(...fixes);
        lines.push("");
    }
    if (newCases.length > 0) {
        lines.push(`NEW CASES (${newCases.length}):`);
        lines.push(...newCases);
        lines.push("");
    }
    if (removed.length > 0) {
        lines.push(`REMOVED (${removed.length}):`);
        lines.push(...removed);
        lines.push("");
    }
    if (unchanged.length > 0) {
        lines.push(`UNCHANGED (${unchanged.length}):`);
        lines.push(...unchanged);
        lines.push("");
    }
    if (regressions.length === 0 &&
        fixes.length === 0 &&
        newCases.length === 0 &&
        removed.length === 0) {
        lines.push("No changes detected between runs.");
    }
    return lines.join("\n");
}
