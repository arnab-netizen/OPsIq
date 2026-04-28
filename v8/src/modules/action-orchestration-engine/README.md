# Pack 14 — Action Orchestration Engine

## Status
`implemented_v6_partial`

## Runtime policy
`implemented-runtime`

## Purpose
Action plans, sequencing, dependencies, success metrics.

## Dependencies
- `diagnosis-engine`
- `shared-domain-contracts`
- `database-prisma-core`

## Enterprise implementation gate
This module is present in V7 so Claude Code can implement it later without inventing names, folders, or contracts. Before exposing runtime behavior, wire the service, repository, persistence, tests, audit events, RBAC checks, and route/page integration according to repo conventions.

## Acceptance criteria
- exports typed service and repository ports before implementation
- does not bypass RBAC, audit logging, or tenant scoping
- has unit tests before production route exposure
- uses API envelope and AppError conventions
- has explicit migration decision recorded when persistence changes

## Files in this module
- `action-orchestration-engine.contract.ts`
- `action-orchestration-engine.ports.ts`
- `README.md`
- `IMPLEMENTATION_PROMPT.md`


## Implementation plan file
- `action-orchestration-engine.implementation-plan.ts` contains required artifacts, data models, feature flags, permission keys, enterprise gates, and phased readiness requirements for this module.
