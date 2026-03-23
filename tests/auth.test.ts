/**
 * Tests for src/auth.ts — API key validation, JWT validation, pass-through.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

// We test the auth middleware by calling it with mock req/res/next objects.
import { createAuthMiddleware } from "../src/auth.js";
import type { Request, Response, NextFunction } from "express";

function makeMockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

interface MockResContext {
  res: Response;
  statusCode: number | undefined;
  body: unknown;
}

function makeMockRes(): MockResContext {
  const ctx: MockResContext = {
    res: null as unknown as Response,
    statusCode: undefined,
    body: undefined,
  };
  const res = {
    status(code: number) {
      ctx.statusCode = code;
      return res;
    },
    json(data: unknown) {
      ctx.body = data;
      return res;
    },
  } as unknown as Response;
  ctx.res = res;
  return ctx;
}

// Helper to generate a valid HMAC-SHA256 JWT
function makeJwt(secret: string, payload: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${header}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${header}.${payloadB64}.${sig}`;
}

describe("createAuthMiddleware — pass-through when no env vars", () => {
  beforeEach(() => {
    delete process.env.MCP_API_KEY;
    delete process.env.MCP_JWT_SECRET;
  });

  it("calls next() without any auth headers", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq();
    const { res } = makeMockRes();
    const next = vi.fn();
    middleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() even with incorrect headers", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq({ "x-api-key": "wrong" });
    const { res } = makeMockRes();
    const next = vi.fn();
    middleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("createAuthMiddleware — API key validation", () => {
  const VALID_KEY = "test-secret-key-123";

  beforeEach(() => {
    process.env.MCP_API_KEY = VALID_KEY;
    delete process.env.MCP_JWT_SECRET;
  });

  afterEach(() => {
    delete process.env.MCP_API_KEY;
  });

  it("calls next() when X-API-Key matches", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq({ "x-api-key": VALID_KEY });
    const { res } = makeMockRes();
    const next = vi.fn();
    middleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when X-API-Key is missing", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq();
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when X-API-Key is wrong", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq({ "x-api-key": "wrong-key" });
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("createAuthMiddleware — JWT validation", () => {
  const JWT_SECRET = "super-secret-jwt-key";

  beforeEach(() => {
    delete process.env.MCP_API_KEY;
    process.env.MCP_JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    delete process.env.MCP_JWT_SECRET;
  });

  it("calls next() with a valid JWT", () => {
    const middleware = createAuthMiddleware();
    const token = makeJwt(JWT_SECRET, { sub: "user123" });
    const req = makeMockReq({ authorization: `Bearer ${token}` });
    const { res } = makeMockRes();
    const next = vi.fn();
    middleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when Authorization header is missing", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq();
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when JWT signature is invalid", () => {
    const middleware = createAuthMiddleware();
    const token = makeJwt("wrong-secret", { sub: "attacker" });
    const req = makeMockReq({ authorization: `Bearer ${token}` });
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when JWT has wrong number of parts", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq({ authorization: "Bearer notavalidjwt" });
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is not Bearer", () => {
    const middleware = createAuthMiddleware();
    const req = makeMockReq({ authorization: "Basic dXNlcjpwYXNz" });
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("createAuthMiddleware — both API key and JWT configured", () => {
  const VALID_KEY = "api-key-abc";
  const JWT_SECRET = "jwt-secret-xyz";

  beforeEach(() => {
    process.env.MCP_API_KEY = VALID_KEY;
    process.env.MCP_JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    delete process.env.MCP_API_KEY;
    delete process.env.MCP_JWT_SECRET;
  });

  it("calls next() when both API key and JWT are valid", () => {
    const middleware = createAuthMiddleware();
    const token = makeJwt(JWT_SECRET);
    const req = makeMockReq({
      "x-api-key": VALID_KEY,
      authorization: `Bearer ${token}`,
    });
    const { res } = makeMockRes();
    const next = vi.fn();
    middleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when API key is wrong even if JWT is valid", () => {
    const middleware = createAuthMiddleware();
    const token = makeJwt(JWT_SECRET);
    const req = makeMockReq({
      "x-api-key": "bad-key",
      authorization: `Bearer ${token}`,
    });
    const mock = makeMockRes();
    const next = vi.fn();
    middleware(req, mock.res, next as NextFunction);
    expect(mock.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
