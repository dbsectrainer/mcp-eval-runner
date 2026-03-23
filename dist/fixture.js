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
export class FixtureValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FixtureValidationError";
  }
}
/**
 * Parse optional server config block from a fixture.
 */
function parseServerConfig(raw) {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw;
  if (typeof obj["command"] !== "string" || !obj["command"].trim()) return undefined;
  return {
    command: obj["command"],
    args: Array.isArray(obj["args"]) ? obj["args"] : [],
    env: typeof obj["env"] === "object" && obj["env"] !== null ? obj["env"] : undefined,
  };
}
/**
 * Load and validate a fixture from a YAML or JSON file.
 */
export function loadFixture(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  let raw;
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
export function validateFixture(raw, source) {
  if (typeof raw !== "object" || raw === null) {
    throw new FixtureValidationError(`${source ?? "Fixture"}: must be an object`);
  }
  const obj = raw;
  if (typeof obj["name"] !== "string" || obj["name"].trim() === "") {
    throw new FixtureValidationError(`${source ?? "Fixture"}: "name" must be a non-empty string`);
  }
  if (!Array.isArray(obj["steps"])) {
    throw new FixtureValidationError(`${source ?? "Fixture"}: "steps" must be an array`);
  }
  const steps = obj["steps"].map((step, idx) => {
    if (typeof step !== "object" || step === null) {
      throw new FixtureValidationError(`${source ?? "Fixture"}: step[${idx}] must be an object`);
    }
    const s = step;
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
      id: s["id"],
      description: typeof s["description"] === "string" ? s["description"] : undefined,
      tool: s["tool"],
      input: typeof s["input"] === "object" && s["input"] !== null ? s["input"] : {},
      expected_output: typeof s["expected_output"] === "string" ? s["expected_output"] : undefined,
      expect: typeof s["expect"] === "object" && s["expect"] !== null ? s["expect"] : undefined,
    };
  });
  return {
    name: obj["name"],
    description: typeof obj["description"] === "string" ? obj["description"] : undefined,
    server: parseServerConfig(obj["server"]),
    steps,
  };
}
/**
 * Load all fixtures from a directory.
 */
export function loadFixturesFromDir(fixturesDir) {
  if (!fs.existsSync(fixturesDir)) {
    return [];
  }
  const files = fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"))
    .sort();
  const fixtures = [];
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
export function writeFixture(fixturesDir, fixture) {
  fs.mkdirSync(fixturesDir, { recursive: true });
  const fileName = `${fixture.name.replace(/[^a-z0-9_-]/gi, "_")}.yaml`;
  const filePath = path.join(fixturesDir, fileName);
  const content = yaml.dump(fixture, { lineWidth: 100 });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
