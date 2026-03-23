import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { scaffoldFixtureTool } from "../src/tools/scaffold.js";

describe("scaffoldFixtureTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a YAML file in the fixtures directory", () => {
    const filePath = scaffoldFixtureTool("my_fixture", ["search", "summarize"], tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath.endsWith(".yaml")).toBe(true);
  });

  it("returns the absolute path to the created file", () => {
    const filePath = scaffoldFixtureTool("path_test", ["tool_a"], tmpDir);
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(filePath).toContain(tmpDir);
  });

  it("file contains the fixture name", () => {
    const filePath = scaffoldFixtureTool("name_test", ["my_tool"], tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("name_test");
  });

  it("file contains each tool name as a step", () => {
    const filePath = scaffoldFixtureTool("tools_test", ["alpha", "beta", "gamma"], tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("alpha");
    expect(content).toContain("beta");
    expect(content).toContain("gamma");
  });

  it("generated YAML includes all supported assertion type comments", () => {
    const filePath = scaffoldFixtureTool("assertions_test", ["my_tool"], tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("output_contains");
    expect(content).toContain("tool_called");
    expect(content).toContain("latency_under");
    expect(content).toContain("schema_match");
  });

  it("creates the fixtures directory if it does not exist", () => {
    const nested = path.join(tmpDir, "nested", "dir");
    expect(fs.existsSync(nested)).toBe(false);
    const filePath = scaffoldFixtureTool("nested_test", ["t"], nested);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("sanitizes fixture name to create a safe filename", () => {
    const filePath = scaffoldFixtureTool("my test/fixture!name", ["t"], tmpDir);
    const filename = path.basename(filePath);
    // Should not contain slashes or exclamation marks in the filename
    expect(filename).not.toContain("/");
    expect(filename).not.toContain("!");
    expect(filename.endsWith(".yaml")).toBe(true);
  });

  it("generates one step per tool name", () => {
    const toolNames = ["tool_one", "tool_two", "tool_three"];
    const filePath = scaffoldFixtureTool("step_count_test", toolNames, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    // Each tool should appear as a step id reference
    expect(content).toContain("step_1_tool_one");
    expect(content).toContain("step_2_tool_two");
    expect(content).toContain("step_3_tool_three");
  });

  it("throws when name is empty", () => {
    expect(() => scaffoldFixtureTool("", ["t"], tmpDir)).toThrow('"name"');
  });

  it("throws when name is only whitespace", () => {
    expect(() => scaffoldFixtureTool("   ", ["t"], tmpDir)).toThrow('"name"');
  });

  it("throws when tool_names is empty", () => {
    expect(() => scaffoldFixtureTool("valid_name", [], tmpDir)).toThrow('"tool_names"');
  });

  it("throws when the fixture file already exists", () => {
    scaffoldFixtureTool("dup_test", ["t"], tmpDir);
    expect(() => scaffoldFixtureTool("dup_test", ["t"], tmpDir)).toThrow("already exists");
  });

  it("generates valid YAML that can be loaded by js-yaml", async () => {
    // Dynamically import js-yaml to validate the output
    const yaml = await import("js-yaml");
    const filePath = scaffoldFixtureTool("yaml_valid", ["my_tool"], tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");

    // This should not throw
    const parsed = yaml.default.load(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe("object");
  });
});
