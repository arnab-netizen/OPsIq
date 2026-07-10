# Phase 6E — auth/workspace inventory

**Date:** 2026-07-10 · **Branch:** `claude/phase-6e-auth-workspace-invite-hardening` · **Base:** `c7d80404`

| # | Route / function | Auth wrapper | Workspace source | Capability | Tenant-isolation behavior | Role behavior | Status | Proof |
|---|---|---|---|---|---|---|---|---|
| 1 | `POST /api/onboarding/invite` (invite members / assign roles) | `withEnforcementFull` + `withAuth()` (session only) | workspace resolved from `body.workspaceSlug` → `workspace.id`; membership looked up for `session.user.id` | none (inline membership role check) | invite scoped to the resolved workspace | **was broken** — active non-admin admitted | **CONFIRMED_HIGH → FIXED** | `workspace-invite-policy.test.ts` (pure + `[db]`); fail-before proven |
| 2 | `enforceWorkspaceScoping` (middleware) | called by route wrappers | `workspaceId` arg (from `x-workspace-id`); membership for `getSession()` user | n/a (membership gate) | active-member-of-active-workspace required; else `null` (deny) | returns membership `role` | **CONFIRMED_MEDIUM (drift) → FIXED** (narrow select) | `workspace-enforcement.db.test.ts` (real fn, real DB) |
| 3 | `POST /api/diagnosis/root-cause` | `withEnforcementFull` + `withAuth({ capability: DIAGNOSIS_READ })` | **`body.workspaceId`** passed to engine; `withAuth` binds to `"system"` policy (default arg) | `DIAGNOSIS_READ` (checked in `"system"` policy) | engine is **pure compute** on request-body data; no DB read scoped by `body.workspaceId`, no persist, no audit | n/a | **FALSE_POSITIVE** (see below) | trace: engine `.create`/`emitAuditEvent` count = 0; `body.workspaceId` echoed only |
| 4 | `POST /api/diagnosis/maturity` | same as #3 | same | `DIAGNOSIS_READ` | pure compute; no persist/audit under `body.workspaceId` | n/a | **FALSE_POSITIVE** | maturity-engine writes = 0 |
| 5 | `POST /api/diagnosis/bottleneck` | same as #3 | same | `DIAGNOSIS_READ` | pure compute; no persist/audit under `body.workspaceId` | n/a | **FALSE_POSITIVE** | bottleneck-engine writes = 0 |
| 6 | `getPolicyContext` (already hardened Phase 5C) | — | `workspaceId` arg or first active membership | — | narrow-selects `workspaceId`/`isActive`; drift-safe | role assignments read | OK (reference pattern) | pre-existing |
| 7 | ~68 `withAuth(...)` call sites (all areas) | mixed (`withEnforcementFull`/`withCanonicalEnforcement` + inner `withAuth`) | **all default `workspaceId="system"`** (0 pass an explicit workspace) | varies | depends on outer wrapper binding the real workspace | varies | **DEFERRED_MIGRATION_PLAN** | see WITHAUTH_MIGRATION_PLAN.md |

## Target 3 (diagnosis body.workspaceId) — proof of FALSE_POSITIVE
- `withAuth({ capability: DIAGNOSIS_READ })` is called **without a workspace argument**, so it binds to the
  `"system"` policy context (`withAuth(options, workspaceId = "system")`), not to `body.workspaceId`.
- The route passes client-supplied `body.workspaceId` to `rootCauseEngine.analyzeRootCause(...)`, but the
  three diagnostic engines (`root-cause`, `maturity`, `bottleneck`) are **pure compute**: `grep` for
  `.create(`/`.update(`/`.upsert(`/`emitAuditEvent` = **0** in each. `workspaceId` is only echoed into the
  returned object; nothing is read from the DB scoped by it, nothing is persisted, nothing is audited.
- The only route persistence is `recordIdempotencyResponse/Error`, keyed by the caller's
  `idempotencyKey + authContext` — **not** by `body.workspaceId`.
- Conclusion: `body.workspaceId` is an inert echo field with **no tenant read/write/audit effect** →
  **not a cross-workspace escalation**. Classified FALSE_POSITIVE, no code change.
- Residual hygiene note (CONFIRMED_LOW, not fixed this PR): the field is accepted but unvalidated against
  the authenticated context. It is inert today but a latent footgun if a future change begins persisting or
  reading by it. Recommended future action: bind `withAuth` to the real workspace (part of the `withAuth`
  migration) or drop the field. Tracked in the migration plan; not escalated without a persistence/read.
