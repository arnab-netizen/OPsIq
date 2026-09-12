# DEC-TEN-01 / CM-TEN-02 — ClientAccount & LeadRecord Tenant Anchor

## Source verification (this branch)
- `ClientAccount`: **NO `workspaceId` column** (verified `awk` over schema). It is referenced AS the tenant boundary by several models whose `workspaceId` FK points to `ClientAccount` (SCHEMA-03 "entity collapse": PrivateModeAccess, OwnerInputRecord, OwnerActionOutcome, …). Engagements link to it via `clientId`.
- `LeadRecord`: **NO `workspaceId` column**; scoped only via its owning ClientAccount/engagement relations.

## Classification
- ClientAccount → **WORKSPACE_SCOPED_INDIRECT / entity-collapse hazard**. It stores workspace-owned customer data but has no direct workspace anchor, and other models overload it AS the workspace. This is a real multi-tenant integrity gap (SCHEMA-03).
- LeadRecord → **WORKSPACE_SCOPED_INDIRECT** (via ClientAccount/engagement).

## Decision
**BLOCKED_OWNER_DECISION_REQUIRED + migration required.** A safe fix is a schema migration adding `workspaceId` to `ClientAccount`/`LeadRecord` (or repointing the mis-named `workspaceId`→`ClientAccount` FKs to `clientAccountId`), backfilling from existing relations, then scoping every query and route. This is a multi-step data migration with backfill risk that must not be flipped in one slice without a migration/backfill plan and a maintenance window.

## Interim safety (already in place on this branch)
- Route/service tenant guards (`withCanonicalEnforcement` `ctx.verifiedWorkspaceId`, `assertEngagementAccess`, `enforceWorkspaceScoping`) scope access to ClientAccount/LeadRecord through their engagement/membership relations.
- The DB backstop (SEC-04) blocks unscoped bulk wipes of the 117 directly-workspace-owned models.

## Required future work (acceptance criteria)
1. Migration: add `workspaceId` to ClientAccount + LeadRecord (or repoint the collapsed FKs); backfill; composite unique/index.
2. Scope all ClientAccount/LeadRecord service queries by verified workspace.
3. Tests: cross-workspace read/write denial; same-workspace success; no leakage through the collapsed FKs.
4. Update TENANT_MODEL_CLASSIFICATION.

**Status: BLOCKED_OWNER_DECISION_REQUIRED (migration scope). CM-TEN-02: STILL_OPEN (downgraded — route/service guards active, DB anchor missing).**
