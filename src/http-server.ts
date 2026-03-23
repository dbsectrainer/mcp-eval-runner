/**
 * Streamable HTTP transport server for mcp-eval-runner.
 * Starts an Express HTTP server that handles MCP requests via
 * the StreamableHTTPServerTransport in stateless mode.
 */

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import type { ServerOptions } from "./server.js";
import { createAuthMiddleware } from "./auth.js";
import { createRateLimiter } from "./rate-limiter.js";

export async function startHttpServer(port: number, opts: ServerOptions): Promise<void> {
  const app = express();
  app.use(express.json());

  const server = await createServer(opts);

  // Apply auth and rate limiting before /mcp route
  app.use("/mcp", createAuthMiddleware());
  app.use("/mcp", createRateLimiter(60, 60000));

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });

  app.listen(port, () => {
    console.error(`MCP Eval Runner HTTP server listening on port ${port}`);
  });
}
