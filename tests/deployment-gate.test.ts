/**
 * Tests for src/deployment-gate.ts — CI gate pass rate evaluation.
 * Uses a mock EvalDb (no SQLite dependency).
 */

import { describe, it, expect, vi } from "vitest";
import { evaluateGate } from "../src/deployment-gate.js";
import type { EvalDb, RunRecord } from "../src/db.js";

function makeRun(
  overrides: Partial<RunRecord> & { total_cases: number; passed: number; suite_name?: string },
): RunRecord {
  return {
    id: `run-${Math.random()}`,
    suite_name: overrides.suite_name ?? "default",
    started_at: Date.now(),
    ended_at: Date.now() + 100,
    failed: overrides.total_cases - overrides.passed,
    format: "console",
    ...overrides,
  };
}

function makeMockDb(runs: RunRecord[]): EvalDb {
  return {
    getAllRuns: vi.fn((limit?: number) => {
      const sorted = [...runs].sort((a, b) => b.started_at - a.started_at);
      return limit ? sorted.slice(0, limit) : sorted;
    }),
    insertRun: vi.fn(),
    updateRun: vi.fn(),
    insertCaseResult: vi.fn(),
    getLastRun: vi.fn(),
    getRunById: vi.fn(),
    getCaseResultsForRun: vi.fn(() => []),
    close: vi.fn(),
  } as unknown as EvalDb;
}

describe("evaluateGate", () => {
  it("returns passed: false with rate 0 when no runs exist", () => {
    const db = makeMockDb([]);
    const result = evaluateGate(db, { min_pass_rate: 0.8 });
    expect(result.passed).toBe(false);
    expect(result.current_rate).toBe(0);
    expect(result.run_count).toBe(0);
    expect(result.threshold).toBe(0.8);
  });

  it("passes when all cases pass", () => {
    const db = makeMockDb([
      makeRun({ total_cases: 10, passed: 10 }),
      makeRun({ total_cases: 5, passed: 5 }),
    ]);
    const result = evaluateGate(db, { min_pass_rate: 0.9 });
    expect(result.passed).toBe(true);
    expect(result.current_rate).toBe(1.0);
    expect(result.run_count).toBe(2);
  });

  it("fails when pass rate is below threshold", () => {
    const db = makeMockDb([
      makeRun({ total_cases: 10, passed: 6 }), // 60% pass rate
    ]);
    const result = evaluateGate(db, { min_pass_rate: 0.8 });
    expect(result.passed).toBe(false);
    expect(result.current_rate).toBeCloseTo(0.6, 5);
  });

  it("passes at exact threshold boundary", () => {
    const db = makeMockDb([
      makeRun({ total_cases: 10, passed: 8 }), // exactly 80%
    ]);
    const result = evaluateGate(db, { min_pass_rate: 0.8 });
    expect(result.passed).toBe(true);
    expect(result.current_rate).toBeCloseTo(0.8, 5);
  });

  it("filters by workflow_name when provided", () => {
    const db = makeMockDb([
      makeRun({ suite_name: "suite_a", total_cases: 10, passed: 10 }),
      makeRun({ suite_name: "suite_b", total_cases: 10, passed: 2 }), // 20%
    ]);
    const result = evaluateGate(db, { workflow_name: "suite_b", min_pass_rate: 0.5 });
    expect(result.passed).toBe(false);
    expect(result.current_rate).toBeCloseTo(0.2, 5);
    expect(result.run_count).toBe(1);
  });

  it("respects lookback_runs limit", () => {
    const now = Date.now();
    const db = makeMockDb([
      makeRun({ started_at: now - 3000, total_cases: 10, passed: 10 }), // oldest
      makeRun({ started_at: now - 2000, total_cases: 10, passed: 0 }), // fail
      makeRun({ started_at: now - 1000, total_cases: 10, passed: 10 }), // most recent
    ]);
    // Only look at the 1 most recent run
    const result = evaluateGate(db, { min_pass_rate: 0.9, lookback_runs: 1 });
    expect(result.run_count).toBe(1);
    expect(result.current_rate).toBe(1.0);
    expect(result.passed).toBe(true);
  });

  it("handles runs with zero total_cases gracefully", () => {
    const db = makeMockDb([makeRun({ total_cases: 0, passed: 0 })]);
    const result = evaluateGate(db, { min_pass_rate: 0.5 });
    expect(result.current_rate).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("aggregates across multiple runs", () => {
    const db = makeMockDb([
      makeRun({ total_cases: 10, passed: 8 }), // 80%
      makeRun({ total_cases: 10, passed: 6 }), // 60%
    ]);
    // Aggregate: 14/20 = 70%
    const result = evaluateGate(db, { min_pass_rate: 0.7 });
    expect(result.current_rate).toBeCloseTo(0.7, 5);
    expect(result.passed).toBe(true);
  });
});
