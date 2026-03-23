import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:sqlite before any imports that depend on it
vi.mock("node:sqlite", () => {
  class MockStatementSync {
    private sql: string;
    private db: MockDatabaseSync;
    constructor(db: MockDatabaseSync, sql: string) {
      this.db = db;
      this.sql = sql;
    }
    run(...args: unknown[]) {
      this.db._exec(this.sql, args);
    }
    get(...args: unknown[]) {
      return this.db._query(this.sql, args, true);
    }
    all(...args: unknown[]) {
      return this.db._query(this.sql, args, false);
    }
  }

  class MockDatabaseSync {
    private tables: Record<string, Record<string, unknown>[]> = {};
    _exec(sql: string, params: unknown[]) {
      const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (createMatch) {
        if (!this.tables[createMatch[1]]) this.tables[createMatch[1]] = [];
        return;
      }
      const insertMatch = sql.match(/INSERT INTO (\w+)/i);
      if (insertMatch) {
        const tableName = insertMatch[1];
        if (!this.tables[tableName]) this.tables[tableName] = [];
        const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        if (colMatch) {
          const cols = colMatch[1].split(",").map((c) => c.trim());
          const row: Record<string, unknown> = {};
          cols.forEach((col, i) => {
            row[col] = params[i];
          });
          this.tables[tableName].push(row);
        }
        return;
      }
      const updateMatch = sql.match(/UPDATE (\w+) SET (.+) WHERE (\w+) = \?/i);
      if (updateMatch) {
        const tableName = updateMatch[1];
        const setClause = updateMatch[2];
        const whereCol = updateMatch[3];
        const setCols = setClause.split(",").map((c) => c.trim().split(" = ")[0]);
        const whereVal = params[params.length - 1];
        const setVals = params.slice(0, params.length - 1);
        if (this.tables[tableName]) {
          this.tables[tableName].forEach((row) => {
            if (row[whereCol] === whereVal) {
              setCols.forEach((col, i) => {
                row[col] = setVals[i];
              });
            }
          });
        }
        return;
      }
    }
    _query(sql: string, params: unknown[], single: boolean) {
      const tableMatch = sql.match(/FROM (\w+)/i);
      if (!tableMatch) return single ? undefined : [];
      const tableName = tableMatch[1];
      let rows = (this.tables[tableName] ?? []).slice();
      const whereMatch = sql.match(/WHERE (\w+) = \?/i);
      if (whereMatch) {
        const col = whereMatch[1];
        rows = rows.filter((r) => r[col] === params[0]);
      }
      const orderMatch = sql.match(/ORDER BY (\w+) (ASC|DESC)/i);
      if (orderMatch) {
        const col = orderMatch[1];
        const dir = orderMatch[2].toUpperCase();
        rows = rows.sort((a, b) => {
          const av = a[col] as number;
          const bv = b[col] as number;
          return dir === "DESC" ? bv - av : av - bv;
        });
      }
      const limitMatch = sql.match(/LIMIT \?/i);
      if (limitMatch) {
        rows = rows.slice(0, params[params.length - 1] as number);
      }
      return single ? rows[0] : rows;
    }
    exec(sql: string) {
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) this._exec(stmt, []);
    }
    prepare(sql: string) {
      return new MockStatementSync(this, sql);
    }
    close() {}
  }
  return { DatabaseSync: MockDatabaseSync };
});

import { createServer, startServer, isCancelled } from "../src/server.js";
import type { ServerOptions } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "fs";
import path from "path";
import os from "os";

function makeOpts(fixturesDir: string): ServerOptions {
  return {
    fixturesDir,
    dbPath: path.join(os.tmpdir(), `server-test-${Date.now()}-${Math.random()}.db`),
    timeoutMs: 5000,
    format: "console",
    watch: false,
  };
}

async function createTestPair(
  fixturesDir: string,
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const mcpServer = await createServer(makeOpts(fixturesDir));
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await mcpServer.close();
    },
  };
}

describe("isCancelled", () => {
  it("returns false for an unknown request ID", () => {
    expect(isCancelled("nonexistent-id")).toBe(false);
  });
});

describe("createServer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "server-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an McpServer instance", async () => {
    const server = await createServer(makeOpts(tmpDir));
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
    expect(typeof server.close).toBe("function");
  });

  it("exposes a .server property with notification method", async () => {
    const server = await createServer(makeOpts(tmpDir));
    expect(server.server).toBeDefined();
    expect(typeof server.server.notification).toBe("function");
  });
});

describe("MCP tools via InMemoryTransport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "server-tools-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("run_suite tool returns no-fixtures message for empty dir", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({ name: "run_suite", arguments: {} });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("No fixtures found");
    } finally {
      await cleanup();
    }
  });

  it("run_suite tool works with fixture in dir", async () => {
    const fixtureContent =
      "name: server_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: hello\n    expect:\n      output_contains: hello\n";
    fs.writeFileSync(path.join(tmpDir, "server_test.yaml"), fixtureContent);

    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({ name: "run_suite", arguments: {} });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("server_test");
    } finally {
      await cleanup();
    }
  });

  it("run_case tool returns error for empty name param", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({ name: "run_case", arguments: { name: "" } });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("Error");
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("run_case tool returns error for non-existent fixture", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "run_case",
        arguments: { name: "no_such_fixture" },
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("run_case tool runs a named fixture successfully", async () => {
    const fixtureContent =
      "name: named_case\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "named_case.yaml"), fixtureContent);

    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "run_case",
        arguments: { name: "named_case" },
      });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("named_case");
    } finally {
      await cleanup();
    }
  });

  it("list_cases tool returns fixtures list", async () => {
    const fixtureContent =
      "name: list_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "list_test.yaml"), fixtureContent);

    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({ name: "list_cases", arguments: {} });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("list_test");
    } finally {
      await cleanup();
    }
  });

  it("create_test_case tool returns error for empty name", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "create_test_case",
        arguments: { name: "", steps: [{ id: "s1", tool: "t", input: {} }] },
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("create_test_case tool returns error for empty steps", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "create_test_case",
        arguments: { name: "my_test", steps: [] },
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("create_test_case tool creates a fixture", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "create_test_case",
        arguments: { name: "new_fixture", steps: [{ id: "s1", tool: "my_tool", input: {} }] },
      });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("Created fixture");
    } finally {
      await cleanup();
    }
  });

  it("regression_report tool returns no history message", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({ name: "regression_report", arguments: {} });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("No run history found");
    } finally {
      await cleanup();
    }
  });

  it("compare_results tool returns error for missing run IDs", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "compare_results",
        arguments: { run_id_a: "missing-a", run_id_b: "missing-b" },
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("generate_html_report tool returns error for missing run ID", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "generate_html_report",
        arguments: { run_id: "nonexistent" },
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("scaffold_fixture tool creates a fixture file", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "scaffold_fixture",
        arguments: { name: "scaffold_test", tool_names: ["search", "summarize"] },
      });
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain("scaffold_test");
    } finally {
      await cleanup();
    }
  });

  it("scaffold_fixture tool returns error for empty name", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.callTool({
        name: "scaffold_fixture",
        arguments: { name: "", tool_names: ["t"] },
      });
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("resources/list returns fixture resources", async () => {
    const fixtureContent =
      "name: resource_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "resource_test.yaml"), fixtureContent);

    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.listResources();
      expect(result.resources.some((r) => r.name === "resource_test")).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("resources/read returns fixture content", async () => {
    const fixtureContent =
      "name: read_test\nsteps:\n  - id: s1\n    tool: my_tool\n    expected_output: ok\n";
    fs.writeFileSync(path.join(tmpDir, "read_test.yaml"), fixtureContent);

    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.readResource({ uri: "eval://read_test" });
      const text = (result.contents[0] as { text: string }).text;
      expect(text).toContain("read_test");
    } finally {
      await cleanup();
    }
  });

  it("resources/read throws for unknown fixture", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      await expect(client.readResource({ uri: "eval://nonexistent_fixture" })).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it("prompts/get returns write-test-case prompt content", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.getPrompt({
        name: "write-test-case",
        arguments: { fixture_description: "search for items" },
      });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("search for items");
    } finally {
      await cleanup();
    }
  });

  it("prompts/get with tool_names includes them in the prompt", async () => {
    const { client, cleanup } = await createTestPair(tmpDir);
    try {
      const result = await client.getPrompt({
        name: "write-test-case",
        arguments: { fixture_description: "test search", tool_names: "search,summarize" },
      });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("search");
      expect(text).toContain("summarize");
    } finally {
      await cleanup();
    }
  });
});

describe("startServer", () => {
  it("startServer is a function", () => {
    expect(typeof startServer).toBe("function");
  });
});
