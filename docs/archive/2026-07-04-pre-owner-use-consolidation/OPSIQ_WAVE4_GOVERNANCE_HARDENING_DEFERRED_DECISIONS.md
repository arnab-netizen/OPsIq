# OpsIQ Wave 4 (GOVERNANCE_HARDENING_SWEEP) — Deferred Decisions

> Governance/auth items found in Wave 4 recon that are NOT clean, migration-free, no-gate-weakening fixes.
> Documented honestly rather than guessed or forced. Each stays as-is until its decision is made.

## DOMAIN/SCHEMA — M4 log-only escalation alerts
`src/services/escalation.ts` `detectKPIDeteriorationPattern` (works) and `detectHighPriorityOverdueActions`
(still queries non-existent `Action.priority`/`dueDate` → throws; a Wave-1-deferred domain decision) build an
`EscalationAlert`, emit an internal audit event, and `logger.warn` — **nothing is delivered** (no email/push, no
delivery record), yet the type/route (`escalation-checks`) imply an alert was raised. A migration-free honesty
label (`deliveryState: "log_only"`) could go in the JSON audit payload + free-form route response, BUT the route
is currently blocked by the broken action detector, so the honest fix requires that `Action.priority`/`dueDate`
domain decision first. Real delivery needs a notification/delivery model (schema). → **owner domain + schema decision.**

## OWNER/PRODUCT — M1 fabricated verified-session authz state
`src/lib/canonical-verified-session.ts` hardcodes `workspace.isActive:true`, `entitlements.limits:{}`,
`planId:"default"`, `name:workspaceId` (TODOs). `Workspace.isActive` and the `Workspace→BillingAccount→
Subscription→Plan→PlanCapability.limit` chain already exist, so a **real read is migration-free**. However: the
fabricated values are **latent** — no live authz gate reads them today (`verifiedSessionSnapshot` does not surface
them; grep found no consumers). A real read adds a DB round-trip to the security-critical per-request hot path for
a value nothing consumes, and enforcing inactive-workspace / limit blocking is **new behavior**. → **owner/product
decision** (perf cost vs. latent value; whether to enforce).

## WRAPPER-ENHANCEMENT / AUTHZ-EQUIVALENCE — 3 route strict-auth violations (kept, not weakened)
`users/[userId]` (PATCH+POST), `leads/[leadId]` (POST), `clients/…/contacts/[contactId]` (DELETE) still use the
legacy `withEnforcementFull`+`withAuth({internalOnly:true})` wrappers with **header-derived** workspace scoping.
The target services accept `CanonicalAuthContext`, audit, validate, and are idempotent/version-checked — they are
**not** broken. The blocker is auth semantics: `withCanonicalEnforcement` has no `internalOnly` option
(`canonical-route-enforcement.ts:420` `requireInternalOnly:false // TODO`), and `withCanonicalPolicyEnforcement`
supports `requireInternalAccess` but does **not** wire `requireWorkspace`. Migrating naively would swap
header-targeted-workspace for session-workspace and could **weaken the internal-only admin gate**. → needs a
**wrapper enhancement** (add `internalOnly`+workspace to canonical) or an **authz-equivalence decision** before a
safe migration. Not attempted here (would risk a gate).

## SCHEMA — ClientContact optimistic concurrency
`updateContact`/`deactivateContact` do a bare `db.clientContact.update` with no version check; `ClientContact` has
no `version` column. → **needs schema.**

## OWNER SECURITY DECISIONS (not code-fixed here)
- **`demo-password-123`** committed in `src/infra/seed.ts` + `src/app/api/internal/login-diagnostic/route.ts`.
  Clean hardening = single env-overridable source + a hard non-prod guard on the seed so it can never provision the
  demo admin against a real DB. Rotation/removal of the known literal is an owner call.
- **TLS `rejectUnauthorized:false`** unconditional in all envs (`src/lib/db.ts`, `src/infra/seed.ts`) — disables
  Postgres cert verification in prod (common for managed PG self-signed chains, but a real MITM surface). → owner
  sign-off / CA-bundle decision.
- **Ungated metadata endpoints** `internal/build-info` (commit SHA + `VERCEL_ENV`, unauthenticated) and
  `internal/startup` (unauthenticated startup trigger + readiness) — low sensitivity; gating vs. keeping as health
  probes is an owner decision.

## MUST STAY FROZEN
The 31 `raw-error-message` governance findings are server-side classification/log strings (not operator-rendered)
— legitimately frozen in `.claude/governance-baseline.json`.

## KEEP (not delete) — unrouted groundwork with test coverage
`persistFileIntake`, `submitStructuredImport`, `import-persistence.service`, `business-facts/intake-adapter` have
no production route but ARE backed by tests (intended future wiring) — reported, not deleted.

## Not masked
Nothing above was hidden or worked around. Each remains honestly as-is until its decision is made.
