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

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
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

export class FixtureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureValidationError";
  }
}

/**
 * Parse optional server config block from a fixture.
 */
function parseServerConfig(raw: unknown): ServerConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj["command"] !== "string" || !obj["command"].trim()) return undefined;
  return {
    command: obj["command"] as string,
    args: Array.isArray(obj["args"]) ? (obj["args"] as string[]) : [],
    env:
      typeof obj["env"] === "object" && obj["env"] !== null
        ? (obj["env"] as Record<string, string>)
        : undefined,
  };
}

/**
 * Load and validate a fixture from a YAML or JSON file.
 */
export function loadFixture(filePath: string): Fixture {
  const content = fs.readFileSync(filePath, "utf-8");
  let raw: unknown;

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    raw = yaml.load(content);
  } else if (filePath.endsWith(".json")) {
    raw = JSON.parse(content);
  } else {
    throw new FixtureValidationError(
      `Unsupported fixture format: ${filePath}. Use .yaml, .yml, or .json`,
    );
  }

  return validateFixture(raw, filePath);
}

/**
 * Validate a raw parsed object against the fixture schema.
 */
export function validateFixture(raw: unknown, source?: string): Fixture {
  if (typeof raw !== "object" || raw === null) {
    throw new FixtureValidationError(`${source ?? "Fixture"}: must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].trim() === "") {
    throw new FixtureValidationError(`${source ?? "Fixture"}: "name" must be a non-empty string`);
  }

  if (!Array.isArray(obj["steps"])) {
    throw new FixtureValidationError(`${source ?? "Fixture"}: "steps" must be an array`);
  }

  const steps: FixtureStep[] = obj["steps"].map((step: unknown, idx: number) => {
    if (typeof step !== "object" || step === null) {
      throw new FixtureValidationError(`${source ?? "Fixture"}: step[${idx}] must be an object`);
    }
    const s = step as Record<string, unknown>;
    if (typeof s["id"] !== "string" || s["id"].trim() === "") {
      throw new FixtureValidationError(
        `${source ?? "Fixture"}: step[${idx}].id must be a non-empty string`,
      );
    }
    if (typeof s["tool"] !== "string" || s["tool"].trim() === "") {
      throw new FixtureValidationError(
        `${source ?? "Fixture"}: step[${idx}].tool must be a non-empty string`,
      );
    }
    return {
      id: s["id"] as string,
      description: typeof s["description"] === "string" ? s["description"] : undefined,
      tool: s["tool"] as string,
      input:
        typeof s["input"] === "object" && s["input"] !== null
          ? (s["input"] as Record<string, unknown>)
          : {},
      expected_output: typeof s["expected_output"] === "string" ? s["expected_output"] : undefined,
      expect:
        typeof s["expect"] === "object" && s["expect"] !== null
          ? (s["expect"] as Assertion)
          : undefined,
    };
  });

  return {
    name: obj["name"] as string,
    description: typeof obj["description"] === "string" ? obj["description"] : undefined,
    server: parseServerConfig(obj["server"]),
    steps,
  };
}

/**
 * Load all fixtures from a directory.
 */
export function loadFixturesFromDir(fixturesDir: string): Fixture[] {
  if (!fs.existsSync(fixturesDir)) {
    return [];
  }

  const files = fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"))
    .sort();

  const fixtures: Fixture[] = [];
  for (const file of files) {
    try {
      fixtures.push(loadFixture(path.join(fixturesDir, file)));
    } catch (err) {
      // Log but continue loading other fixtures
      console.error(`Warning: failed to load fixture ${file}: ${err}`);
    }
  }
  return fixtures;
}

/**
 * Write a fixture to a YAML file in the fixtures directory.
 */
export function writeFixture(fixturesDir: string, fixture: Fixture): string {
  fs.mkdirSync(fixturesDir, { recursive: true });
  const fileName = `${fixture.name.replace(/[^a-z0-9_-]/gi, "_")}.yaml`;
  const filePath = path.join(fixturesDir, fileName);
  const content = yaml.dump(fixture, { lineWidth: 100 });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
