# Prior Claim Reconciliation
**Date:** 2026-07-12  
**Purpose:** Verify accuracy of prior broad closure claims against actual repository state.

---

## Claim 1: "Stage A7.7: repository-wide workspace isolation closure"

**Where claimed:** Execution state entries, commit messages (`STAGE A7.7 Batch N: ...`), multiple audit docs.

**Claim accuracy:** PARTIALLY_ACCURATE / SCOPE_OVERSTATED

**Reality:**
- The claim is TRUE that all targeted routes were migrated on this branch.
- The claim is MISLEADING because "repository-wide" implies main branch coverage. No A7.7 commit has been merged to `origin/main`.
- 311 of 338 routes now use `withCanonicalEnforcement` ON THIS BRANCH. On `origin/main` the pre-A7.7 state persists.
- The 27 routes without `withCanonicalEnforcement` are all legitimate exceptions — this part of the claim is accurate.

**Corrected statement:** "All targeted routes on `claude/phase-6f-governance-findings-5gkiec` use `withCanonicalEnforcement`. Fix is BRANCH_ONLY — not merged to main as of 2026-07-12."

---

## Claim 2: "DC-02 closure: requireWorkspaceContext callers removed"

**Where claimed:** Commit `e2df9bb8`, execution_state batch12 entry.

**Claim accuracy:** ACCURATE with residual caveat

**Reality:**
- All 6 identified callers were removed. The commit `e2df9bb8` correctly documents the migration.
- `src/services/workspace/context.ts` itself still exists and exports `requireWorkspaceContext`.
- The DC-02 allowlist entry for `src/services/workspace/context.ts` is correct — it prevents the gate from flagging the function's own definition, not an unauthorized caller.
- No external callers remain (verified: `grep -rn requireWorkspaceContext src/ --exclude="context.ts"` returns only `src/lib/service-auth.ts` which has a DIFFERENT function of the same name taking a `string` parameter, not calling the session-based version).

**Corrected statement:** "DC-02 closure is accurate. context.ts is an orphan — no external callers. The file itself is not a caller. service-auth.ts::requireWorkspaceContext is a different function (string param) unrelated to session-based context.ts version."

---

## Claim 3: "DB_BLOCKED classification for A7.7 — DATABASE_URL unreachable"

**Where claimed:** A7.7 BASELINE.md, execution_state.json `DB_BLOCKED_ENVIRONMENT_NETWORK`, multiple batch entries.

**Claim accuracy:** ACCURATE but INCOMPLETE

**Reality:**
- The Neon DATABASE_URL IS network-unreachable from this executor environment. This part is accurate.
- HOWEVER: `.github/workflows/ci.yml` provisions a `postgres:16` service container and runs `TEST_WITH_DB=true npm test`. The CI DB proof lane EXISTS and works.
- A7.7 claims of `DB_BLOCKED` referred specifically to this executor's inability to reach Neon. They did NOT claim the CI DB lane was unavailable.
- The BASELINE.md note covers this: "CI workflow provisions PostgreSQL service with `TEST_WITH_DB=true` and runs the full suite including DB tests. DB-proof items are classified DB_BLOCKED_ENVIRONMENT_NETWORK with proof delegated to CI."

**Corrected statement:** "DB_BLOCKED classification is accurate for this executor. CI has a working DB proof lane (postgres:16 service). DB tests run in CI on push. The branch has never been pushed far enough to verify CI green status against the postgres:16 lane."

---

## Claim 4: "logAuditEvent → emitAuditEvent migration: all 19 production sites"

**Where claimed:** Commit `568e18b8`, execution_state batch14 entry.

**Claim accuracy:** ACCURATE

**Reality:**
- `src/services/audit/audit-log.ts` no longer exists (deleted in Batch 14).
- DC-06 gate prevents re-import.
- 23 typed event name constants added to `AUDIT_EVENTS`.
- No `logAuditEvent` callers found (verified: DC-06 gate passes with empty result).

**Corrected statement:** "Migration is complete on this branch. Legacy module deleted. Gate prevents regression. Fix is BRANCH_ONLY."

---

## Claim 5: "A7.6: DC-A7.6-I1 workspace isolation closure — 12 routes hardened"

**Where claimed:** Commit `3a40fd76`.

**Claim accuracy:** ACCURATE for scope stated

**Reality:**
- This commit is 50 commits ahead of main and is on the branch.
- The 12 routes referenced were indeed hardened on the branch.
- This work was done before the current A7.7 batch numbering.

**Corrected statement:** "Accurate for scope. BRANCH_ONLY — not merged."

---

## Claim 6: "Fail-closed audit hardening: evaluate/route.ts .catch() removed"

**Where claimed:** Commit `4ce3f184`, execution_state batch15 entry.

**Claim accuracy:** ACCURATE for the specific instance

**Reality:**
- The specific `.catch()` on the post-mutation `emitAuditEvent` in evaluate/route.ts was removed.
- HOWEVER: No comprehensive scan was done for ALL post-mutation audit calls that might have `.catch()` after the Batch 15 fix. The scope claim ("evaluate route is now the last known instance") relies on prior phase documentation.
- The Batch 15 entry documents this as "Phase 6J final instance" — this is a CLAIM not a VERIFIED SCAN.

**Corrected statement:** "Evaluate route instance confirmed removed. Claim of 'final instance' is UNVERIFIED — no post-fix comprehensive scan of all write-path audit calls was documented."

---

## Claim 7: "15 recurrence-prevention gates installed" (later updated to 18)

**Where claimed:** Commit `9bb463ac` (15 gates), Batch 18 (`59f7e246`) (18 gates).

**Claim accuracy:** ACCURATE for gate count. MISLEADING about enforcement.

**Reality:**
- 18 gates DO exist in `scripts/a77-prevention-gates.ts`.
- ALL 18 pass on the current branch HEAD.
- CRITICAL: `npm run governance:scan:a77` is NOT in `.github/workflows/ci.yml`. The claim that gates "prevent" recurrence is only true if someone runs `npm run governance:scan:a77` locally before pushing. In CI, these gates do not run and do not block merge.

**Corrected statement:** "18 gates installed and passing. Gates are NOT enforced in CI — `governance:scan:a77` is absent from `.github/workflows/ci.yml`. The effective prevention relies on local discipline, not automated enforcement."

---

## Claim 8: "auth-governance-scanner catches all auth violations"

**Where claimed:** Implicitly by wiring `governance:scan:auth` into CI.

**Claim accuracy:** STALE / PARTIALLY_INACCURATE

**Reality:**
- `scripts/auth-governance-scanner.ts` detects: `withRequestContext` (forbidden), raw `throw new Error("Unauthorized")`, `Response.json(401/403)`, direct `getSession()` in routes.
- It does NOT detect: missing `withCanonicalEnforcement`, use of legacy `withEnforcementFull`, use of `enforceWorkspaceScoping` without canonical enforcement.
- STALE: The scanner's remediation guidance still recommends `withEnforcementFull` ("withRequestContext is forbidden. Use withEnforcementFull.") — this was superseded by A7.7 which established `withCanonicalEnforcement` as the canonical standard.
- The CI auth scanner is looking for the wrong canonical pattern (withEnforcementFull vs withCanonicalEnforcement).

**Corrected statement:** "auth-governance-scanner enforces a subset of auth patterns but is stale: recommends `withEnforcementFull` which A7.7 replaced with `withCanonicalEnforcement`. It does not detect non-canonical wrappers in the current A7.7 sense. Required action: update scanner to detect `withEnforcementFull` (now legacy) and recommend `withCanonicalEnforcement`."

---

## Claim 9: "DC-01 hostile adjudication: branded workspace identity separation"

**Where claimed:** Commit `034cab64`, execution_state batch13 entry.

**Claim accuracy:** ACCURATE for code changes made

**Reality:**
- `ClaimedWorkspaceId` and `VerifiedWorkspaceId` branded types were introduced.
- `asVerifiedWorkspaceId()` conversion restricted to canonical enforcement module.
- DC-16, DC-17 gates prevent poisoning patterns.
- All 8 x-workspace-id readers are now typed as `ClaimedWorkspaceId`.

**Corrected statement:** "Accurate. Branded types correctly separate claimed from verified identity. BRANCH_ONLY — not merged."

---

## Summary Table

| Claim | Accuracy | Key Issue |
|-------|----------|-----------|
| Repository-wide workspace isolation | PARTIALLY_ACCURATE | "Repository-wide" overstated — BRANCH_ONLY |
| DC-02 closure: callers removed | ACCURATE | context.ts orphan is acceptable; no real callers |
| DB_BLOCKED classification | ACCURATE but INCOMPLETE | CI has DB lane; only this executor is blocked |
| logAuditEvent migration: 19 sites | ACCURATE | Complete; module deleted |
| A7.6: 12 routes hardened | ACCURATE | BRANCH_ONLY |
| Fail-closed audit hardening | ACCURATE for specific instance | "Final instance" claim UNVERIFIED |
| 18 prevention gates installed | ACCURATE — misleading about enforcement | Gates NOT in CI; local-only enforcement |
| auth-governance-scanner catches all auth violations | STALE / INACCURATE | Scanner is stale; doesn't detect missing `withCanonicalEnforcement` |
| DC-01 branded workspace identity | ACCURATE | BRANCH_ONLY |
