# Changelog

All notable changes to MCP Eval Runner will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-03-23)


### Features

* add mcpName and prepublishOnly for npm/registry publication ([bf87c24](https://github.com/dbsectrainer/mcp-eval-runner/commit/bf87c24be885d60955c88564142a2b16825f9c42))
* add server.json for official MCP registry ([835c1c1](https://github.com/dbsectrainer/mcp-eval-runner/commit/835c1c199b6f5fe67df896cd0a5feed669c21e1c))
* add smithery.yaml for Smithery deployment ([b9b16d6](https://github.com/dbsectrainer/mcp-eval-runner/commit/b9b16d6d49b35b3795c86f308d2e51dc19b13ff2))
* initial release v1.0.0 ([2ece06a](https://github.com/dbsectrainer/mcp-eval-runner/commit/2ece06a861f2ac74d25ebae5095bccb85853fa39))

## [Unreleased]

## [1.0.1] - 2026-03-23

### Fixed

- **smoke fixture** (`evals/smoke.yaml`): the fixture previously ran in simulation mode because it had no `server` block. In simulation mode, `output_contains` assertions evaluate against `expected_output`, which was empty, so the assertion always failed. Fixed by adding a `server` block (`command: node`, `args: ["dist/index.js"]`) so the fixture now runs in live mode against the eval runner itself and the `output_contains: "smoke"` assertion passes against the real `list_cases` response.

## [1.0.0] - 2026-03-12

### Added

- `.env.example` documenting `MCP_API_KEY`, `MCP_JWT_SECRET`, `LLM_JUDGE_API_KEY`, `LLM_JUDGE_BASE_URL`, and `FIXTURE_LIBRARY_DIRS`.

### Changed

- `@modelcontextprotocol/sdk` upgraded from `^1.0.0` to `^1.12.0`.
- `chokidar` upgraded from `^3.x` to `^5.0.0` (no API changes required — already ESM).
- `@types/node` upgraded from `^22.x` to `^24.12.0` (Node 24 LTS).
- `eslint` upgraded from `^9.x` to `^10.0.3`; `eslint-config-prettier` from `^9.x` to `^10.1.8`.
- `yargs` upgraded from `^17.x` to `^18.0.0`.
- Added `author`, `license`, `repository`, and `homepage` fields to `package.json`.

### Fixed

- Prefixed unused `base64urlDecode` in `src/auth.ts` and `writeFixture` in `tests/fixture-library.test.ts` with `_` to satisfy `no-unused-vars` lint rule.

### Security

- Resolved **GHSA-67mh-4wv8-2f99** (`esbuild` ≤ 0.24.2 dev-server cross-origin exposure) by upgrading `vitest` and `@vitest/coverage-v8` to `^4.1.0`. Affects local development only; not a production runtime concern.

## [0.2.0] - 2026-03-12

### Added

- **Extended assertions** (`src/assertions.ts`): additional assertion types beyond string equality — numeric comparisons, regex matching, and JSON path checks.
- **LLM judge** (`src/llm-judge.ts`): AI-powered assertion scoring via any OpenAI-compatible completions endpoint, configured via `LLM_JUDGE_API_KEY` and `LLM_JUDGE_BASE_URL`.
- **Deployment gate** (`src/deployment-gate.ts`): block CI promotion if the eval pass rate falls below a configurable threshold. Integrates with `run_deployment_gate` tool.
- **Fixture library** (`src/fixture-library.ts`): centralized fixture discovery across multiple directories; supports `FIXTURE_LIBRARY_DIRS` env var for additional scan paths.
- **Audit log** (`src/audit-log.ts`): append-only JSONL audit trail of every eval run.
- **JWT / API-key auth middleware** (`src/auth.ts`): HTTP transport protected via `MCP_API_KEY` or `MCP_JWT_SECRET`. stdio is unaffected.
- **Per-client rate limiter** (`src/rate-limiter.ts`): sliding-window request throttle on the HTTP transport.
- **New tools**: `run_deployment_gate`, `search_fixtures`, `add_fixture`, `llm_judge`.
- **`npm run inspect` script**: launches MCP Inspector for interactive pre-publish verification.
- MCP Inspector verification instructions added to README.
- Tests for assertions, audit log, auth, deployment gate, fixture library, LLM judge, and rate limiter.

## [0.1.0] - 2026-03-12

### Added

- Initial public release of `mcp-eval-runner`.
- YAML fixture format: `prompt → expected tool calls → expected outputs`.
- Regression suite execution directly from MCP clients (Claude Code, Cursor, etc.).
- Pass/fail results with structured diffs for failed assertions.
- Support for running individual fixtures or full suites.
- Watch mode for continuous re-evaluation during development (`chokidar`-based).
- Streamable HTTP transport via `--http-port` flag (default: disabled, uses stdio).
- GitHub Actions CI workflow running build, test, and lint on push/PR to `main`.
- Vitest test suite with coverage via `@vitest/coverage-v8`.
