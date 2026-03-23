/**
 * SQLite schema and queries for MCP Eval Runner run history.
 * Uses the built-in node:sqlite module (Node.js >= 22.5).
 */
export interface RunRecord {
    id: string;
    suite_name: string;
    started_at: number;
    ended_at: number | null;
    total_cases: number;
    passed: number;
    failed: number;
    format: string;
}
export interface CaseResultRecord {
    id: string;
    run_id: string;
    case_name: string;
    status: "pass" | "fail" | "error";
    duration_ms: number | null;
    error_message: string | null;
    assertions_json: string | null;
    created_at: number;
}
/**
 * Expand ~ to the user's home directory.
 */
export declare function expandHome(p: string): string;
export declare class EvalDb {
    private db;
    constructor(dbPath: string);
    insertRun(run: RunRecord): void;
    updateRun(id: string, updates: Partial<Pick<RunRecord, "ended_at" | "total_cases" | "passed" | "failed">>): void;
    insertCaseResult(result: CaseResultRecord): void;
    getLastRun(suiteName?: string): RunRecord | undefined;
    getRunById(id: string): RunRecord | undefined;
    getCaseResultsForRun(runId: string): CaseResultRecord[];
    getAllRuns(limit?: number): RunRecord[];
    close(): void;
}
