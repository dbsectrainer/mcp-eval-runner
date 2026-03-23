/**
 * Append-only audit log for mcp-eval-runner eval runs.
 * Logs are written to ~/.mcp/eval-runner-audit.jsonl (one JSON object per line).
 * Supports recording individual entries and exporting filtered ranges.
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface AuditEntry {
  timestamp: string; // ISO 8601
  run_id: string;
  fixture_name: string;
  passed: boolean;
  duration_ms: number;
  user_id?: string;
}

const DEFAULT_AUDIT_PATH = path.join(os.homedir(), ".mcp", "eval-runner-audit.jsonl");

export class AuditLog {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_AUDIT_PATH;
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  /**
   * Append a single audit entry to the log file.
   */
  record(entry: AuditEntry): void {
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(this.filePath, line, "utf-8");
  }

  /**
   * Export audit entries, optionally filtered by ISO timestamp range [from, to].
   * Both `from` and `to` are inclusive ISO date strings.
   */
  export(from?: string, to?: string): AuditEntry[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const raw = fs.readFileSync(this.filePath, "utf-8");
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const entries: AuditEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip malformed lines
      }
    }

    let filtered = entries;

    if (from !== undefined) {
      const fromTs = new Date(from).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= fromTs);
    }

    if (to !== undefined) {
      const toTs = new Date(to).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= toTs);
    }

    return filtered;
  }
}
