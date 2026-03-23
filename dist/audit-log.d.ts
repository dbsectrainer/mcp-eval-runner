/**
 * Append-only audit log for mcp-eval-runner eval runs.
 * Logs are written to ~/.mcp/eval-runner-audit.jsonl (one JSON object per line).
 * Supports recording individual entries and exporting filtered ranges.
 */
export interface AuditEntry {
  timestamp: string;
  run_id: string;
  fixture_name: string;
  passed: boolean;
  duration_ms: number;
  user_id?: string;
}
export declare class AuditLog {
  private filePath;
  constructor(filePath?: string);
  /**
   * Append a single audit entry to the log file.
   */
  record(entry: AuditEntry): void;
  /**
   * Export audit entries, optionally filtered by ISO timestamp range [from, to].
   * Both `from` and `to` are inclusive ISO date strings.
   */
  export(from?: string, to?: string): AuditEntry[];
}
