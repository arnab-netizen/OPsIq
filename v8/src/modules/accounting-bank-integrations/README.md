# Pack 28 — Accounting and Bank Integrations

## Status
`planned`

## Runtime policy
`contract-only-do-not-call-at-runtime`

## Purpose
Financial connectors, transaction mapping and conflict handling.

## Dependencies
- `connector-framework`
- `background-jobs-async-processing`
- `audit-log-transparency-center`

## Enterprise implementation gate
This module is present in V7 so Claude Code can implement it later without inventing names, folders, or contracts. Before exposing runtime behavior, wire the service, repository, persistence, tests, audit events, RBAC checks, and route/page integration according to repo conventions.

## Acceptance criteria
- exports typed service and repository ports before implementation
- does not bypass RBAC, audit logging, or tenant scoping
- has unit tests before production route exposure
- uses API envelope and AppError conventions
- has explicit migration decision recorded when persistence changes

## Files in this module
- `accounting-bank-integrations.contract.ts`
- `accounting-bank-integrations.ports.ts`
- `README.md`
- `IMPLEMENTATION_PROMPT.md`


## Implementation plan file
- `accounting-bank-integrations.implementation-plan.ts` contains required artifacts, data models, feature flags, permission keys, enterprise gates, and phased readiness requirements for this module.
