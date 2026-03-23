# MCP Eval Runner

npm `mcp-eval-runner` package

A standardized testing harness for MCP servers and agent workflows. Define test cases as YAML fixtures (steps → expected tool calls → expected outputs), run regression suites directly from your MCP client, and get pass/fail results with diffs — without leaving Claude Code or Cursor.

[Tool reference](#tools) | [Configuration](#configuration) | [Fixture format](#fixture-format) | [Contributing](#contributing) | [Troubleshooting](#troubleshooting) | [Design principles](#design-principles)

## Key features

- **YAML fixtures**: Test cases are plain files in version control — diffable, reviewable, and shareable.
- **Two execution modes**: Live mode spawns a real MCP server and calls tools via stdio; simulation mode runs assertions against `expected_output` without a server.
- **Composable assertions**: Combine `output_contains`, `output_not_contains`, `output_equals`, `output_matches`, `schema_match`, `tool_called`, and `latency_under` per step.
- **Step output piping**: Reference a previous step's output in downstream inputs via `{{steps.<step_id>.output}}`.
- **Regression reports**: Compare the current run to any past run and surface what changed.
- **Watch mode**: Automatically reruns the affected fixture when files change.
- **CI-ready**: Includes a GitHub Action for running evals on every config change.

## Requirements

- Node.js v22.5.0 or newer.
- npm.

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "eval-runner": {
      "command": "npx",
      "args": ["-y", "mcp-eval-runner@latest"]
    }
  }
}
```

By default, eval fixtures are loaded from `./evals/` in the current working directory. To use a different path:

```json
{
  "mcpServers": {
    "eval-runner": {
      "command": "npx",
      "args": ["-y", "mcp-eval-runner@latest", "--fixtures=~/my-project/evals"]
    }
  }
}
```

### MCP Client configuration

Amp · Claude Code · Cline · Cursor · VS Code · Windsurf · Zed

## Your first prompt

Create a file at `evals/smoke.yaml`. Use **live mode** (recommended) by including a `server` block:

```yaml
name: smoke
description: "Verify eval runner itself is working"
server:
  command: node
  args: ["dist/index.js"]
steps:
  - id: list_check
    description: "List available test cases"
    tool: list_cases
    input: {}
    expect:
      output_contains: "smoke"
```

Then enter the following in your MCP client:

```
Run the eval suite.
```

Your client should return a pass/fail result for the smoke test.

## Fixture format

Fixtures are YAML (or JSON) files placed in the fixtures directory. Each file defines one test case.

### Top-level fields

| Field         | Required | Description                                                                               |
| ------------- | -------- | ----------------------------------------------------------------------------------------- |
| `name`        | Yes      | Unique name for the test case                                                             |
| `description` | No       | Human-readable description                                                                |
| `server`      | No       | Server config — if present, runs in **live mode**; if absent, runs in **simulation mode** |
| `steps`       | Yes      | Array of steps to execute                                                                 |

### `server` block (live mode)

```yaml
server:
  command: node # executable to spawn
  args: ["dist/index.js"] # arguments
  env: # optional environment variables
    MY_VAR: "value"
```

When `server` is present the eval runner spawns the server as a child process, connects via MCP stdio transport, and calls each step's tool against the live server.

### `steps` array

Each step has the following fields:

| Field             | Required | Description                                                   |
| ----------------- | -------- | ------------------------------------------------------------- |
| `id`              | Yes      | Unique identifier within the fixture (used for output piping) |
| `tool`            | Yes      | MCP tool name to call                                         |
| `description`     | No       | Human-readable step description                               |
| `input`           | No       | Key-value map of arguments passed to the tool (default: `{}`) |
| `expected_output` | No       | Literal string used as output in simulation mode              |
| `expect`          | No       | Assertions evaluated against the step output                  |

### Execution modes

**Live mode** — fixture has a `server` block:

- The server is spawned and each step calls the named tool via MCP stdio.
- Assertions run against the real tool response.
- Errors from the server cause the step (and by default the case) to fail immediately.

**Simulation mode** — no `server` block:

- No server is started.
- Each step's output is taken from `expected_output` (or empty string if absent).
- Assertions run against that static output.
- Useful for authoring and CI dry-runs, but `output_contains` assertions will always fail if `expected_output` is not set.

### Assertion types

All assertions go inside a step's `expect` block:

```yaml
expect:
  output_contains: "substring" # output includes this text
  output_not_contains: "error" # output must NOT include this text
  output_equals: "exact string" # output exactly matches
  output_matches: "regex pattern" # output matches a regular expression
  tool_called: "tool_name" # verifies which tool was called
  latency_under: 500 # latency in ms must be below this threshold
  schema_match: # output (parsed as JSON) matches JSON Schema
    type: object
    required: [id]
    properties:
      id:
        type: number
```

Multiple assertions in one `expect` block are all evaluated; the step fails if any assertion fails.

### Step output piping

Reference the output of a previous step in a downstream step's `input` using `{{steps.<step_id>.output}}`:

```yaml
steps:
  - id: search_step
    tool: search
    input:
      query: "mcp eval runner"
    expected_output: "result: mcp-eval-runner v1.0"
    expect:
      output_contains: "mcp-eval-runner"

  - id: summarize_step
    tool: summarize
    input:
      text: "{{steps.search_step.output}}"
    expected_output: "Summary: mcp-eval-runner v1.0"
    expect:
      output_contains: "Summary"
```

Piping works in both live mode and simulation mode.

### Note on `create_test_case`

Fixtures created with the `create_test_case` tool do not include a `server` block. They always run in simulation mode. To use live mode, add a `server` block manually to the generated YAML file.

## Tools

### Running

- `run_suite` — execute all fixtures in the fixtures directory; returns a pass/fail summary
- `run_case` — run a single named fixture by name
- `list_cases` — enumerate available fixtures with step counts and descriptions

### Authoring

- `create_test_case` — create a new YAML fixture file (simulation mode; no `server` block)
- `scaffold_fixture` — generate a boilerplate fixture with placeholder steps and pre-filled assertion comments

### Reporting

- `regression_report` — compare the current fixture state to the last run; surfaces regressions and fixes
- `compare_results` — diff two specific runs by run ID
- `generate_html_report` — generate a single-file HTML report for a completed run

### Operations

- `evaluate_deployment_gate` — CI gate; fails if recent pass rate drops below a configurable threshold
- `discover_fixtures` — discover fixture files across one or more directories (respects `FIXTURE_LIBRARY_DIRS`)

## Configuration

### `--fixtures` / `--fixtures-dir`

Directory to load YAML/JSON eval fixture files from.

Type: `string`
Default: `./evals`

### `--db` / `--db-path`

Path to the SQLite database file used to store run history.

Type: `string`
Default: `~/.mcp/evals.db`

### `--timeout`

Maximum time in milliseconds to wait for a single step before marking it as failed.

Type: `number`
Default: `30000`

### `--watch`

Watch the fixtures directory and rerun the affected fixture automatically when files change.

Type: `boolean`
Default: `false`

### `--format`

Output format for eval results.

Type: `string`
Choices: `console`, `json`, `html`
Default: `console`

### `--concurrency`

Number of test cases to run in parallel.

Type: `number`
Default: `1`

### `--http-port`

Start an HTTP server on this port instead of stdio transport.

Type: `number`
Default: disabled (uses stdio)

Pass flags via the `args` property in your JSON config:

```json
{
  "mcpServers": {
    "eval-runner": {
      "command": "npx",
      "args": ["-y", "mcp-eval-runner@latest", "--watch", "--timeout=60000"]
    }
  }
}
```

## Design principles

- **No mocking**: Live mode evals run against real servers. Correctness is non-negotiable.
- **Fixtures are text**: YAML/JSON in version control; no proprietary formats or databases.
- **Dogfood-first**: The eval runner's own smoke fixture tests the eval runner itself.

## Verification

Before publishing a new version, verify the server with MCP Inspector to confirm all tools are exposed correctly and the protocol handshake succeeds.

**Interactive UI** (opens browser):

```bash
npm run build && npm run inspect
```

**CLI mode** (scripted / CI-friendly):

```bash
# List all tools
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list

# List resources and prompts
npx @modelcontextprotocol/inspector --cli node dist/index.js --method resources/list
npx @modelcontextprotocol/inspector --cli node dist/index.js --method prompts/list

# Call a tool (example — replace with a relevant read-only tool for this plugin)
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name list_cases

# Call a tool with arguments
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name run_case --tool-arg name=smoke
```

Run before publishing to catch regressions in tool registration and runtime startup.

## Contributing

New assertion types go in `src/assertions.ts` — implement the `Assertion` interface and add a test. Integration tests live under `tests/` as unit tests and under `evals/` as eval fixtures.

```bash
npm install && npm test
```

## MCP Registry & Marketplace

This plugin is available on:

- [MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Marketplace](https://marketplace.modelcontextprotocol.io)

Search for `mcp-eval-runner`.
