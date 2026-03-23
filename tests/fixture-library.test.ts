/**
 * Tests for src/fixture-library.ts — fixture discovery and publishing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { discoverFixtures, publishFixture } from "../src/fixture-library.js";

describe("discoverFixtures", () => {
  let tmpDir: string;
  let dir1: string;
  let dir2: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-lib-test-"));
    dir1 = path.join(tmpDir, "dir1");
    dir2 = path.join(tmpDir, "dir2");
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function _writeFixture(dir: string, name: string, steps: number = 2): void {
    const stepsArr = Array.from({ length: steps }, (_, i) => ({
      id: `step_${i + 1}`,
      tool: "my_tool",
      input: {},
    }));
    const fixture = { name, steps: stepsArr };
    fs.writeFileSync(path.join(dir, `${name}.yaml`), require_yaml_dump(fixture));
  }

  // Simple YAML serializer for tests (no external dependency needed)
  function require_yaml_dump(obj: object): string {
    return JSON.stringify(obj); // Write as JSON since loadFixture supports .yaml AND .json; we'll use .json
  }

  function writeJsonFixture(dir: string, name: string, steps: number = 2): void {
    const stepsArr = Array.from({ length: steps }, (_, i) => ({
      id: `step_${i + 1}`,
      tool: "my_tool",
      input: {},
    }));
    const fixture = { name, steps: stepsArr };
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(fixture, null, 2));
  }

  it("returns empty array when dirs is empty", () => {
    const result = discoverFixtures([]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when dir does not exist", () => {
    const result = discoverFixtures([path.join(tmpDir, "nonexistent")]);
    expect(result).toHaveLength(0);
  });

  it("discovers fixtures from a single directory", () => {
    writeJsonFixture(dir1, "fixture_a", 3);
    writeJsonFixture(dir1, "fixture_b", 1);

    const result = discoverFixtures([dir1]);
    expect(result).toHaveLength(2);

    const names = result.map((e) => e.name).sort();
    expect(names).toEqual(["fixture_a", "fixture_b"]);
  });

  it("returns correct case_count (step count) per fixture", () => {
    writeJsonFixture(dir1, "multi_step", 5);

    const result = discoverFixtures([dir1]);
    expect(result).toHaveLength(1);
    expect(result[0].case_count).toBe(5);
    expect(result[0].suite_count).toBe(1);
  });

  it("discovers fixtures from multiple directories", () => {
    writeJsonFixture(dir1, "fixture_from_dir1", 2);
    writeJsonFixture(dir2, "fixture_from_dir2", 3);

    const result = discoverFixtures([dir1, dir2]);
    expect(result).toHaveLength(2);
    const names = result.map((e) => e.name).sort();
    expect(names).toEqual(["fixture_from_dir1", "fixture_from_dir2"]);
  });

  it("deduplicates fixtures with the same name across directories", () => {
    writeJsonFixture(dir1, "shared_fixture", 2);
    writeJsonFixture(dir2, "shared_fixture", 4); // Same name, different step count

    const result = discoverFixtures([dir1, dir2]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("shared_fixture");
    // First directory wins
    expect(result[0].case_count).toBe(2);
  });

  it("returns absolute file paths", () => {
    writeJsonFixture(dir1, "fixture_a", 1);
    const result = discoverFixtures([dir1]);
    expect(result).toHaveLength(1);
    expect(path.isAbsolute(result[0].path)).toBe(true);
  });
});

describe("publishFixture", () => {
  let tmpDir: string;
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-fixture-test-"));
    srcDir = path.join(tmpDir, "src");
    destDir = path.join(tmpDir, "dest");
    fs.mkdirSync(srcDir);
    // destDir does NOT exist yet — publishFixture should create it
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies a fixture file to the destination directory", () => {
    const fixture = { name: "my_fixture", steps: [{ id: "s1", tool: "t", input: {} }] };
    const srcFile = path.join(srcDir, "my_fixture.json");
    fs.writeFileSync(srcFile, JSON.stringify(fixture));

    publishFixture(srcFile, destDir);

    const destFile = path.join(destDir, "my_fixture.json");
    expect(fs.existsSync(destFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(destFile, "utf-8")) as typeof fixture;
    expect(content.name).toBe("my_fixture");
  });

  it("creates the destination directory if it does not exist", () => {
    const fixture = { name: "test", steps: [] };
    const srcFile = path.join(srcDir, "test.json");
    fs.writeFileSync(srcFile, JSON.stringify(fixture));

    const nestedDest = path.join(destDir, "nested", "dir");
    publishFixture(srcFile, nestedDest);

    expect(fs.existsSync(nestedDest)).toBe(true);
  });

  it("publishes a fixture object as JSON to the destination", () => {
    const fixture = { name: "obj_fixture", steps: [{ id: "s1", tool: "t", input: {} }] };
    publishFixture(fixture, destDir);

    const destFile = path.join(destDir, "obj_fixture.json");
    expect(fs.existsSync(destFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(destFile, "utf-8")) as typeof fixture;
    expect(parsed.name).toBe("obj_fixture");
  });

  it("throws when source file path does not exist", () => {
    expect(() => publishFixture("/nonexistent/fixture.json", destDir)).toThrow(
      "Fixture file not found",
    );
  });

  it("throws for invalid fixture value", () => {
    expect(() => publishFixture(42, destDir)).toThrow("Invalid fixture");
  });
});
