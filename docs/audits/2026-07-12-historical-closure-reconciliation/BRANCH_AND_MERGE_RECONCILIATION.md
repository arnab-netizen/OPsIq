# Branch and Merge Reconciliation
**Date:** 2026-07-12  
**Purpose:** Document exactly what exists on main vs this branch; classify every fix's merge status.

---

## Branch Configuration

| Field | Value |
|-------|-------|
| Working branch | `claude/phase-6f-governance-findings-5gkiec` |
| Branch HEAD | `59f7e246` |
| `origin/main` HEAD | `8aef45a5` |
| Merge base | `8aef45a5` |
| Commits ahead of main | **48** |
| Commits behind main | **0** |
| Divergence date | After `8aef45a5` (docs: permanent PR cost control) |

---

## What Reached `origin/main` (Confirmed)

| Commit | Phase | What It Contains |
|--------|-------|-----------------|
| `8aef45a5` | Docs | PR cost control policy |
| `bbaea2c4` | Phase R0 | Systemic root-cause invariant closure |
| `80a30870` | Phase 6J | Diagnosis workspace tenant isolation |
| `ae718f19` | A0 | Current-main reality audit |
| `f2bd5e0d` | Phase 6I | Idempotency hardening on 8 decision routes + auth inventory |
| `ef7706b3` | Phase 6F | CAS + atomic audit (second merge) |
| `c8c85c3d` | Phase 6H | Route-level audit pattern hardening (Wave 1) |
| `89b44217` | Phase 6G | Governance audit and lane integrity fixes |
| `8a16d1fa` | Phase 6F | CAS + atomic audit (F1–F4 verified) |
| `e45a15fa` | Phase 6E | Auth workspace invite hardening |
| `c7d80404` | Phase 6D | Approval workflow governance hardening |
| `c68e8029` | Phase 6C | Placebo test conversion wave 2 |
| `110ce297` | Phase 6C-F2 | Systemic raw 500 create defects fixed |
| `b91f977a` | Phase 6C-F1 | Decisions intake raw 500 fixed |
| `6e4df2b9` | Phase 6C | Decisions placebo tests wave 1 |
| `046430b5` | Phase 6B | Security baseline gate integrity restored |
| `bb15a3fa` | Phase 6B | High security vulnerability remediation |
| `0db63972` | Phase 6A | Owner-facing raw 500 defects fixed |

**Conclusion:** Phases 6A through 6J (and Phase R0) are on `origin/main`. All work involving CAS, atomic audit in transactions, fail-closed audit on intake/operator routes, and idempotency hardening is merged.

---

## What Is BRANCH_ONLY (Not On Main)

All 48 commits from `5e97433a` (Phase W1) through `59f7e246` (A7.7 Batch 18).

### Security-Critical BRANCH_ONLY Items

| Commit Range | What It Contains |
|-------------|-----------------|
| `9bb463ac` | 15 recurrence-prevention gates installed (governance:scan:a77) |
| `0aa6b3a0` | DC-07: proof/review body.requiredPermission fix |
| `8be315ba` — `c17a60bb` | DC-02/DC-03: requireWorkspaceContext callers removed; ~50 routes migrated to `withCanonicalEnforcement` |
| `c98ce54e` — `6ef54eba` | DC-03: decisions/*, experiments/*, verify, public/*, webhooks migrated |
| `f4068812` — `9b5be637` | DC-03: 16 more routes migrated (Batches 6–8) |
| `595c86a9` | DC-03: 3 webhook routes migrated |
| `e1cd608c` | DC-03: execute + onboarding routes migrated |
| `c17a60bb` | DC-03: consulting-engine/run + run/route migrated |
| `e2df9bb8` | DC-02: all remaining requireWorkspaceContext callers removed |
| `034cab64` | DC-01: branded workspace identity (ClaimedWorkspaceId/VerifiedWorkspaceId) |
| `857bc8e1` | DC-01 execution state update |
| `568e18b8` | DC-06: logAuditEvent → emitAuditEvent migration (19 sites); audit-log.ts DELETED |
| `bc0a204b` | DC-06 execution state update |
| `e12d406a` | DC-05/DC-06: allowlists tightened |
| `4ce3f184` | DC-15/6J: fail-closed audit on evaluate route |
| `7f786127` | DC-K: isDuplicateRequest wired in run/route |
| `2ebe7716` | DC-L: dead resolveServerRole/role/getSession removed |
| `59f7e246` | DC-18: audit error sanitization in 3 routes + DC-18 gate |
| `3a40fd76` | A7.6-I1: 12 routes hardened |
| `c67fa206` | A7.6-I5-DC06: 4 missing hasPermission() strings fixed |

### Non-Security BRANCH_ONLY Items

| Commit Range | What It Contains |
|-------------|-----------------|
| `5e97433a` — `591bbc58` | Phase W1, P1, Module #8–20 feature work |
| `5b995976` — `ab0b41de` | Startup mode, tender/application assistance |
| `9687831a` | Execution state updates |
| `d8526259` — `d7d274a9` | A6 workflows 1–2 |
| `ae032da6` — `0634c797` | A6 workflows 4–7 |
| `92f827ca` | A6 closure classification |
| `129583ac` — `9ed68667` | A7 BOS validation |

---

## Legacy State on `origin/main` (No A7.7 Fixes Applied)

On `origin/main` as of `8aef45a5`:

| System | State on Main |
|--------|--------------|
| `src/services/audit/audit-log.ts` | **EXISTS** — legacy `logAuditEvent` module present |
| `scripts/a77-prevention-gates.ts` | **DOES NOT EXIST** — gates only on branch |
| `src/lib/workspace-identity.ts` | **DOES NOT EXIST** — branded types only on branch |
| Most routes | Use `withEnforcementFull` / `enforceWorkspaceScoping` / `withAuth` (not `withCanonicalEnforcement`) |
| `src/app/api/decisions/*/route.ts` | All use `withEnforcementFull` on main |
| proof/review `body.requiredPermission` | **PRESENT** on main — client-controlled permission elevation |
| `requireWorkspaceContext` callers in operator/store | **PRESENT** on main |

---

## Merge Risk Assessment

Merging 48 commits with 14,621 insertions and 3,803 deletions is non-trivial. Risk areas:

| Risk | Description |
|------|-------------|
| Route migration conflicts | Any new routes added to main after `8aef45a5` will not have been migrated in A7.7 |
| Import path conflicts | audit-log.ts deletion on branch vs existence on main — TypeScript will catch callers |
| Test conflicts | New tests added on main after `8aef45a5` may conflict with branch test files |
| CI gate changes | `ci.yml` may have changed on main since branch diverged |

**Recommended merge approach:** Rebase or merge with careful conflict resolution, then run all gates before pushing.

---

## Conclusion

| Classification | Count |
|---------------|-------|
| Security fixes merged to main | **Phase 6A–6J + R0 (18+ commits)** |
| Security fixes on branch only | **A7.6–A7.7 (25+ security commits)** |
| Prevention gates merged to main | **0** |
| Gates enforced in CI | **1** (DC-12 via TypeScript) |

The branch is ahead, clean, and contains correct security work. The only blocker to it being real is the merge.
