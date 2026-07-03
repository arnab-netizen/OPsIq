# OpsIQ Wave 7 — Decision Memo: entitlement resolution in the auth hot path + adjacent alert honesty debt

> Required by the follow-up-wave rule: "if a wave requires a security/infrastructure decision, do not guess —
> create a decision memo (options, recommendation, risks, tests)." This memo resolves how the verified-session
> snapshot should represent entitlements (the M1 "+ limits" ask), and records adjacent honesty debt that is out of
> Wave 7's minimal scope so it is documented rather than silently buried.

## DECISION 1 — How should the verified-session snapshot represent entitlements/limits?
**Context.** The snapshot currently fabricates `entitlements = { planId: "default", featureFlags: {}, limits: {} }`
without reading anything. A real resolver exists: `entitlement.service.ts::resolveEntitlements(workspaceId)` — but
it **fails closed** (`throw NotFoundError` when a workspace has no `BillingAccount → Subscription → Plan`). The
snapshot is built **once per request for every canonical-enforced route**.

**Options.**
- (a) **Resolve entitlements per-request in the wrapper.** Real data in the snapshot. *Risk: unacceptable* —
  `resolveEntitlements` throws for any workspace without a seeded subscription/plan (virtually all test workspaces
  and any not-yet-billed real workspace), which would turn the auth wrapper into a 500 on every route. Also adds a
  multi-query chain (`subscription → plan → planCapabilities → usage`) to the hot path. Rejected.
- (b) **Represent entitlements honestly as "not resolved in this snapshot"** (`resolved: false`, `planId: null`,
  empty featureFlags/limits) and keep real limit checks on the existing on-demand path
  (`entitlement.service.assertCapability`, which already fails closed at the point of use). *Recommended* — removes
  the fabrication with zero new per-request failure modes, uses the existing system, migration-free.
- (c) **Lazily resolve on first access.** More moving parts in an immutable snapshot; the fabricated fields are
  unconsumed today, so this is unjustified complexity. Rejected.

**Recommendation.** (b). The snapshot stops claiming a fake plan/limits; anything that truly needs entitlements
resolves them on demand via `entitlement.service` (fail-closed at use). Wave 7 implements (b).

**Risk if deferred.** None to the owner runtime path — the fabricated entitlements are unconsumed and the real
gate is elsewhere. The only risk was the *fabrication itself*, which (b) removes.

**Tests.** DB test asserts `snapshot.entitlements.resolved === false` (no fabricated `"default"`); billing routes
continue to exercise the real `resolveEntitlements` on-demand path (unchanged).

## DECISION 2 — Adjacent alert/notification honesty debt (documented, out of Wave 7 minimal scope)
These are the same *class* of honesty defect as M4 but are **not** on the escalation-detector owner-runtime path
Wave 7 fixes, and each needs its own schema/product decision. Recorded here so they are not silently buried:

1. **`src/services/alerts/alert-service.ts` references a phantom `db.alert` model.** There is **no `Alert` model**
   in `prisma/schema.prisma` (only a comment), so `db.alert.create/findFirst/...` throw
   `db.alert.* is not a function` (confirmed by 2 failing `alert-service.test.ts` cases). This is a BROKEN-SVC-class
   defect requiring a **schema decision** (add an `Alert` model + migration, or delete the dead service). Out of
   Wave 7's migration-free scope. **Recommendation:** treat as a dedicated follow-up (schema memo) — do not add a
   model speculatively.
2. **`src/services/notifications/notification-service.ts` claims `status: "sent"` from a `Math.random() > 0.05`
   simulator** ("Mock-backed for non-DB environments"). Honesty debt: it advertises a full delivery-tracking shape
   that is entirely simulated. Building a real channel is explicitly out of scope; an honest fix would label the
   simulated results as such. **Recommendation:** follow-up honesty label on the notification subsystem.
3. **`src/services/execution/action-handlers.ts::handleEmailAction` returns `success: true`** after a log-only
   stub ("Email action triggered (stub)"). Honesty debt: a no-op reported as success. **Recommendation:** follow-up
   — return an honest non-delivered result (kept out of Wave 7 to avoid touching the execution-action contract in a
   honesty-label-only wave).

**Why non-blocking for the owner shadow-pilot runtime path.** The escalation **detectors** (the wired path:
Phase-7 re-eval + `escalation-checks` route) are what surface governed escalations to the owner; Wave 7 makes those
honest. The alert-service/notification/action-handler subsystems above are either non-functional already (phantom
model) or a separate simulated/execution surface not consumed by the owner escalation path. Each is flagged for the
owner as follow-up honesty work, with an explicit recommendation, per "do not bury blockers as deferred unless the
audit proves non-blocking."
