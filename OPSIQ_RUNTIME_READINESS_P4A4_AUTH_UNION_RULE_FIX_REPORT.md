# OpsIQ Runtime-Readiness — P4-A4 Auth-Union Rule False-Positive Report

> Fourth P4 slice toward blocker **B4**. Fixes a **substring false-positive** in the `auth-enforcement/strict-auth`
> ESLint rule so legitimate `CanonicalAuthContext | null` signatures are no longer flagged as "auth-context union
> mixing". Drives strict-auth **13 → 10**. Pure rule-correctness fix — no product source or behaviour changes; the rule
> still catches a genuine `AuthContext | CanonicalAuthContext` union.

## Branch & base
- Branch: `claude/runtime-readiness-p4a4-service-auth-union`
- Base HEAD: `2146f18` (main; after P4-A3 #90 merged).

## The gap (part of B4)
Rule 2 (`noAuthContextUnion`) is meant to flag a union that MIXES the legacy `AuthContext` and the new
`CanonicalAuthContext`. It built the type list with `.join("|")` and then did a **substring** check:
```js
const typeNames = [...].map(t => t.typeName.name).join("|");
if (typeNames.includes("AuthContext") && typeNames.includes("CanonicalAuthContext")) { report }
```
`"CanonicalAuthContext"` **contains the substring** `"AuthContext"`, so `CanonicalAuthContext | null | undefined`
matched both `includes(...)` checks and was falsely reported. That produced 3 bogus strict-auth errors:
- `src/lib/service-auth.ts:19` and `:49` — `requireServiceAuth` / `requireServiceContext`
  (`authContext: CanonicalAuthContext | null | undefined`).
- `src/app/api/internal/owner-dashboard-runtime-proof/route.ts:16` — `Promise<CanonicalAuthContext | null>`.

Verified there is **no genuine `AuthContext | CanonicalAuthContext` union** anywhere in `src` (grep), so all 3 were
false positives; the correct signatures are legitimately nullable.

## What was implemented
Made the rule match type names **exactly** (array membership) instead of as substrings — dropped the `.join("|")`:
```js
const typeNames = [...].map(t => t.typeName.name);   // array, not "|"-joined string
if (typeNames.includes("AuthContext") && typeNames.includes("CanonicalAuthContext")) { report }
```
`["CanonicalAuthContext"].includes("AuthContext")` is `false`, so nullable canonical signatures pass; a real
`[AuthContext, CanonicalAuthContext]` union still trips both checks and is reported. The fix only makes the rule
**more precise** — it can remove false positives, never hide a genuine mix.

## Files changed
- CHANGED `src/governance/eslint-auth-enforcement.js` (exact type-name matching for Rule 2)
- NEW `OPSIQ_RUNTIME_READINESS_P4A4_AUTH_UNION_RULE_FIX_REPORT.md`

## DB / migration changes
**None.** **API / product source:** **none** — only the ESLint rule changed. **UI:** none.

## Tests / checks run (local)
- **strict-auth**: `eslint .` → **13 → 10**; the 3 union-mixing violations (`service-auth.ts` ×2, the internal route
  ×1) are gone; **0 union-mixing violations remain**.
- `tsc --noEmit` ✓ (no source change).
- **Auth route scanner** (`governance:scan:auth`, blocking CI gate): **"All routes comply"**.
- `lint:ratchet` **PASS** — errors **2092 → 2089**; warnings unchanged; **0 new**.

## Honest scope (not overclaimed)
- Removes 3 **false-positive** strict-auth violations by correcting the rule. The remaining **10** are genuine and
  deferred to careful per-route follow-up slices:
  - Routes actively using legacy auth (`withEnforcementFull` / `withAuth` / `getActorHierarchyLevel`):
    `clients/[clientId]/contacts/[contactId]`, `engagements/[engagementId]/intervention`, `leads/[leadId]`,
    `users/[userId]`, `users/[userId]/roles` — each a real migration to the canonical wrapper, with route tests.
  - `phase-g/g6r-auth-bridge.test.ts` (×1) — a cast inside the bridge test.
- **B4 stays open** until the remaining 10 reach 0 and security/isolation tests are un-quarantined.

## Classification
**`P4_AUTH_UNION_RULE_FIXED`** (eslint + tsc + auth-scanner + ratchet): the strict-auth union rule no longer
false-positives on nullable canonical signatures; still catches genuine mixing; no gate weakened, no source changed.

## Merge recommendation
Open PR; drive CI green (blocking governance + auth-scan must pass — they do locally). After merge, the remaining B4
strict-auth work is the 5 active-legacy-auth route migrations (each small, with tests), then un-quarantining security
tests in batches. Public SaaS / billing / launch / integrations remain out of scope and blocked.
