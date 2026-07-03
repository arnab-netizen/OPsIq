# OpsIQ Wave 7 — M1/M4 Governance Honesty (Plan-First)

> Follow-up wave closing two MILESTONE_RUNTIME_PARTIAL items. Standard:
> `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (auth-path honesty + governed-alert
> honesty). Branch `claude/runtime-readiness-wave7-governance-honesty`, base `main @ de782756`.
> **CI is NOT triggered by this plan.** Written before implementation.

## M1 — Fabricated verified-session authz state

### Defect (verified)
`CanonicalVerifiedSessionBuilder` (`src/lib/canonical-verified-session.ts:182-223`) — the single "verified session
snapshot" builder, called once per request by the canonical auth wrapper — **hardcodes** authorization facts it
never verified:
- `workspace.name = input.workspaceId` (the ID, not the name), `workspace.isActive = true`
- `membership.isActive = true`, `membership.joinedAt = now`
- `roles[].grantedAt = now`, `engagementMemberships[].joinedAt = now`
- `entitlements = { planId: "default", featureFlags: {}, limits: {} }`

Each is a `// TODO: Fetch…` placeholder. The "verified" snapshot therefore asserts workspace/membership/entitlement
facts that were never read from the DB — a governance-honesty violation (CLAUDE.md: "no fake implementations").

### Blast radius (recon)
The handler-facing `CanonicalAuthContext.verifiedSessionSnapshot` exposes only 6 fields (`snapshotId,
snapshotTimestamp, snapshotHash, actorId, workspaceId, capabilities`) — the fabricated `workspace.isActive` /
`entitlements` are **not** projected to handlers and **no production gate reads them** (the real `isActive` gate is
enforced separately in `auth.ts` / `workspace-enforcement.ts`; real entitlement checks run on-demand via
`entitlement.service.assertCapability`). So this is honesty debt, not a live auth hole — which also means the fix
must not introduce new per-request failure modes.

### Fix (minimum-code, safe, real-data)
1. **Real workspace + membership** (the named "Fetch real workspace.isActive"): the wrapper
   (`src/lib/canonical-route-enforcement.ts` STEP 6) resolves the real record via one indexed lookup
   (`workspaceMembership.findFirst` on the already-verified `workspaceId` + `session.user.id`, selecting
   `isActive, addedAt, workspace{ name, isActive }`) and passes real `workspaceName / workspaceIsActive /
   membershipIsActive / membershipJoinedAt` into the builder. Extracted as an exported helper
   `resolveWorkspaceSnapshotFacts(workspaceId, userId)` so it is DB-testable in isolation.
2. **Builder stops fabricating**: those four become **required** constructor inputs; the builder records the real
   values instead of `input.workspaceId` / `true` / `now`. `membership.joinedAt` = real `addedAt`.
3. **No more fabricated timestamps**: `RoleSnapshot.grantedAt` and `EngagementMembershipSnapshot.joinedAt` widen to
   `Date | null` and are set to `null` (honest "not captured in snapshot") — there is no cheap real source
   (per-role `UserRoleAssignment` grant dates), and these are unconsumed. No fabricated `now`.
4. **Entitlements honest, not fetched in the hot path**: `EntitlementSnapshot` gains `resolved: boolean` and
   `planId: string | null`; the builder sets `{ resolved: false, planId: null, featureFlags: {}, limits: {} }`.
   Real entitlements are **not** resolved per-request (see the decision memo — `resolveEntitlements` fails closed
   and would break every workspace without a seeded subscription). The snapshot now honestly says "entitlements
   not resolved here" instead of claiming a fake `"default"` plan / empty limits as if verified.

No migration. Only `canonical-verified-session.ts`, `canonical-route-enforcement.ts`, and the 16 adversarial-test
call sites (mechanically pass the new real inputs; immutability + `isActive` assertions preserved).

### DB proof
`src/__tests__/phase-e/verified-session-real-facts.db.test.ts`: create an **active** and a **deactivated**
`Workspace` + memberships; `resolveWorkspaceSnapshotFacts` + builder →
- active workspace → `snapshot.workspace.isActive === true`, `workspace.name` = the real name (not the id)
- deactivated workspace → `snapshot.workspace.isActive === false` (proves it is no longer hardcoded `true`)
- `membership.joinedAt` equals the real `addedAt`; `entitlements.resolved === false` (honest, not `"default"`)

## M4 — Log-only escalations/alerts

### Defect (verified)
The escalation detectors (`src/services/escalation.ts`: `detectHighPriorityOverdueActions`,
`detectKPIDeteriorationPattern`, `checkEngagementEscalations`) build an in-memory `EscalationAlert`, emit an audit
event, and `logger.warn` — **nothing is persisted and nothing is delivered** to any human channel (no email/push
exists; the notification/alert subsystems are stubs/simulations). The `POST /escalation-checks` route returns the
alerts implying they were "raised," carrying no delivery state. (The GET handler is already honest:
`note: "Escalation check history not yet persisted"`.)

### Fix (honesty label, migration-free — the named "Honesty-label delivery state first")
1. `escalation.ts`: add `delivery: "log_only"` to the `EscalationAlert` interface, set it on both alerts, and
   include `delivery: "log_only"` in both audit-event payloads — the record now self-describes as detected +
   audit-logged, **not** delivered.
2. `escalation-checks/route.ts` POST: add `delivery: "log_only"` and an honest `note` to the response, mirroring
   the GET handler's existing honesty.

No delivery channel is built (external integrations are out of scope). No persistence schema is added.

### Proof
Extend `src/__tests__/services/escalation/overdue-escalation.db.test.ts`: assert the returned alert and the emitted
`escalation.high_priority_overdue` audit-event payload both carry `delivery: "log_only"`.

## Decision memo (do not guess) — `OPSIQ_RUNTIME_READINESS_WAVE7_GOVERNANCE_HONESTY_DECISION.md`
- **Per-request entitlement resolution** in the auth hot path: rejected (fails closed → breaks unbilled
  workspaces/tests). Recommend the honest "unresolved in snapshot" representation implemented here; real limits
  stay on the on-demand `entitlement.service` path.
- **Adjacent honesty debt (documented, out of minimal scope, non-owner-runtime-path):** `alert-service.ts`
  references a **phantom `db.alert` model** (no `Alert` model in schema → `db.alert.* is not a function`; needs a
  schema decision); `notification-service.ts` claims `status:"sent"` from a `Math.random()` simulator;
  `execution/action-handlers.ts` `handleEmailAction` returns `success:true` for a stubbed email. Each is honesty
  debt flagged for the owner; none is on the escalation-detector owner-runtime path Wave 7 fixes.

## Classification (candidate)
**`GOVERNANCE_HONESTY_M1_M4_DB_PROVEN`** — the verified-session snapshot reads real workspace/membership state (DB
proof) and stops fabricating entitlements/timestamps; governed escalations honestly label their (non-)delivery
state. Adjacent honesty debt is documented, not buried. Final classification gated on required CI + a hostile audit.

## Out of scope (unchanged, still blocked)
Public SaaS, billing, launch, integrations, building any real notification/email channel. No new engine, no gate
weakening, no migration.
