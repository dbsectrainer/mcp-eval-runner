/**
 * LLM-as-judge assertion for mcp-eval-runner.
 * Calls an external LLM API via HTTP POST to score semantic similarity
 * between actual and expected outputs.
 *
 * Credentials: LLM_JUDGE_API_KEY + LLM_JUDGE_BASE_URL env vars.
 * Assertion type: llm_judge with prompt_template, min_score, model fields.
 */
import https from "https";
import http from "http";
/**
 * Make an HTTP/HTTPS POST request and return the parsed JSON response.
 */
function httpPost(url, body, headers) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === "https:";
        const transport = isHttps ? https : http;
        const bodyStr = JSON.stringify(body);
        const reqHeaders = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr).toString(),
            ...headers,
        };
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + (parsed.search || ""),
            method: "POST",
            headers: reqHeaders,
        };
        const req = transport.request(options, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                try {
                    const text = Buffer.concat(chunks).toString("utf-8");
                    resolve(JSON.parse(text));
                }
                catch (err) {
                    reject(new Error(`Failed to parse LLM API response: ${err}`));
                }
            });
        });
        req.on("error", reject);
        req.write(bodyStr);
        req.end();
    });
}
/**
 * Run an LLM-as-judge assertion.
 *
 * Renders the prompt template with {actual} and {expected} placeholders,
 * calls the LLM API, and extracts a score from the response (0.0–1.0).
 * Expects the LLM to respond with a JSON object containing a "score" field,
 * or a plain number.
 */
export async function runLlmJudge(assertion, actual, expected) {
    const apiKey = process.env.LLM_JUDGE_API_KEY;
    const baseUrl = process.env.LLM_JUDGE_BASE_URL;
    if (!apiKey || !baseUrl) {
        return {
            type: "llm_judge",
            passed: false,
            message: "LLM judge not configured: missing LLM_JUDGE_API_KEY or LLM_JUDGE_BASE_URL env vars",
        };
    }
    // Render the prompt template
    const prompt = assertion.prompt_template
        .replace(/\{actual\}/g, actual)
        .replace(/\{expected\}/g, expected);
    const requestBody = {
        model: assertion.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
    };
    const endpoint = baseUrl.replace(/\/$/, "") + "/chat/completions";
    let response;
    try {
        response = await httpPost(endpoint, requestBody, {
            Authorization: `Bearer ${apiKey}`,
        });
    }
    catch (err) {
        return {
            type: "llm_judge",
            passed: false,
            message: `LLM judge HTTP error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    if (response.error) {
        return {
            type: "llm_judge",
            passed: false,
            message: `LLM judge API error: ${response.error.message}`,
        };
    }
    const content = response.choices?.[0]?.message?.content ?? "";
    let score;
    // Try parsing as JSON with a "score" field first
    try {
        // Extract JSON from the response if it's embedded in text
        const jsonMatch = content.match(/\{[^}]*"score"\s*:\s*([0-9.]+)[^}]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed.score === "number") {
                score = parsed.score;
            }
        }
    }
    catch {
        // fall through to numeric parsing
    }
    // Try parsing the entire content as a plain number
    if (score === undefined) {
        const trimmed = content.trim();
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
            score = num;
        }
    }
    if (score === undefined) {
        return {
            type: "llm_judge",
            passed: false,
            message: `LLM judge could not extract a score from response: "${content}"`,
        };
    }
    // Clamp score to [0, 1]
    const clampedScore = Math.max(0, Math.min(1, score));
    const passed = clampedScore >= assertion.min_score;
    return {
        type: "llm_judge",
        passed,
        message: passed
            ? `LLM judge score ${clampedScore.toFixed(3)} >= threshold ${assertion.min_score}`
            : `LLM judge score ${clampedScore.toFixed(3)} < threshold ${assertion.min_score}`,
    };
}
