# A7.6 Defect-Class Matrix

| ID | Class Name | Severity | Instances Found | Instances Fixed | Instances Deferred | Prevention Mechanism | Status |
|----|-----------|----------|----------------|----------------|-------------------|---------------------|--------|
| DC-A7.6-I1A | Workspace ID from HTTP header | CRITICAL | 12 | 3 | 9 | Use ctx.verifiedWorkspaceId; ESLint rule | PARTIALLY CLOSED |
| DC-A7.6-I1B | Workspace ID from broken context.ts | CRITICAL | 7 | 2 | 5 | Use ctx.verifiedWorkspaceId; deprecate context.ts | PARTIALLY CLOSED |
| DC-A7.6-I1C | Actor identity from request body | HIGH | 7 | 7 | 0 | Use ctx.verifiedActorId; remove from Zod schema | CLOSED |
| DC-A7.6-I12 | Duplicate auth wrappers (3 patterns) | HIGH | 79 non-canonical | 0 | 79 | Deprecate legacy wrappers; ESLint no-restricted-imports | DEFERRED |
| DC-A7.6-I13 | Duplicate state machines (9 impls) | MEDIUM | 9 | 0 | 9 | Central state-machine-registry.ts; ESLint rule | DEFERRED |
| DC-A7.6-I16A | Direct auditEvent.create bypass | HIGH | 20+ | 0 | 20+ | ESLint no-restricted-syntax on auditEvent.create | DEFERRED |
| DC-A7.6-I16B | Two competing audit writers | HIGH | 2 writers | 0 | 2 | Delete logAuditEvent; consolidate into emitAuditEvent | DEFERRED |
| DC-A7.6-I20 | Three requireWorkspaceContext impls | CRITICAL | 3 impls | 0 | 1 (context.ts to delete) | Delete context.ts; @deprecated markers | DEFERRED |

---

## Defect Closure Criteria

### DC-A7.6-I1 fully closed when:
- All 12 I1A routes use `ctx.verifiedWorkspaceId` (requires DC-A7.6-I12 migration for 9 deferred)
- All 7 I1B routes/services use `ctx.verifiedWorkspaceId` or `activation-context.ts` (requires DC-A7.6-I12 + I20)
- I1C is already 100% closed

### DC-A7.6-I12 fully closed when:
- All 39 `enforceWorkspaceScoping` routes migrated to `withCanonicalEnforcement`
- All 40+ `withAuth`/`withEnforcementFull` routes migrated
- Both legacy wrappers marked `@deprecated` and blocked by ESLint

### DC-A7.6-I13 fully closed when:
- `src/domain/state-machine-registry.ts` created
- All 9 local transition maps import from it or are replaced by it
- ESLint rule active

### DC-A7.6-I16/I20 fully closed when:
- `logAuditEvent` deleted or merged into `emitAuditEvent`
- All 20+ direct `auditEvent.create` calls replaced with `emitAuditEvent`
- `context.ts::requireWorkspaceContext` deleted
- `activation-context.ts::requireWorkspaceContext` renamed to avoid collision
- ESLint rules active on both audit and workspace resolution

---

## Instance Inventory: DC-A7.6-I1A (x-workspace-id header reads)

| Route | Auth Pattern | Status |
|-------|-------------|--------|
| `engagements/[id]/actions/route.ts` | withCanonicalEnforcement | FIXED |
| `engagements/[id]/findings/route.ts` | withCanonicalEnforcement | FIXED |
| `engagements/[id]/recommendations/route.ts` | withCanonicalEnforcement | FIXED |
| `engagements/[id]/experiments/route.ts` (×6) | enforceWorkspaceScoping | DEFERRED (I12 blocker) |
| `engagements/[id]/shock-events/route.ts` | enforceWorkspaceScoping | DEFERRED |
| `engagements/[id]/constraint-checks/route.ts` | enforceWorkspaceScoping | DEFERRED |
| `engagements/[id]/pricing-tiers/route.ts` | enforceWorkspaceScoping | DEFERRED |
| `execute/route.ts` | withAuth/withEnforcementFull | DEFERRED |

## Instance Inventory: DC-A7.6-I1B (broken requireWorkspaceContext)

| File | Auth Pattern | Status |
|------|-------------|--------|
| `governance/alerts/route.ts` | withCanonicalEnforcement | FIXED |
| `observability/summary/route.ts` | withCanonicalEnforcement | FIXED |
| `metrics/control-effectiveness/route.ts` | withAuth | DEFERRED |
| `metrics/decision-latency/route.ts` | withAuth | DEFERRED |
| `run/route.ts` | withEnforcementFull | DEFERRED |
| `src/services/operator/store.ts` (×4) | N/A (service) | DEFERRED |
| `src/services/audit/audit-log.ts` | N/A (service) | DEFERRED |

## Instance Inventory: DC-A7.6-I1C (actor identity from body)

| Route | Field Removed | Status |
|-------|--------------|--------|
| `owner/learning-rejections/route.ts` | `rejectedBy` | FIXED |
| `owner/learning-candidates/[id]/promote/route.ts` | `approvedBy` | FIXED |
| `owner/learning-consent/route.ts` | `consentBy` | FIXED |
| `owner/learning-harm-events/route.ts` | `detectedBy` | FIXED |
| `owner/learning-attribution-reviews/route.ts` | `reviewedBy` | FIXED |
| `owner/learning-privacy/route.ts` | `appliedBy` | FIXED |
| `owner/learning-retention/route.ts` | `appliedBy` | FIXED |
