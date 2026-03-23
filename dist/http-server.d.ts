/**
 * Streamable HTTP transport server for mcp-eval-runner.
 * Starts an Express HTTP server that handles MCP requests via
 * the StreamableHTTPServerTransport in stateless mode.
 */
import type { ServerOptions } from "./server.js";
export declare function startHttpServer(port: number, opts: ServerOptions): Promise<void>;
