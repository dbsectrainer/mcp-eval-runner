/**
 * Authentication middleware for mcp-eval-runner HTTP server.
 * Supports X-API-Key header validation and HMAC-SHA256 JWT Bearer token validation.
 * Pass-through when neither MCP_API_KEY nor MCP_JWT_SECRET env vars are set.
 */

import crypto from "crypto";
import type { RequestHandler, Request, Response, NextFunction } from "express";

/**
 * Decode a base64url-encoded string to a UTF-8 string.
 */
function _base64urlDecode(input: string): string {
  // Convert base64url to base64
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * Verify a JWT token using HMAC-SHA256 with the given secret.
 * JWT format: base64url(header).base64url(payload).base64url(signature)
 * Signature = HMAC-SHA256(secret, "header.payload")
 */
function verifyJwt(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  // Compute expected signature
  const expectedSig = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");

  // Constant-time comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    const actualBuf = Buffer.from(signatureB64, "base64url");

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Create Express authentication middleware.
 *
 * Behavior:
 * - If MCP_API_KEY is set, validates X-API-Key header; returns 401 if missing or mismatched.
 * - If MCP_JWT_SECRET is set, validates Authorization: Bearer <token> as HMAC-SHA256 JWT.
 * - If neither env var is set, passes through all requests.
 */
export function createAuthMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = process.env.MCP_API_KEY;
    const jwtSecret = process.env.MCP_JWT_SECRET;

    // If neither auth mechanism is configured, pass through
    if (!apiKey && !jwtSecret) {
      next();
      return;
    }

    // Validate X-API-Key if MCP_API_KEY is set
    if (apiKey) {
      const providedKey = req.headers["x-api-key"];
      if (!providedKey || providedKey !== apiKey) {
        res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
        return;
      }
    }

    // Validate JWT Bearer token if MCP_JWT_SECRET is set
    if (jwtSecret) {
      const authHeader = req.headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: missing Bearer token" });
        return;
      }

      const token = authHeader.slice("Bearer ".length).trim();
      if (!verifyJwt(token, jwtSecret)) {
        res.status(401).json({ error: "Unauthorized: invalid JWT signature" });
        return;
      }
    }

    next();
  };
}
