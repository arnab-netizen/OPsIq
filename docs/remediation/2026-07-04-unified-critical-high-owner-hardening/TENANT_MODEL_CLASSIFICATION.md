# Tenant Model Classification (SEC-02 / SEC-04)

Generated from `prisma/schema.prisma`. Basis for the DB backstop (`src/lib/prisma-workspace-enforcement.ts`) and the service-layer scoping requirements.

## Classes

### WORKSPACE_SCOPED_DIRECT (117 models — required `workspaceId` column)
Enforced by the DB backstop (create requires workspaceId; no all-tenant bulk mutation) AND by the service layer for by-id writes/reads. Full list is the `WORKSPACE_OWNED_MODELS` set in `src/lib/prisma-workspace-enforcement.ts` (e.g. OperatorItem, Engagement, Recommendation, BusinessConditionProfile, DelegatedTask, Proof, all Owner*/Recovery* models, WorkspaceMembership, BillingAccount, UsageEvent, CanonicalEvent, SpendEntry, …).

### AUDIT_OR_PROOF_MODEL (nullable `workspaceId` — EXCLUDED from DB backstop, documented exemption)
- `AuditEvent` — appended by system paths and cleaned up tenant-agnostically; nullable workspaceId by design. Enforcing workspaceId-in-create would break audit append/cleanup. Exempt.
- `BehavioralLearningArtifact` — nullable workspaceId.
- `RecommendationLegacy` — deprecated/`@ignore`-adjacent legacy model.

### WORKSPACE_SCOPED_INDIRECT (no direct `workspaceId`; scoped via a parent relation)
- `Action`, `Evidence`, `EvidenceItem`, `Finding` → scoped via `engagementId` → `engagement.workspaceId`.
- `ApprovalRequest`, `OverrideRecord`, `DecisionSnapshot` → scoped via their parent (operatorItem/engagement).
Enforced at the service/route layer (`assertEngagementAccess`, `enforceWorkspaceScoping`). SCHEMA-01 tracks adding a direct `workspaceId` to these for a DB-level guarantee.

### USER_OR_MEMBERSHIP_SCOPED
- `User` — created at signup BEFORE any workspace exists; membership-scoped, NOT directly workspace-owned. **Deliberately not in the DB backstop set** (would break signup). Access controlled via `workspaceMembership`.
- `Session`, `UserRoleAssignment` — user/subject scoped.

### GLOBAL_SYSTEM_MODEL (no tenant scope)
- `Workspace`, `WorkspaceRole`, `Capability`, `SystemConfig`, `IdempotencyRecord`, `Problem`, `Intervention`, etc.

## Enforcement points (defense in depth)

| Vector | Enforcement | Status |
|--------|-------------|--------|
| Unscoped INSERT of a workspace-owned row | DB backstop invariant 1 (create requires workspaceId) | ACTIVE (SEC-04) |
| All-tenant bulk `updateMany`/`deleteMany` (empty WHERE) | DB backstop invariant 2 | ACTIVE (SEC-04) |
| By-id single write across tenants (operator decisions) | Service layer: `updateItem`/`applyOverride` require workspaceId + scoped read | ACTIVE + PROVEN (SEC-02) |
| Route-level workspace derivation | `withCanonicalEnforcement` `ctx.verifiedWorkspaceId` (server-derived, never header) | ACTIVE |
| Engagement/finding/action access | `assertEngagementAccess`, `enforceWorkspaceScoping` | ACTIVE |

## Documented downgrade (why the DB backstop does NOT block by-id writes / reads)
Prisma cannot express a `workspaceId` filter inside a single `update`/`delete` whose `where` is a bare unique `id` (no compound unique exists), and many legitimate bulk writes scope by an INDIRECT key (`engagementId`, `businessId`, `clientId`). Turning on fail-closed where-level read/write enforcement repo-wide would produce mass false positives and require rewriting every query to `updateMany` — exactly the risk the original inert code's comment described. Therefore by-id write scoping and read scoping for workspace-owned models are enforced at the **service layer** (proven for the SEC-02 operator path) and the **route layer**, while the DB backstop covers the two invariants that are safe and catch catastrophic accidental cross-tenant damage. This is the "remaining scope downgraded with proof" path.
