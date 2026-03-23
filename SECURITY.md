# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

We support the latest published version of `mcp-eval-runner` on npm. Update to the latest release before reporting a vulnerability.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainers directly or using GitHub's private vulnerability reporting feature (Security → Report a vulnerability).

Include as much of the following as possible:

- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue.
- Any proof-of-concept code, if applicable.
- The version of `mcp-eval-runner` you are using.

You can expect an initial response within **72 hours** and a resolution or status update within **14 days**.

## Security Considerations

`mcp-eval-runner` loads and executes YAML fixture files:

- Only load fixture files from trusted sources. YAML deserialization of untrusted input can lead to unexpected behavior.
- Fixtures that invoke MCP tools will execute those tools with the permissions of the running agent; review fixture contents before running.
- Do not store credentials or secrets inside fixture files.
