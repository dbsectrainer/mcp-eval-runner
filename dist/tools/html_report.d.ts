/**
 * generate_html_report tool implementation.
 *
 * Generates a full single-file HTML report for a given run_id.
 * All styles are inlined — no external CDN required.
 */
import type { EvalDb } from "../db.js";
export declare function generateHtmlReportTool(runId: string, db: EvalDb): string;
