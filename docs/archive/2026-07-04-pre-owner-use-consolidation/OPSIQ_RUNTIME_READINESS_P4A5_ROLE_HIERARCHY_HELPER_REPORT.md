# OpsIQ Runtime-Readiness — P4-A5 Role-Hierarchy Helper Move Report

> Fifth P4 slice toward blocker **B4**. Moves the pure `getActorHierarchyLevel` helper out of the legacy
> `@/lib/auth-guard` module into `@/policies/capability-check` so the `users/[userId]/roles` canonical route no longer
> imports a legacy auth module — clearing that strict-auth violation. Drives strict-auth **10 → 9**. Behaviour-neutral
> (the function is moved verbatim; a back-compat re-export is kept).

## Branch & base
- Branch: `claude/runtime-readiness-p4a5-role-hierarchy-helper`
- Base HEAD: `f1f1dba` (main; after P4-A4 #91 merged).

## The gap (part of B4)
`src/app/api/users/[userId]/roles/route.ts` is a canonical route (`withCanonicalEnforcement`) but imported the pure
helper `getActorHierarchyLevel` from `@/lib/auth-guard` — a legacy auth module — tripping the strict-auth rule
("legacy auth import in canonical route"). Unlike the earlier dead-import cases, the helper is **actually used** (two
call sites), so the fix is to relocate it, not delete the import.

## What was implemented (behaviour-neutral relocation)
- **`@/policies/capability-check.ts`**: added `getActorHierarchyLevel(ctx: PolicyContext): number` — right beside its
  dependencies `highestRole` and `ROLE_HIERARCHY`, which already live there. Same logic (highest role → hierarchy
  level, −1 when none).
- **`@/lib/auth-guard.ts`**: removed the local definition and now **re-exports** it
  (`export { getActorHierarchyLevel } from "@/policies/capability-check"`) for back-compat; removed the now-unused
  `highestRole` and `ROLE_HIERARCHY` imports.
- **`users/[userId]/roles/route.ts`**: imports `getActorHierarchyLevel` from `@/policies/capability-check` — no legacy
  auth import remains; the route's actual auth flow (`withCanonicalEnforcement`, capability checks) is untouched.

`getActorHierarchyLevel` is a pure function of `PolicyContext`; moving it changes no behaviour.

## Files changed
- CHANGED `src/policies/capability-check.ts` (define `getActorHierarchyLevel`)
- CHANGED `src/lib/auth-guard.ts` (re-export; drop unused imports)
- CHANGED `src/app/api/users/[userId]/roles/route.ts` (import from policies module)
- NEW `OPSIQ_RUNTIME_READINESS_P4A5_ROLE_HIERARCHY_HELPER_REPORT.md`

## DB / migration changes
**None.** **API:** no contract change. **UI:** none.

## Tests / checks run (local, Postgres)
- `tsc --noEmit` ✓.
- **strict-auth**: `eslint .` → **10 → 9**; `users/[userId]/roles` now has **0** violations.
- **Auth route scanner** (`governance:scan:auth`, blocking gate): **"All routes comply"**.
- **Governance scan**: **0 new** (line shifts in auth-guard / capability-check didn't break any frozen finding key).
- `lint:ratchet` **PASS** — errors **2089 → 2088**; 0 new.
- No-regression: capability-check / auth-facts / capability-resolver / g6r-auth-bridge / policy-wrapper-enforcement /
  authorization / signup-owner-permissions suites → **97 passed, 22 skipped, 0 failed**.

## Honest scope (not overclaimed)
- Clears the one strict-auth violation reachable by relocating a **pure** helper. The remaining **9** are genuine and
  need real per-route migration to the canonical wrapper (each with route tests), deferred to careful follow-up slices:
  - `clients/[clientId]/contacts/[contactId]`, `engagements/[engagementId]/intervention`, `leads/[leadId]`,
    `users/[userId]` — these actively use `withEnforcementFull` / `withAuth` / `canonicalizeAuthContext`.
  - `phase-g/g6r-auth-bridge.test.ts` (×1) — a cast inside the bridge test.
- **B4 stays open** until the remaining 9 reach 0 and security/isolation tests are un-quarantined.

## Classification
**`P4_ROLE_HIERARCHY_HELPER_RELOCATED`** (tsc + auth-scanner + ratchet + auth no-regression): a pure role-hierarchy
helper now lives in the policies layer; the canonical route imports no legacy auth module; behaviour unchanged; no gate
weakened.

## Merge recommendation
Open PR; drive CI green (blocking governance + auth-scan must pass — they do locally). After merge, the remaining B4
strict-auth work is the 4 active-wrapper route migrations (each small, security-sensitive, with route tests) — the
higher-risk core of B4, best done one deliberate PR at a time. Public SaaS / billing / launch / integrations remain out
of scope and blocked.
