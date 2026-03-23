import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { listCasesTool, createTestCaseTool } from "../src/tools/manage.js";

describe("listCasesTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manage-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a message when no fixtures found", () => {
    const result = listCasesTool(tmpDir);
    expect(result).toContain("No fixtures found");
  });

  it("lists fixtures with step counts", () => {
    const fixture = {
      name: "my_test",
      description: "A test fixture",
      steps: [
        { id: "s1", tool: "tool_a", input: {} },
        { id: "s2", tool: "tool_b", input: {} },
      ],
    };
    const content = `name: ${fixture.name}\ndescription: ${fixture.description}\nsteps:\n  - id: s1\n    tool: tool_a\n  - id: s2\n    tool: tool_b\n`;
    fs.writeFileSync(path.join(tmpDir, "my_test.yaml"), content);

    const result = listCasesTool(tmpDir);
    expect(result).toContain("my_test");
    expect(result).toContain("2 step(s)");
    expect(result).toContain("tool_a");
    expect(result).toContain("tool_b");
  });

  it("includes fixture description when available", () => {
    const content =
      "name: described_test\ndescription: A helpful description\nsteps:\n  - id: s1\n    tool: t\n";
    fs.writeFileSync(path.join(tmpDir, "described.yaml"), content);

    const result = listCasesTool(tmpDir);
    expect(result).toContain("A helpful description");
  });

  it("handles step with description", () => {
    const content =
      "name: step_desc_test\nsteps:\n  - id: s1\n    tool: t\n    description: My step description\n";
    fs.writeFileSync(path.join(tmpDir, "step_desc.yaml"), content);

    const result = listCasesTool(tmpDir);
    expect(result).toContain("My step description");
  });

  it("returns fixture count in header", () => {
    fs.writeFileSync(
      path.join(tmpDir, "a.yaml"),
      "name: fixture_a\nsteps:\n  - id: s1\n    tool: t\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "b.yaml"),
      "name: fixture_b\nsteps:\n  - id: s1\n    tool: t\n",
    );

    const result = listCasesTool(tmpDir);
    expect(result).toContain("2 fixture(s)");
  });
});

describe("createTestCaseTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a fixture file and returns success message", () => {
    const steps = [{ id: "s1", tool: "my_tool", input: {} }];
    const result = createTestCaseTool("new_fixture", steps, tmpDir);
    expect(result).toContain("Created fixture:");
    expect(result).toContain("new_fixture");
  });

  it("the created file exists on disk", () => {
    const steps = [{ id: "s1", tool: "my_tool", input: {} }];
    createTestCaseTool("file_test", steps, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "file_test.yaml"))).toBe(true);
  });

  it("throws on invalid fixture name", () => {
    expect(() => createTestCaseTool("", [{ id: "s1", tool: "t", input: {} }], tmpDir)).toThrow();
  });

  it("throws on invalid fixture steps (non-array)", () => {
    expect(() => createTestCaseTool("valid", [{ id: "", tool: "" }] as never, tmpDir)).toThrow();
  });

  it("includes step count in returned message", () => {
    const steps = [
      { id: "s1", tool: "tool_a", input: {} },
      { id: "s2", tool: "tool_b", input: {} },
    ];
    const result = createTestCaseTool("multi_step", steps, tmpDir);
    expect(result).toContain("Steps: 2");
  });
});
