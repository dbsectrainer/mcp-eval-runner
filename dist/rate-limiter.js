/**
 * Sliding window in-memory rate limiter middleware for mcp-eval-runner.
 * Tracks requests per IP address or API key (X-API-Key header).
 * Returns 429 Too Many Requests when the limit is exceeded.
 */
/**
 * Create a sliding window rate limiter Express middleware.
 *
 * @param maxRequests - Maximum number of requests allowed per window (default: 60)
 * @param windowMs - Window duration in milliseconds (default: 60000 = 60s)
 */
export function createRateLimiter(maxRequests = 60, windowMs = 60000) {
    const store = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const windowStart = now - windowMs;
        // Identify the client by API key or IP address
        const apiKey = req.headers["x-api-key"];
        const clientKey = (Array.isArray(apiKey) ? apiKey[0] : apiKey) ?? req.ip ?? "unknown";
        // Get or create the window entry for this client
        let entry = store.get(clientKey);
        if (!entry) {
            entry = { timestamps: [] };
            store.set(clientKey, entry);
        }
        // Prune timestamps outside the current window
        entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
        if (entry.timestamps.length >= maxRequests) {
            res.status(429).json({ error: "Too Many Requests: rate limit exceeded" });
            return;
        }
        // Record this request
        entry.timestamps.push(now);
        next();
    };
}
