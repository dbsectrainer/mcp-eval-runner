import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  validateFixture,
  loadFixture,
  loadFixturesFromDir,
  writeFixture,
  FixtureValidationError,
} from "../src/fixture.js";

describe("validateFixture", () => {
  it("validates a correct fixture object", () => {
    const raw = {
      name: "test",
      steps: [{ id: "s1", tool: "some_tool", input: {} }],
    };
    const fixture = validateFixture(raw);
    expect(fixture.name).toBe("test");
    expect(fixture.steps).toHaveLength(1);
  });

  it("throws when name is missing", () => {
    expect(() => validateFixture({ steps: [] })).toThrow(FixtureValidationError);
  });

  it("throws when name is empty string", () => {
    expect(() => validateFixture({ name: "", steps: [] })).toThrow(FixtureValidationError);
  });

  it("throws when steps is not an array", () => {
    expect(() => validateFixture({ name: "test", steps: "bad" })).toThrow(FixtureValidationError);
  });

  it("throws when step is missing id", () => {
    expect(() => validateFixture({ name: "test", steps: [{ tool: "t" }] })).toThrow(
      FixtureValidationError,
    );
  });

  it("throws when step is missing tool", () => {
    expect(() => validateFixture({ name: "test", steps: [{ id: "s1" }] })).toThrow(
      FixtureValidationError,
    );
  });

  it("accepts optional fields", () => {
    const raw = {
      name: "test",
      description: "A test",
      steps: [
        {
          id: "s1",
          tool: "my_tool",
          description: "step desc",
          expected_output: "output",
          expect: { output_contains: "output" },
        },
      ],
    };
    const fixture = validateFixture(raw);
    expect(fixture.description).toBe("A test");
    expect(fixture.steps[0].expected_output).toBe("output");
    expect(fixture.steps[0].expect?.output_contains).toBe("output");
  });

  it("defaults input to empty object when missing", () => {
    const raw = {
      name: "test",
      steps: [{ id: "s1", tool: "my_tool" }],
    };
    const fixture = validateFixture(raw);
    expect(fixture.steps[0].input).toEqual({});
  });
});

describe("loadFixture / writeFixture", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-runner-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a fixture through write and load", () => {
    const fixture = {
      name: "round_trip",
      description: "test",
      steps: [
        {
          id: "s1",
          tool: "my_tool",
          input: { key: "value" },
          expect: { output_contains: "hello" },
        },
      ],
    };
    const filePath = writeFixture(tmpDir, fixture);
    const loaded = loadFixture(filePath);
    expect(loaded.name).toBe("round_trip");
    expect(loaded.steps).toHaveLength(1);
    expect(loaded.steps[0].expect?.output_contains).toBe("hello");
  });

  it("throws FixtureValidationError for unsupported extension", () => {
    const p = path.join(tmpDir, "test.txt");
    fs.writeFileSync(p, "{}");
    expect(() => loadFixture(p)).toThrow(FixtureValidationError);
  });

  it("loads JSON fixtures", () => {
    const fixture = {
      name: "json_fixture",
      steps: [{ id: "s1", tool: "t", input: {} }],
    };
    const p = path.join(tmpDir, "test.json");
    fs.writeFileSync(p, JSON.stringify(fixture));
    const loaded = loadFixture(p);
    expect(loaded.name).toBe("json_fixture");
  });
});

describe("loadFixturesFromDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-runner-dir-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for empty directory", () => {
    expect(loadFixturesFromDir(tmpDir)).toEqual([]);
  });

  it("returns empty array for non-existent directory", () => {
    expect(loadFixturesFromDir("/nonexistent/path")).toEqual([]);
  });

  it("loads multiple fixtures from a directory", () => {
    const _f1 = {
      name: "fixture_a",
      steps: [{ id: "s1", tool: "t", input: {} }],
    };
    const f2 = {
      name: "fixture_b",
      steps: [
        { id: "s1", tool: "t", input: {} },
        { id: "s2", tool: "u", input: {} },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, "a.yaml"),
      `name: fixture_a\nsteps:\n  - id: s1\n    tool: t\n`,
    );
    fs.writeFileSync(path.join(tmpDir, "b.json"), JSON.stringify(f2));
    const fixtures = loadFixturesFromDir(tmpDir);
    expect(fixtures).toHaveLength(2);
    const names = fixtures.map((f) => f.name).sort();
    expect(names).toEqual(["fixture_a", "fixture_b"]);
  });

  it("skips non-fixture files", () => {
    fs.writeFileSync(path.join(tmpDir, "readme.md"), "# docs");
    fs.writeFileSync(path.join(tmpDir, "script.js"), "console.log()");
    expect(loadFixturesFromDir(tmpDir)).toEqual([]);
  });
});
