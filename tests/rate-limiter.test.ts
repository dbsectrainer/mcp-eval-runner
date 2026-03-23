/**
 * Tests for src/rate-limiter.ts — sliding window rate limiting, 429 responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRateLimiter } from "../src/rate-limiter.js";
import type { Request, Response, NextFunction } from "express";

function makeMockReq(ip: string, apiKey?: string): Request {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return { ip, headers } as unknown as Request;
}

function makeMockRes(): {
  res: Response;
  getStatusCode: () => number | undefined;
  getBody: () => unknown;
} {
  let statusCode: number | undefined;
  let body: unknown;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
  } as unknown as Response;

  return {
    res,
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests up to the limit", () => {
    const middleware = createRateLimiter(3, 60000);
    const req = makeMockReq("1.2.3.4");
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const { res } = makeMockRes();
      middleware(req, res, next as NextFunction);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("returns 429 when limit is exceeded", () => {
    const middleware = createRateLimiter(2, 60000);
    const req = makeMockReq("1.2.3.4");
    const next = vi.fn();

    // First two should pass
    for (let i = 0; i < 2; i++) {
      const { res } = makeMockRes();
      middleware(req, res, next as NextFunction);
    }

    // Third should be rate-limited
    const mock = makeMockRes();
    middleware(req, mock.res, next as NextFunction);

    expect(mock.getStatusCode()).toBe(429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("tracks different IPs separately", () => {
    const middleware = createRateLimiter(1, 60000);
    const next = vi.fn();

    const req1 = makeMockReq("1.1.1.1");
    const req2 = makeMockReq("2.2.2.2");

    const { res: res1 } = makeMockRes();
    middleware(req1, res1, next as NextFunction);

    const { res: res2 } = makeMockRes();
    middleware(req2, res2, next as NextFunction);

    // Both should pass since they are different IPs
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("tracks by API key when X-API-Key header is present", () => {
    const middleware = createRateLimiter(1, 60000);
    const next = vi.fn();

    // Two requests with the same API key but different IPs
    const req1 = makeMockReq("1.1.1.1", "my-key");
    const req2 = makeMockReq("2.2.2.2", "my-key");

    const { res: res1 } = makeMockRes();
    middleware(req1, res1, next as NextFunction);

    const mock2 = makeMockRes();
    middleware(req2, mock2.res, next as NextFunction);

    // Second request with same key should be rate-limited
    expect(mock2.getStatusCode()).toBe(429);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("resets the window after windowMs elapses", () => {
    const middleware = createRateLimiter(2, 1000);
    const req = makeMockReq("5.5.5.5");
    const next = vi.fn();

    // Exhaust the limit
    for (let i = 0; i < 2; i++) {
      const { res } = makeMockRes();
      middleware(req, res, next as NextFunction);
    }

    // Advance time past the window
    vi.advanceTimersByTime(1001);

    // Should be allowed again
    const { res } = makeMockRes();
    middleware(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("uses default limits of 60 req / 60s", () => {
    // Just verify the middleware is created without errors using defaults
    const middleware = createRateLimiter();
    expect(typeof middleware).toBe("function");
  });
});
