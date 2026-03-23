/**
 * Sliding window in-memory rate limiter middleware for mcp-eval-runner.
 * Tracks requests per IP address or API key (X-API-Key header).
 * Returns 429 Too Many Requests when the limit is exceeded.
 */
import type { RequestHandler } from "express";
/**
 * Create a sliding window rate limiter Express middleware.
 *
 * @param maxRequests - Maximum number of requests allowed per window (default: 60)
 * @param windowMs - Window duration in milliseconds (default: 60000 = 60s)
 */
export declare function createRateLimiter(maxRequests?: number, windowMs?: number): RequestHandler;
