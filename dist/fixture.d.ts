/**
 * YAML fixture loading and validation for MCP Eval Runner.
 *
 * Fixture JSON Schema:
 * {
 *   "type": "object",
 *   "required": ["name", "steps"],
 *   "properties": {
 *     "name": { "type": "string" },
 *     "description": { "type": "string" },
 *     "server": {
 *       "type": "object",
 *       "description": "Optional server config for live execution mode",
 *       "properties": {
 *         "command": { "type": "string" },
 *         "args": { "type": "array", "items": { "type": "string" } },
 *         "env": { "type": "object" }
 *       },
 *       "required": ["command"]
 *     },
 *     "steps": {
 *       "type": "array",
 *       "items": {
 *         "type": "object",
 *         "required": ["id", "tool"],
 *         "properties": {
 *           "id": { "type": "string" },
 *           "description": { "type": "string" },
 *           "tool": { "type": "string" },
 *           "input": { "type": "object" },
 *           "expected_output": { "type": "string" },
 *           "expect": {
 *             "type": "object",
 *             "properties": {
 *               "output_contains": { "type": "string" },
 *               "output_not_contains": { "type": "string" },
 *               "output_equals": { "type": "string" },
 *               "output_matches": { "type": "string" },
 *               "tool_called": { "type": "string" },
 *               "latency_under": { "type": "number" }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */
import type { Assertion } from "./assertions.js";
export interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
export interface FixtureStep {
  id: string;
  description?: string;
  tool: string;
  input: Record<string, unknown>;
  expected_output?: string;
  expect?: Assertion;
}
export interface Fixture {
  name: string;
  description?: string;
  server?: ServerConfig;
  steps: FixtureStep[];
}
export declare class FixtureValidationError extends Error {
  constructor(message: string);
}
/**
 * Load and validate a fixture from a YAML or JSON file.
 */
export declare function loadFixture(filePath: string): Fixture;
/**
 * Validate a raw parsed object against the fixture schema.
 */
export declare function validateFixture(raw: unknown, source?: string): Fixture;
/**
 * Load all fixtures from a directory.
 */
export declare function loadFixturesFromDir(fixturesDir: string): Fixture[];
/**
 * Write a fixture to a YAML file in the fixtures directory.
 */
export declare function writeFixture(fixturesDir: string, fixture: Fixture): string;
