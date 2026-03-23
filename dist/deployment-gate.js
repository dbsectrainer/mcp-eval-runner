/**
 * CI deployment gate for mcp-eval-runner.
 * Evaluates whether a recent set of runs meets a minimum pass rate threshold.
 * Intended for use in CI pipelines to block deploys on regressions.
 */
/**
 * Evaluate the deployment gate against recent run history.
 *
 * Queries the last `lookback_runs` runs (optionally filtered by suite name),
 * computes the aggregate pass rate, and compares it to `min_pass_rate`.
 */
export function evaluateGate(db, config) {
    const lookback = config.lookback_runs ?? 10;
    const threshold = config.min_pass_rate;
    // Fetch recent runs from the database
    const allRuns = db.getAllRuns(lookback * 10); // over-fetch then filter
    const relevantRuns = config.workflow_name
        ? allRuns.filter((r) => r.suite_name === config.workflow_name).slice(0, lookback)
        : allRuns.slice(0, lookback);
    const runCount = relevantRuns.length;
    if (runCount === 0) {
        return {
            passed: false,
            current_rate: 0,
            threshold,
            run_count: 0,
        };
    }
    // Aggregate total_cases and passed across all relevant runs
    let totalCases = 0;
    let totalPassed = 0;
    for (const run of relevantRuns) {
        totalCases += run.total_cases;
        totalPassed += run.passed;
    }
    const currentRate = totalCases > 0 ? totalPassed / totalCases : 0;
    return {
        passed: currentRate >= threshold,
        current_rate: currentRate,
        threshold,
        run_count: runCount,
    };
}
