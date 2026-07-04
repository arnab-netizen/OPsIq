# OpsIQ Runtime-Readiness — P4-A3 Auth-Guard Unsafe-Cast Report

> Third P4 slice toward blocker **B4**. Removes the 3 `as any` unsafe casts from the capability-enforcement helper
> `requireCapabilityForService` in `src/lib/auth-guard.ts`, driving the eslint `auth-enforcement/strict-auth` count
> **16 → 13**. Type-safety improvement on a security-critical function; behaviour is identical (same properties read).

## Branch & base
- Branch: `claude/runtime-readiness-p4a3-authguard-casts`
- Base HEAD: `1957b5a` (main; after P4-A2 #89 merged).

## The gap (part of B4)
`requireCapabilityForService(authContext, capability, scope)` bridges the legacy `AuthContext` (has `policy`) and the
new `CanonicalAuthContext` (has `verifiedCapabilities`). It read those properties through **`(authContext as any)`**
casts — 3 unsafe casts flagged by the strict-auth rule (`noUnsafeCast`). Unsafe `any` casts in a function that decides
whether a caller HAS a capability are exactly the kind of type hole that can silently mis-authorize.

## What was implemented
Replaced the 3 `as any` casts (and a redundant `as AuthContext`) with **one typed structural narrowing**:
```ts
const ctx = authContext as { policy?: PolicyContext; verifiedCapabilities?: Set<string> };
if (ctx.policy) {
  requireCapability(ctx.policy, capability, scope);
} else if (ctx.verifiedCapabilities) {
  if (!ctx.verifiedCapabilities.has(capability)) throw new ForbiddenError(`Capability required: ${capability}`);
}
```
Both union members are assignable to that shape, so property access stays **type-checked** — no `any`. The control
flow (policy path → `requireCapability`; else verifiedCapabilities path → set membership) is unchanged, so the
authorization decision is identical.

## Files changed
- CHANGED `src/lib/auth-guard.ts` (`requireCapabilityForService`: typed narrowing instead of `as any`)
- NEW `OPSIQ_RUNTIME_READINESS_P4A3_AUTHGUARD_CASTS_REPORT.md`

## DB / migration changes
**None.** **API:** none. **UI:** none.

## Tests / checks run (local, Postgres)
- `tsc --noEmit` ✓ (the typed narrowing compiles; access is checked).
- **strict-auth**: `eslint .` → **16 → 13**; `auth-guard.ts` now has **0** strict-auth violations.
- **Auth route scanner** (`governance:scan:auth`, now a blocking CI gate): **"All routes comply"**.
- **Governance scan** (`governance:scan`): **0 new** (32 frozen findings unchanged).
- `lint:ratchet` **PASS** — errors **2098 → 2092**; warnings unchanged; **0 new**.
- Auth no-regression: `g6r-auth-bridge` (the direct auth-bridge test) + api actions/decisions/webhooks/experiments →
  **370 passed, 11 skipped**. The one failing file (`first-value.test.ts`) is a **pre-existing, unrelated** broken
  `@/lib/db` vitest mock that skips its 11 tests at setup — verified identical on clean `main` (stash-checked).

## Honest scope (not overclaimed)
- Fixes the 3 auth-guard unsafe-cast violations only. Remaining **13** strict-auth violations are deferred to careful
  follow-up slices:
  - `service-auth.ts` (union type mixing ×2) and `internal/owner-dashboard-runtime-proof` (×1) — auth-context union
    refactors.
  - Routes actively using legacy auth: `clients/[clientId]/contacts/[contactId]`, `engagements/[engagementId]/
    intervention`, `leads/[leadId]`, `users/[userId]`, `users/[userId]/roles` — per-route migration to the canonical
    wrapper, each with route tests.
  - `phase-g/g6r-auth-bridge.test.ts` (×1) — a cast inside the bridge test.
- **B4 stays open** until the remaining 13 reach 0 and security/isolation tests are un-quarantined.

## Classification
**`P4_AUTHGUARD_CASTS_REMOVED`** (tsc + auth-scanner + ratchet + auth no-regression): the capability-enforcement helper
is now type-checked (no `any`); the authorization decision is unchanged; no gate weakened.

## Merge recommendation
Open PR; drive CI green (the blocking governance + auth-scan steps must pass — they do locally). After merge, next
P4-A slices: `service-auth.ts` union refactor, then the per-route legacy-auth migrations (each small, with tests),
then un-quarantine security tests in batches. Public SaaS / billing / launch / integrations remain out of scope.
