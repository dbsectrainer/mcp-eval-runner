/**
 * Authentication middleware for mcp-eval-runner HTTP server.
 * Supports X-API-Key header validation and HMAC-SHA256 JWT Bearer token validation.
 * Pass-through when neither MCP_API_KEY nor MCP_JWT_SECRET env vars are set.
 */
import type { RequestHandler } from "express";
/**
 * Create Express authentication middleware.
 *
 * Behavior:
 * - If MCP_API_KEY is set, validates X-API-Key header; returns 401 if missing or mismatched.
 * - If MCP_JWT_SECRET is set, validates Authorization: Bearer <token> as HMAC-SHA256 JWT.
 * - If neither env var is set, passes through all requests.
 */
export declare function createAuthMiddleware(): RequestHandler;
