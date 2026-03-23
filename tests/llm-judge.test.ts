/**
 * Tests for src/llm-judge.ts — LLM-as-judge assertion with mocked https.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Node's https module before importing llm-judge
vi.mock("https", () => {
  return {
    default: {
      request: vi.fn(),
    },
    request: vi.fn(),
  };
});

vi.mock("http", () => {
  return {
    default: {
      request: vi.fn(),
    },
    request: vi.fn(),
  };
});

import { runLlmJudge } from "../src/llm-judge.js";
import https from "https";
import type { LlmJudgeAssertion } from "../src/llm-judge.js";

const mockHttpsRequest = vi.mocked(https.request);

function mockLlmResponse(content: string, statusCode = 200): void {
  const mockResponse = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "data") {
        cb(
          Buffer.from(
            JSON.stringify({
              choices: [{ message: { content } }],
            }),
          ),
        );
      }
      if (event === "end") {
        cb();
      }
      return mockResponse;
    }),
    statusCode,
  };

  const mockReq = {
    on: vi.fn().mockReturnThis(),
    write: vi.fn(),
    end: vi.fn(),
  };

  mockHttpsRequest.mockImplementationOnce((_options: unknown, callback: unknown) => {
    (callback as (res: typeof mockResponse) => void)(mockResponse);
    return mockReq as unknown as ReturnType<typeof https.request>;
  });
}

function mockLlmError(error: Error): void {
  const mockReq = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "error") {
        cb(error);
      }
      return mockReq;
    }),
    write: vi.fn(),
    end: vi.fn(),
  };

  mockHttpsRequest.mockImplementationOnce(
    () => mockReq as unknown as ReturnType<typeof https.request>,
  );
}

const ASSERTION: LlmJudgeAssertion = {
  prompt_template:
    "Score similarity between actual: {actual} and expected: {expected}. Return JSON {score: 0.9}",
  min_score: 0.7,
  model: "gpt-4o-mini",
};

describe("runLlmJudge — env var checks", () => {
  beforeEach(() => {
    delete process.env.LLM_JUDGE_API_KEY;
    delete process.env.LLM_JUDGE_BASE_URL;
  });

  it("returns failed result when env vars are not set", async () => {
    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.type).toBe("llm_judge");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not configured");
  });

  it("returns failed result when only API key is set", async () => {
    process.env.LLM_JUDGE_API_KEY = "test-key";
    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.passed).toBe(false);
    delete process.env.LLM_JUDGE_API_KEY;
  });
});

describe("runLlmJudge — score extraction and validation", () => {
  beforeEach(() => {
    process.env.LLM_JUDGE_API_KEY = "test-api-key";
    process.env.LLM_JUDGE_BASE_URL = "https://api.example.com";
    mockHttpsRequest.mockReset();
  });

  afterEach(() => {
    delete process.env.LLM_JUDGE_API_KEY;
    delete process.env.LLM_JUDGE_BASE_URL;
  });

  it("returns passed: true when LLM score meets threshold", async () => {
    mockLlmResponse('{"score": 0.9}');
    const result = await runLlmJudge(ASSERTION, "hello world", "hello world");
    expect(result.type).toBe("llm_judge");
    expect(result.passed).toBe(true);
    expect(result.message).toContain("0.900");
  });

  it("returns passed: false when LLM score is below threshold", async () => {
    mockLlmResponse('{"score": 0.5}');
    const result = await runLlmJudge(ASSERTION, "apple", "orange");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("0.500");
  });

  it("parses a plain numeric response", async () => {
    mockLlmResponse("0.85");
    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.passed).toBe(true);
    expect(result.message).toContain("0.850");
  });

  it("passes at exact threshold boundary", async () => {
    mockLlmResponse('{"score": 0.7}');
    const result = await runLlmJudge(ASSERTION, "a", "b");
    expect(result.passed).toBe(true); // 0.7 >= 0.7
  });

  it("returns failed when response cannot be parsed as a score", async () => {
    mockLlmResponse("I cannot determine a score.");
    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("could not extract a score");
  });

  it("returns failed on HTTP error", async () => {
    mockLlmError(new Error("Connection refused"));
    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("HTTP error");
    expect(result.message).toContain("Connection refused");
  });

  it("returns failed when API returns an error object", async () => {
    const mockResponse = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "data") {
          cb(Buffer.from(JSON.stringify({ error: { message: "Model not found" } })));
        }
        if (event === "end") cb();
        return mockResponse;
      }),
    };
    const mockReq = { on: vi.fn().mockReturnThis(), write: vi.fn(), end: vi.fn() };
    mockHttpsRequest.mockImplementationOnce((_opts: unknown, cb: unknown) => {
      (cb as (res: typeof mockResponse) => void)(mockResponse);
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Model not found");
  });

  it("clamps score above 1.0 to 1.0", async () => {
    mockLlmResponse("1.5");
    const result = await runLlmJudge(ASSERTION, "actual", "expected");
    expect(result.passed).toBe(true);
    expect(result.message).toContain("1.000");
  });
});
