/**
 * list_cases and create_test_case MCP tool implementations.
 */

import { loadFixturesFromDir, writeFixture, validateFixture } from "../fixture.js";

/**
 * list_cases — enumerate available fixtures with their step counts.
 */
export function listCasesTool(fixturesDir: string): string {
  const fixtures = loadFixturesFromDir(fixturesDir);

  if (fixtures.length === 0) {
    return [
      "No fixtures found in: " + fixturesDir,
      "",
      "Use create_test_case to add your first test case.",
    ].join("\n");
  }

  const lines: string[] = [`Found ${fixtures.length} fixture(s) in: ${fixturesDir}`, ""];

  for (const f of fixtures) {
    lines.push(
      `  • ${f.name} — ${f.steps.length} step(s)${f.description ? `  (${f.description})` : ""}`,
    );
    for (const step of f.steps) {
      lines.push(
        `      - [${step.id}] tool: ${step.tool}${step.description ? `  — ${step.description}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * create_test_case — create a new YAML fixture file.
 */
export function createTestCaseTool(name: string, steps: unknown[], fixturesDir: string): string {
  // Validate the input by constructing a fixture object and running it through validateFixture
  const raw = { name, steps };
  const fixture = validateFixture(raw, "create_test_case input");

  const filePath = writeFixture(fixturesDir, fixture);

  return [
    `Created fixture: ${filePath}`,
    `  Name: ${fixture.name}`,
    `  Steps: ${fixture.steps.length}`,
    "",
    "Use run_case to execute it, or run_suite to run all fixtures.",
  ].join("\n");
}
