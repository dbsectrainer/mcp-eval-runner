# Contributing to MCP Eval Runner

Thank you for your interest in contributing to `mcp-eval-runner`!

## Getting Started

```bash
git clone https://github.com/dbsectrainer/mcp-eval-runner.git
cd mcp-eval-runner
npm install
npm test
```

All tests must pass before submitting a pull request. Node.js v22.5.0 or newer is required.

## Project Layout

```
src/
  assertions.ts       # Assertion evaluators (output_contains, schema_match, etc.)
  audit-log.ts        # Append-only JSONL audit trail of every eval run
  auth.ts             # JWT / API-key auth middleware for HTTP transport
  db.ts               # SQLite storage for run history
  deployment-gate.ts  # CI deployment gate — blocks if pass rate falls below threshold
  fixture.ts          # YAML/JSON fixture loading and validation
  fixture-library.ts  # Fixture discovery across multiple directories
  http-server.ts      # Streamable HTTP transport
  index.ts            # CLI entry point
  llm-judge.ts        # LLM-as-judge assertion type
  rate-limiter.ts     # Sliding-window rate limiter for HTTP transport
  reporter.ts         # Console / JSON / HTML result formatter
  runner.ts           # Test execution engine (live mode + simulation mode)
  server.ts           # MCP server: tool, resource, and prompt registration
  tools/
    html_report.ts    # generate_html_report tool
    manage.ts         # list_cases and create_test_case tools
    report.ts         # regression_report and compare_results tools
    run.ts            # run_suite and run_case tools
    scaffold.ts       # scaffold_fixture tool
evals/
  smoke.yaml          # Dogfood smoke fixture (runs in live mode against the eval runner itself)
  reference/          # Reference fixtures for popular MCP servers
tests/                # Vitest unit tests
```

## Fixture Format

Fixtures are YAML files in the `evals/` directory with the following structure:

```yaml
name: example_test
description: "What this test does"

# Optional — include to run in live mode; omit to run in simulation mode
server:
  command: node
  args: ["dist/index.js"]

steps:
  - id: step_1
    description: "Call the tool and check the output"
    tool: list_cases
    input: {}
    expected_output: "No fixtures found"   # used as output in simulation mode
    expect:
      output_contains: "fixtures"          # all assertions go here
      output_not_contains: "error"
      latency_under: 5000
```

### Execution modes

- **Live mode**: fixture has a `server` block. The runner spawns the server and calls each tool via real MCP stdio. Assertions run against the actual response.
- **Simulation mode**: no `server` block. Each step's output comes from `expected_output`. Assertions run against that static value — if `expected_output` is absent the output is an empty string, so `output_contains` assertions will always fail.

### Supported assertion types

```
output_contains: "substring"
output_not_contains: "substring"
output_equals: "exact string"
output_matches: "regex pattern"
tool_called: "tool_name"
latency_under: 500             # milliseconds
schema_match: { type: object, required: [id], properties: { id: { type: number } } }
```

Add new assertion types in `src/assertions.ts` — implement the `Assertion` interface and the corresponding evaluator in `evaluateAssertion`, then add a unit test.

## How to Contribute

### Bug Reports

Open a GitHub issue with:

- Steps to reproduce (include the fixture YAML if relevant).
- Expected vs. actual behavior.
- Node.js version and OS.

### Pull Requests

1. Fork the repository and create a branch from `main`.
2. Write or update tests for any changed behavior.
3. Run `npm test` and ensure all tests pass.
4. Follow the existing code style (run `npm run lint`).
5. Reference the relevant issue in the PR description.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(assertions): add output_not_contains assertion type
fix(runner): handle empty expected_output in simulation mode
docs: document both execution modes in README
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.
