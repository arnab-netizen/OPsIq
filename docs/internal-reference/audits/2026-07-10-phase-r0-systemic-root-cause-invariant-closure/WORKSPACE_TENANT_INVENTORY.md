# Phase R0 — Workspace Tenant Authorization Inventory

**Date:** 2026-07-10
**Scope:** All routes where workspaceId originates from untrusted caller input (body, query, header)

---

## Risk Classification

- `OPEN` — workspaceId from untrusted source, no membership check
- `CLOSED` — membership check enforced before any DB write
- `MIDDLEWARE` — validated via `enforceWorkspaceScoping()` middleware (not in route file but confirmed in middleware)
- `FIXED_6J` — was `OPEN`, now `CLOSED` after Phase 6J fix

---

## Routes: workspaceId from request BODY

All three routes now have `CLOSED` status after Phase 6J (D4-01/02/03).

| Route | Before | After | Method |
|---|---|---|---|
| POST /api/diagnosis/maturity | OPEN | CLOSED (FIXED_6J) | `db.workspaceMembership.findFirst` check |
| POST /api/diagnosis/bottleneck | OPEN | CLOSED (FIXED_6J) | `db.workspaceMembership.findFirst` check |
| POST /api/diagnosis/root-cause | OPEN | CLOSED (FIXED_6J) | `db.workspaceMembership.findFirst` check |

---

## Routes: workspaceId from query param

These use `enforceWorkspaceScoping()` which calls `db.workspaceMembership.findUnique` internally.

| Route | Status | Notes |
|---|---|---|
| POST /api/decisions/[id]/execute | MIDDLEWARE | enforceWorkspaceScoping validates query workspaceId |
| POST /api/decisions/[id]/fail | MIDDLEWARE | enforceWorkspaceScoping |
| POST /api/decisions/[id]/record-outcome | MIDDLEWARE | enforceWorkspaceScoping |
| POST /api/decisions/[id]/verify | MIDDLEWARE | enforceWorkspaceScoping |
| PATCH /api/decisions/[id]/route | MIDDLEWARE | enforceWorkspaceScoping |
| GET /api/control/today | MIDDLEWARE | enforceWorkspaceScoping |
| GET /api/business-impact/decision/[id] | MIDDLEWARE | enforceWorkspaceScoping |
| GET /api/business-impact/summary | MIDDLEWARE | enforceWorkspaceScoping |
| GET /api/governance/metrics | MIDDLEWARE | enforceWorkspaceScoping |
| POST /api/decisions/intake | CLOSED | direct `db.workspaceMembership.findFirst` in route |

---

## Routes: workspaceId from x-workspace-id header

Public routes are intentionally open (no auth). Protected routes with header workspaceId
are validated via `enforceWorkspaceScoping()` middleware, not in the route file.

| Route | Auth | Workspace validation |
|---|---|---|
| GET /api/public/* (3 routes) | NONE (intentional) | header workspace read-only; no write |
| GET/POST /api/engagements/[id]/actions | withAuth | enforceWorkspaceScoping |
| GET /api/engagements/[id]/business-impact | withAuth | enforceWorkspaceScoping |
| GET /api/engagements/[id]/constraint-checks | withAuth | enforceWorkspaceScoping |
| GET /api/engagements/[id]/decision-evidence | withAuth | enforceWorkspaceScoping |
| ... (25 more header routes) | withAuth | enforceWorkspaceScoping |

---

## Routes: workspaceId from session (safe baseline)

Routes using `ctx.verifiedWorkspaceId` from `withCanonicalEnforcement` or equivalent session-bound
context are not listed here — they are the safe baseline pattern. 246 routes use this pattern.

---

## Summary

| Source | Total routes | Status |
|---|---|---|
| session (verifiedWorkspaceId) | ~246 | SAFE — session-bound |
| header (x-workspace-id) | 29 | MIDDLEWARE validated |
| query (workspaceId param) | 11 | MIDDLEWARE validated or CLOSED |
| body (body.workspaceId) | 3 | CLOSED (all FIXED_6J) |

No remaining OPEN cases for workspaceId from untrusted sources.
