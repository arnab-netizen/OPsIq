# OpsIQ Runtime-Readiness — P4-A2 Strict-Auth Dead-Imports Report

> Second P4 slice toward blocker **B4**. Drives the eslint `auth-enforcement/strict-auth` violation count **30 → 16**
> by removing DEAD legacy-auth imports from 7 canonical routes. Pure cleanup — the removed imports were unused (tsc
> confirms), so there is zero behaviour change. Strengthens the gate; weakens none, lowers no threshold, deletes no test.

## Branch & base
- Branch: `claude/runtime-readiness-p4a2-strict-auth-eslint`
- Base HEAD: `960b0dc` (main; after P4-A1 #88 merged — auth scanner now blocking).

## The gap (part of B4)
The `auth-enforcement/strict-auth` eslint rule reports **30** violations on `main` (frozen in the lint baseline). The
largest category is *"legacy auth import in canonical route"* — a route wraps its handlers in the canonical
`withCanonicalEnforcement` but still imports legacy auth modules (`@/lib/enforced-route`, `@/lib/auth-guard`). In 7 of
those routes the legacy imports were **completely unused** (dead), left behind by a half-finished migration.

## What was implemented
Removed the two dead legacy-auth import lines
(`import { withEnforcementFull } from "@/lib/enforced-route";` and
`import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";`) from each of:
- `clients/[clientId]/route.ts`, `clients/[clientId]/contacts/route.ts`
- `diagnosis/route.ts`
- `engagements/route.ts`, `engagements/[engagementId]/route.ts`, `engagements/[engagementId]/actions/[actionId]/route.ts`
- `evidence-bundles/route.ts`

Each imported symbol appeared **only** on its import line (verified by occurrence count), so removal is behaviour-neutral;
`tsc --noEmit` passes (the imports were genuinely unused). The routes keep using `withCanonicalEnforcement`.

## Files changed
- CHANGED (14 line deletions across) the 7 routes above.
- NEW `OPSIQ_RUNTIME_READINESS_P4A2_STRICT_AUTH_DEADIMPORTS_REPORT.md`

## DB / migration changes
**None.** **API:** no contract change. **UI:** none.

## Tests / checks run (local, Postgres)
- `tsc --noEmit` ✓ (confirms the removed imports were unused).
- **strict-auth**: `npx eslint .` → strict-auth violations **30 → 16**.
- `lint:ratchet` **PASS** — errors **2112 → 2098** (−14 strict-auth) and warnings 1263→1240 (the dead imports also
  carried unused-var warnings); **0 new** errors/warnings.
- No-regression: route-domain suites (clients / engagements / diagnosis / evidence-bundles) → **1137 passed, 29
  skipped, 1 failed** across 45 files. The **2 failing files are pre-existing and unrelated** — the legal-text
  `diagnosis-legal-governance-textual` boundary guard, and `demo-engagement-proof-backfill` (a broken `@/lib/db` vitest
  mock that skips its 29 tests at setup) — both verified identical on clean `main` (stash-checked). Neither is touched
  by this diff.

## Honest scope (not overclaimed)
- Clears the 14 **dead-import** strict-auth violations only. The remaining **16** are NOT dead code and need real,
  security-sensitive work, deferred to careful follow-up slices:
  - Routes that actively USE legacy auth (`withEnforcementFull` / `withAuth` / `canonicalizeAuthContext` /
    `getActorHierarchyLevel` in the body): `clients/[clientId]/contacts/[contactId]`,
    `engagements/[engagementId]/intervention`, `leads/[leadId]`, `users/[userId]`, `users/[userId]/roles` — each is a
    genuine migration to the canonical wrapper, done per-route with route tests.
  - The auth **libraries themselves**: `src/lib/auth-guard.ts` (unsafe casts on the auth object, ×3),
    `src/lib/service-auth.ts` (union type mixing, ×2), plus `internal/owner-dashboard-runtime-proof` (×1) and the
    `phase-g/g6r-auth-bridge` test (×1) — these touch auth internals and warrant their own reviewed slice.
- **B4 stays open** until the remaining 16 strict-auth violations reach 0 and the security/isolation tests are
  un-quarantined.

## Classification
**`P4_STRICT_AUTH_DEADIMPORTS_CLEARED`** (tsc + ratchet + no-regression): 14 dead-import strict-auth violations removed
with zero behaviour change; auth-route scanner (P4-A1) stays green; no gate weakened.

## Merge recommendation
Open PR; drive CI green before merge. No new browser spec. After merge, next P4-A slices: migrate the 5 active-legacy-
auth routes to the canonical wrapper (per-route, with tests), then the auth-lib cast/union fixes, then un-quarantine
security tests in batches — each a small reviewed PR. Public SaaS / billing / launch / integrations remain out of scope.
