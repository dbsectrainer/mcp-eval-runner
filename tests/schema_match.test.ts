import { describe, it, expect } from "vitest";
import { evaluateAssertion, type Assertion, type StepResult } from "../src/assertions.js";

function makeResult(output: string): StepResult {
  return { tool: "my_tool", output, latency_ms: 10 };
}

describe("schema_match assertion", () => {
  describe("type validation", () => {
    it("passes when output is valid JSON matching { type: 'object' }", () => {
      const assertion: Assertion = { schema_match: { type: "object" } };
      const results = evaluateAssertion(assertion, makeResult('{"key": "value"}'));
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("schema_match");
      expect(results[0].passed).toBe(true);
    });

    it("fails when output is a string but schema expects object", () => {
      const assertion: Assertion = { schema_match: { type: "object" } };
      const results = evaluateAssertion(assertion, makeResult('"a string"'));
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain("expected type");
    });

    it("passes for { type: 'array' } with a JSON array", () => {
      const assertion: Assertion = { schema_match: { type: "array" } };
      const results = evaluateAssertion(assertion, makeResult("[1,2,3]"));
      expect(results[0].passed).toBe(true);
    });

    it("fails for { type: 'array' } with a JSON object", () => {
      const assertion: Assertion = { schema_match: { type: "array" } };
      const results = evaluateAssertion(assertion, makeResult("{}"));
      expect(results[0].passed).toBe(false);
    });

    it("passes for { type: 'string' } with a JSON string", () => {
      const assertion: Assertion = { schema_match: { type: "string" } };
      const results = evaluateAssertion(assertion, makeResult('"hello"'));
      expect(results[0].passed).toBe(true);
    });

    it("passes for { type: 'number' } with a JSON number", () => {
      const assertion: Assertion = { schema_match: { type: "number" } };
      const results = evaluateAssertion(assertion, makeResult("42"));
      expect(results[0].passed).toBe(true);
    });

    it("passes for { type: 'boolean' } with a JSON boolean", () => {
      const assertion: Assertion = { schema_match: { type: "boolean" } };
      const results = evaluateAssertion(assertion, makeResult("true"));
      expect(results[0].passed).toBe(true);
    });
  });

  describe("required properties", () => {
    it("passes when all required properties are present", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "object",
          required: ["name", "age"],
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"name": "Alice", "age": 30}'));
      expect(results[0].passed).toBe(true);
    });

    it("fails when a required property is missing", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "object",
          required: ["name", "age"],
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"name": "Alice"}'));
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain("missing required property");
      expect(results[0].message).toContain("age");
    });
  });

  describe("property type validation", () => {
    it("passes when nested property types match", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "object",
          properties: {
            count: { type: "number" },
            label: { type: "string" },
          },
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"count": 5, "label": "items"}'));
      expect(results[0].passed).toBe(true);
    });

    it("fails when a nested property has wrong type", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "object",
          properties: {
            count: { type: "number" },
          },
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"count": "five"}'));
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain("count");
    });
  });

  describe("additionalProperties: false", () => {
    it("passes when no extra properties are present", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "object",
          properties: { id: { type: "number" } },
          additionalProperties: false,
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"id": 1}'));
      expect(results[0].passed).toBe(true);
    });

    it("fails when extra properties are present", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "object",
          properties: { id: { type: "number" } },
          additionalProperties: false,
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"id": 1, "extra": "value"}'));
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain("unexpected additional property");
    });
  });

  describe("array items validation", () => {
    it("passes when all array items match the items schema", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "array",
          items: { type: "number" },
        },
      };
      const results = evaluateAssertion(assertion, makeResult("[1, 2, 3]"));
      expect(results[0].passed).toBe(true);
    });

    it("fails when an array item has the wrong type", () => {
      const assertion: Assertion = {
        schema_match: {
          type: "array",
          items: { type: "number" },
        },
      };
      const results = evaluateAssertion(assertion, makeResult('[1, "two", 3]'));
      expect(results[0].passed).toBe(false);
    });
  });

  describe("invalid JSON handling", () => {
    it("fails with a parse error message when output is not valid JSON", () => {
      const assertion: Assertion = { schema_match: { type: "object" } };
      const results = evaluateAssertion(assertion, makeResult("not json at all"));
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain("not valid JSON");
    });

    it("fails with a parse error for truncated JSON", () => {
      const assertion: Assertion = { schema_match: { type: "object" } };
      const results = evaluateAssertion(assertion, makeResult('{"key":'));
      expect(results[0].passed).toBe(false);
    });
  });

  describe("combined with other assertions", () => {
    it("evaluates schema_match alongside output_contains", () => {
      const assertion: Assertion = {
        output_contains: "Alice",
        schema_match: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      };
      const results = evaluateAssertion(assertion, makeResult('{"name": "Alice"}'));
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.passed)).toBe(true);
    });
  });
});
