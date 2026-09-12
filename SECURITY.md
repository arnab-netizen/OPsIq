# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you believe you've found a security vulnerability in OpsIQ, report it privately using one of the following channels:

1. **Preferred:** Use [GitHub's private vulnerability reporting](../../security/advisories/new) for this repository (Security tab → "Report a vulnerability"). This creates a private advisory visible only to maintainers until a fix is ready.
2. **Alternative:** Email **support@opsiq.com** with a description of the issue, steps to reproduce, and any relevant proof-of-concept. Please use a subject line starting with `[SECURITY]`.

We ask that you:
- Give us a reasonable amount of time to investigate and address the issue before any public disclosure.
- Avoid accessing, modifying, or exfiltrating data belonging to other users/workspaces beyond what is strictly necessary to demonstrate the issue.
- Do not perform testing that could degrade the availability of the live service for other users (no load testing, no denial-of-service testing).

## What to Include

- A clear description of the vulnerability and its potential impact.
- Steps to reproduce, or a minimal proof-of-concept.
- The affected route, component, or file, if known.
- Whether the issue is present in the deployed application, the public source code, or both.

## Scope

This policy covers the OpsIQ application code in this repository and its deployed instance. Third-party dependencies should generally be reported to their own maintainers, though we're happy to help coordinate if a dependency issue affects OpsIQ directly.

## Response Process

We aim to acknowledge new reports within a few business days. Once a fix is available, we'll coordinate disclosure timing with the reporter and credit them (if desired) in the fix's release notes.
