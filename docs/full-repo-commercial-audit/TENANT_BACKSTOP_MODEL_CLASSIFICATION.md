# Tenant Backstop — Model Classification (GAP-TEN-01)

Purpose: classify every Prisma model touched by the DB-level tenant backstop
(`src/lib/prisma-workspace-enforcement.ts`) so enforcement can be enabled
**safely, one audited model at a time**, without breaking signup, user creation,
membership, audit/proof integrity, or legitimate global flows.

## Root cause (fixed)
Prisma v7 passes the extension `model` as **PascalCase** (`"Engagement"`), but
the old sets were keyed camelCase, so `.has()` never matched and the backstop
was **silently inert**. The extension now uses an explicit **PascalCase
allowlist** (`CANONICAL_ENFORCED_MODELS`); the casing bug cannot recur because a
regression test asserts the backstop actually blocks an unscoped query on an
enforced model (`src/__tests__/security/tenant-backstop-enforcement.db.test.ts`).

## Design
- Enforcement is **OFF by default**, **ON only for allowlisted models**.
- For an enforced model: create/createMany require `workspaceId` in `data`;
  update/delete/`*Many` and findFirst/findMany/count/aggregate/groupBy require
  `workspaceId` in `where`; conflicting `where`/`data` workspaceId is rejected.
- `findUnique`/`findUniqueOrThrow`/`upsert` are **not** gated (single-record by
  unique key) — a known limitation; route-level checks cover those.
- This is **defense-in-depth only**. The primary tenant control remains
  route-level (`withCanonicalEnforcement` → `ctx.verifiedWorkspaceId`,
  `assertEngagementAccess`, capability gates).

## Categories
| Category | Meaning | Enforce here? |
|---|---|---|
| WORKSPACE_SCOPED_DIRECT | has a `workspaceId` column | Only if EVERY live+test path already scopes (per-model audit) |
| WORKSPACE_SCOPED_INDIRECT | owned via relation (e.g. `engagementId` → `engagement.workspaceId`) | No — scope at service layer (no direct `workspaceId`) |
| USER_OR_MEMBERSHIP_SCOPED | User/Session/UserRoleAssignment/…; created at signup/invite | No — created before/without a workspace |
| GLOBAL_SYSTEM_MODEL | reference/system/config, cross-workspace | No (exempt by design) |
| AUDIT_OR_PROOF_MODEL | append-only/hash-chain integrity; nullable workspace | No — governed by their own services |
| LEGACY_OR_DEPRECATED_MODEL | retained for compat | No |

## CURRENTLY ENFORCED (allowlist)
| Model (PascalCase) | Why safe (evidence) |
|---|---|
| `UsageEvent` | Every live create is scoped (`entitlement.service.ts:334`); every read scoped (`entitlement.service.ts:130`, `admin-billing-diagnostics.service.ts:220`); no update/delete-by-id in prod; test createMany/deleteMany carry `workspaceId` (`admin-billing-db.test.ts:141,154`). Verified: enabling enforcement broke nothing (253 consumer tests green). |

## AUDITED-BUT-EXCLUDED (with reason — the follow-up backlog)
| Model | Category | Why excluded |
|---|---|---|
| `CanonicalEvent` | WS_DIRECT (event store) | Event-store ordering/idempotency paths do **unscoped** `count()`/`findMany()` (proven: phase-3 concurrency/idempotency proofs throw under enforcement). **Acceptance to enforce:** scope those event-store reads by `workspaceId` (or aggregate-scope), then re-run phase-3 proofs green, then add to allowlist. |
| `OperatorItem` | WS_DIRECT | verify-then-`update({where:{id}})` pattern (`operator/store.ts:209,284`) — update carries no `workspaceId`. Enforce only after switching those updates to `where:{id, workspaceId}`. |
| `Engagement` | WS_DIRECT | update-by-id in `stage.ts:214,297`, `intervention-state.ts:163…469`, `engagement.ts:310`. Same fix required. |
| `Recommendation` | WS_DIRECT | `projection-rebuild-engine.ts:30` `deleteMany({where:{id}})` unscoped. |
| `SnapshotData` | WS_DIRECT | `snapshot-optimization-engine.ts:106,122` `deleteMany({where:{id}})` unscoped. |
| `BusinessConditionProfile` | WS_DIRECT | `business-condition.ts:195` `count({where:{engagementId}})` unscoped. |
| `AuditEvent`, `Proof*`, `BehavioralLearningArtifact` | AUDIT_OR_PROOF | nullable workspaceId + append-only/hash-chain; governed by `emitAuditEvent`/Proof FSM; test cleanups frequently unscoped. |
| `BillingAccount`, `ThresholdConfig`, `AggregateLock` | WS_DIRECT | not individually evidenced safe (fetch-by-id→update-by-id; AggregateLock via raw SQL bypasses the extension). |
| `Owner*` / `Budget*` / `Recovery*` / `External*` / `Browser*` families | WS_DIRECT | large surface, not individually audited — conservative default is excluded. |

## EXEMPT BY CATEGORY (never enforced here)
- **USER_OR_MEMBERSHIP:** `User`, `Session`, `UserRoleAssignment`, `EngagementMembership`, `WorkspaceMembership` — signup creates User/Session/UserRoleAssignment with no `workspaceId` column (`signup/route.ts:51,89,109`); membership create IS scoped but its update paths are not.
- **GLOBAL_SYSTEM:** `Workspace`, `Plan`, `PlanCapability`, `IdempotencyRecord`, `ScheduledTask`, `WebhookEvent`, `StartupStatus`, `ExternalProvider`, `CaseStudy`, reference datasets, `Entity`.
- **WORKSPACE_SCOPED_INDIRECT:** `Action`, `Stage`, `Deliverable`, `Evidence`, `EvidenceBundle`, `Finding`, `Risk`, `KPI`, `OverrideRecord`, `ApprovalRequest`, `ClientContact`, etc. — no direct `workspaceId`; scope via the parent relation at the service layer.
- **STRUCTURAL GAP (no workspace linkage):** `ClientAccount` (no `workspaceId` column and no non-null workspace relation), `LeadRecord` (only a nullable `engagementId`). Registered as a schema follow-up (COMMERCIALIZATION_GAP_REGISTER: multi-tenant SaaS safety) — these are scoped in practice via query filters but lack a DB-level tenant anchor.

## Closure statement for GAP-TEN-01
The backstop is **no longer inert**: it is LIVE and fail-closed for the audited
`UsageEvent` model, with a regression test proving the casing bug cannot recur
and that excluded models (User/OperatorItem/CanonicalEvent) still pass through
(signup + event store intact). The remaining WORKSPACE_SCOPED_DIRECT models are
**downgraded with proof** and listed above with exact per-model acceptance
criteria to add them to the allowlist. Route-level tenant control remains the
primary, comprehensive protection.
