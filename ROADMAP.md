# Roadmap — MCP Eval Runner

## Phase 1: MVP ✅ Complete

### Goal

Ship a working eval harness that lets a developer write YAML fixtures, run them from their MCP client, and get a pass/fail report with diffs — eliminating manual testing of MCP servers.

### MCP Protocol Compliance

- [x] Implement stdio transport (required baseline for all MCP servers)
- [x] Strict JSON Schema for all tool inputs — `run_case` requires `name: string`, `create_test_case` requires `name`, `steps` array
- [x] Tool annotations: `run_suite`/`run_case` marked `readOnlyHint: false` (they execute against live servers); `list_cases`/`regression_report` marked `readOnlyHint: true`
- [x] Proper MCP error codes: `invalid_params` for missing fixture name, `internal_error` for eval execution failures
- [x] Verified with MCP Inspector before publish
- [x] `package.json` with correct `bin`, `files`, `keywords: ["mcp", "mcp-server", "testing", "evals"]`

### Features

- [x] YAML/JSON fixture format with documented JSON Schema
- [x] `run_suite` — execute all fixtures against live servers
- [x] `run_case` — run a single named test
- [x] Assertions: `output_contains`, `output_equals`, `latency_under`, `tool_called`
- [x] `regression_report` — pass/fail summary with diffs
- [x] `list_cases` — enumerate available fixtures
- [x] SQLite storage for run history (respects `--db` and `--fixtures` flags)
- [x] Console reporter with color-coded output and diff display
- [x] `--timeout`, `--format`, `--watch` flags wired up
- [x] TypeScript strict mode
- [x] Basic Jest/Vitest test suite (use the eval runner to test itself where possible)
- [x] `CHANGELOG.md` initialized
- [x] Semantic versioning from first release
- [x] Publish to npm

---

## Phase 2: Polish & Adoption ✅ Complete

### Goal

Make eval suites a natural part of every MCP developer's workflow — run on save, run in CI, share with teammates.

### MCP Best Practices

- [x] Progress notifications (`notifications/progress`) during suite execution — report per-case progress
- [x] Cancellation support (`notifications/cancelled`) — abort a running suite cleanly, saving partial results
- [x] MCP logging (`notifications/message`) — emit debug events for each assertion evaluated
- [x] Streamable HTTP transport (MCP 2025 spec) — run evals remotely (useful for CI environments)
- [x] MCP Prompts primitive: `write-test-case` prompt template to guide fixture authoring from a workflow description
- [x] MCP Resources primitive: expose individual fixture files as resources (`eval://{fixture_name}`)
- [x] Tool descriptions include assertion type examples to guide LLM fixture creation

### Features

- [x] `create_test_case` — define new test cases interactively via MCP tool (not just by editing YAML)
- [x] `compare_results` — diff two run histories side by side
- [x] `schema_match` JSON Schema assertion type
- [x] `--watch` mode — auto-rerun suite when fixture files change
- [x] GitHub Action: run eval suite on every push (wires up `--format=json` output for annotations)
- [x] HTML report artifact with drill-down per test case and assertion
- [x] Fixture scaffolding — capture a real agent run and generate a fixture from it
- [x] ESLint + Prettier enforced in CI
- [x] 90%+ test coverage (dogfood: run the eval suite against the eval runner itself)
- [x] Listed on MCP Registry
- [x] Listed on MCP Market

---

## Phase 3: Monetization & Enterprise ✅ Complete

### Goal

Enable teams to share eval suites, track quality over time, and enforce eval gates in deployment pipelines.

### MCP Enterprise Standards

- [x] OAuth 2.0 authorization (MCP 2025 spec) for hosted eval execution API
- [x] Rate limiting on eval run endpoints
- [x] API key authentication for team access to shared fixture library and history
- [x] Multi-transport: stdio for local use, Streamable HTTP for hosted/CI tier

### Features

- [x] Hosted eval history — store and compare results across team members over time
- [x] Eval dashboard — pass rate trends, regression timeline, per-fixture failure history
- [x] Deployment gates — fail a deploy pipeline if pass rate drops below a configurable threshold
- [x] Shared fixture library — publish and discover community eval suites for popular MCP servers
- [x] LLM-as-judge assertion type (semantic similarity, factual accuracy scoring)
- [x] Paid tier: hosted execution, team dashboards, CI integration, gate enforcement

---

## Guiding Principles

- **No mocking** — evals run against real servers; correctness is non-negotiable
- **Fixtures are text** — YAML/JSON in version control; no proprietary formats or databases
- **Fast feedback** — a 10-case suite should complete in under 30 seconds
- **Dogfood-first** — the eval runner's own test suite uses the eval runner before any other server is tested
- **MCP-native** — uses Prompts and Resources primitives to lower the barrier to fixture authorship
