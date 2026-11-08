# Self-Serve Workspace Setup Flow

Enables pilot users to complete 10 required setup fields without external services. Once minimum setup is complete, users proceed to `/owner/first-value`.

## Required Data

- Business Name, Industry, Operating Location, Revenue Model
- Monthly Revenue & Cost Estimates
- Team Size / Capacity
- Customer Segment, Main Problem
- Owner Time Constraint

## States

`WORKSPACE_EXISTS` → `BUSINESS_BASICS_MISSING` → ... → `MINIMUM_SETUP_COMPLETE` → `firstValueReady=true`

## API

- `GET /api/owner/workspace-setup` — Get setup state, progress, missing data
- `POST /api/owner/workspace-setup` — Save setup data

## Page

`/owner/workspace-setup` — Authenticated, workspace-scoped form with progress bar

## Tests

- 7 pure contract tests (no DB)
- 9 DB-dependent service tests marked [db]

## Constraints

- No external services, no real payment side effects
- All writes workspace-scoped
- All routes use `withCanonicalEnforcement` + `enforceWorkspaceScoping`
- No raw errors, no secrets, demo workspaces marked
- Data stored in Engagement.metadata (no migrations)
