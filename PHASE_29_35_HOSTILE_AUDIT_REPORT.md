# Hostile Audit Report: Phases 29–35
**Date:** 2026-06-19  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Auditor:** Automated hostile audit (Claude Code)  
**Scope:** Phases 29–35 (Controlled Learning Foundation through Harm/Attribution)

---

## 0. Git Sanity

- Branch: `claude/cool-ptolemy-dxrpm7` — confirmed
- Phase 29–35 commits are all reachable in log
- Worktree: clean (no dirty files)
- Commits:
  - `026e74fd` Phase 29 Slice 1: domain module
  - `8efcb0c1` Phase 29 Slice 2: DB/runtime persistence
  - `33a5aa22` Phase 29 Slice 3: API routes + tests
  - `bd6d7b94` Phase 30: reviews
  - `e06f9f8a` Phase 31: admissions + rejections
  - `ef511d3e` Phase 32: privacy/consent/retention
  - `68bc0096` Phase 33: regression results (4189f73d state update)
  - `4bc46d48` Phase 34: rollout flags + rollback events
  - `a5271566` Phase 35: harm events + attribution reviews

---

## 1. Phase-by-Phase Matrix

| Phase | Description | Schema | Service | API Routes | Tests | Status |
|-------|-------------|--------|---------|------------|-------|--------|
| 29 S1 | Eligibility gate domain module | N/A | Domain only | N/A | controlled-learning.test.ts | DELIVERED |
| 29 S2 | DB/runtime persistence (candidate service) | ✓ | ✓ | N/A | candidate.db.test.ts (68 tests) | DELIVERED |
| 29 S3 | API routes: list/create/promote/reject | N/A | N/A | ✓ (3 routes) | learning-candidates.test.ts (23 tests) | DELIVERED |
| 30 | Controlled Learning Reviews | ✓ | ✓ | MISSING | review.test.ts (25 tests) | SERVICE_ONLY |
| 31 | Admissions + Rejections | ✓ | ✓ | MISSING | admission-rejection.test.ts (33 tests) | SERVICE_ONLY |
| 32 | Privacy/Consent/Retention | ✓ | ✓ (3 svc) | MISSING | privacy.test.ts (40 tests) | SERVICE_ONLY |
| 33 | Regression Results | ✓ | ✓ | MISSING | regression.test.ts (32 tests) | SERVICE_ONLY |
| 34 | Rollout Flags + Rollback Events | ✓ | ✓ (2 svc) | MISSING | rollout-rollback.test.ts (35 tests) | SERVICE_ONLY |
| 35 | Harm Events + Attribution Reviews | ✓ | ✓ (2 svc) | MISSING | harm-attribution.test.ts (45 tests) | SERVICE_ONLY |

**Total tests across all 8 files: 301 — all PASS**

---

## 2. Schema Risks

### 2a. ON DELETE behavior — SAFE
All foreign keys use `ON DELETE RESTRICT ON UPDATE CASCADE`. No cascade-delete of governed/audit records found across any of the 7 migrations.

### 2b. workspaceId presence — COMPLETE
Every new model has `workspaceId TEXT NOT NULL`, workspace FK to `client_accounts`, and a `workspaceId` index.

### 2c. createdAt/updatedAt — COMPLETE
All models have `createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`. All mutable models have `updatedAt`.

### 2d. Migration safety — CLEAN
Checked all 7 migration files (`phase29` through `phase35`): no DROP, no TRUNCATE, no DELETE FROM. All additive.

### 2e. Unique constraint — PRESENT
- `controlled_learning_candidates`: `UNIQUE(workspaceId, auditFingerprint)` — prevents duplicate submissions
- `controlled_learning_admissions`: `UNIQUE(workspaceId, candidateId)` — prevents double-admission

### 2f. RISK: `ControlledLearningRetentionPolicy` has no `candidateId` FK
The `ControlledLearningRetentionPolicy` model relates to `workspace` only, not to a specific candidate. This is an intentional design (workspace-level policy), but if the intent was per-candidate retention, this is a schema gap.

---

## 3. Service Logic Risks

### 3a. CRITICAL RISK: 10 of 11 services skip `assertWorkspaceScopedQuery`

Only `controlled-learning-candidate.service.ts` calls `assertWorkspaceScopedQuery()` at function entry points (7 calls total). The remaining 10 services do NOT call it:

- `controlled-learning-review.service.ts` — 0 calls
- `controlled-learning-admission.service.ts` — 0 calls
- `controlled-learning-rejection.service.ts` — 0 calls
- `controlled-learning-privacy.service.ts` — 0 calls
- `controlled-learning-consent.service.ts` — 0 calls
- `controlled-learning-retention.service.ts` — 0 calls
- `controlled-learning-regression.service.ts` — 0 calls
- `controlled-learning-rollout.service.ts` — 0 calls
- `controlled-learning-rollback.service.ts` — 0 calls
- `controlled-learning-harm.service.ts` — 0 calls
- `controlled-learning-attribution.service.ts` — 0 calls

**Mitigation in place:** All of these services pass `workspaceId` in every Prisma `where` clause. Scoping is enforced at the DB query level, not at the guard level. This means an empty string `""` workspaceId or null-coerced value would not be caught early and could produce an incorrect "not found" result silently rather than throwing. This is a defense-in-depth gap, not a cross-tenant bypass — but it violates the `assertWorkspaceScopedQuery enforced at every domain entry point` invariant stated in the security rules.

### 3b. AI-generated evidence — CORRECTLY BLOCKED at domain level
`src/domain/owner-mode/controlled-learning.ts` defines `EVIDENCE_ORIGIN_FORBIDDEN` = `{ai_generated, synthetic_benchmark, search_snippet_only}`. The `classifyLearningCandidate` function returns `LEARNING_INELIGIBLE_AI_GENERATED` for ai_generated evidence. This is enforced during `createLearningCandidate` in the candidate service (Phase 29 entry point). **However**, the admission service (`Phase 31`) accepts `evidenceOrigin` as an arbitrary string and does NOT re-check against `EVIDENCE_ORIGIN_FORBIDDEN`. If an admission is attempted directly against an already-classified ineligible candidate, the `eligibilityStatus` check at admission time (`startsWith("LEARNING_ELIGIBLE_")`) acts as a second barrier — but this relies on the candidate having been correctly classified, not on re-checking the evidence origin.

### 3c. `promotionLocked` protection — PARTIALLY COVERED
`controlled-learning-candidate.service.ts` correctly blocks promote (line 175) and reject (line 246) on locked candidates. However, no other service checks `promotionLocked` before writing associated records (reviews, admissions). This is acceptable if the domain invariant is that only the candidate record itself is "locked" but associated records may still be written. This should be confirmed as intentional.

### 3d. No automatic learning mutations found — CONFIRMED SAFE
No code path automatically promotes, admits, or modifies a candidate without an explicit human-supplied `approvedBy`/`admittedBy` parameter.

### 3e. Idempotency on admission — PRESENT
`controlled_learning_admissions` has `UNIQUE(workspaceId, candidateId)` and the `admitCandidate` service checks for existing admission before creating. This prevents duplicate admission.

---

## 4. API Coverage Gaps

Only **3 API routes** exist for the entire controlled learning pipeline:

| Step | Route | Status |
|------|-------|--------|
| CREATE candidate | `POST /api/owner/learning-candidates` | HAS_API |
| LIST candidates | `GET /api/owner/learning-candidates` | HAS_API |
| PROMOTE candidate | `POST /api/owner/learning-candidates/[id]/promote` | HAS_API |
| REJECT candidate | `POST /api/owner/learning-candidates/[id]/reject` | HAS_API |
| CREATE/LIST reviews (Phase 30) | None | SERVICE_ONLY |
| ADMIT/REJECT admissions (Phase 31) | None | SERVICE_ONLY |
| Privacy/Consent/Retention controls (Phase 32) | None | SERVICE_ONLY |
| Regression results (Phase 33) | None | SERVICE_ONLY |
| Rollout flags (Phase 34) | None | SERVICE_ONLY |
| Rollback events (Phase 34) | None | SERVICE_ONLY |
| Harm events (Phase 35) | None | SERVICE_ONLY |
| Attribution reviews (Phase 35) | None | SERVICE_ONLY |

No API routes were created for Phases 30–35. Whether this was required by execution.md for these phases was not specified per-phase (the phases may have been scoped as service+schema only). However, there is no runtime path for a human actor to use Phase 30–35 functionality through the application.

---

## 5. Test Adequacy Assessment

| File | Tests | Cross-tenant coverage | Mock vs Real DB |
|------|-------|-----------------------|-----------------|
| controlled-learning-candidate.db.test.ts | 68 | YES (ws-other pattern) | Mock Prisma |
| learning-candidates.test.ts (API) | 23 | YES (via service mock) | Mock |
| controlled-learning-review.test.ts | 25 | YES ("blocks cross-tenant" test at line 129) | Mock Prisma |
| controlled-learning-admission-rejection.test.ts | 33 | YES (ws-other) | Mock Prisma |
| controlled-learning-privacy.test.ts | 40 | PARTIAL (ws-other for consent, not for all privacy fns) | Mock Prisma |
| controlled-learning-regression.test.ts | 32 | YES (ws-other at lines 215, 301) | Mock Prisma |
| controlled-learning-rollout-rollback.test.ts | 35 | PARTIAL (one test at line 320, no rollout cross-tenant test) | Mock Prisma |
| controlled-learning-harm-attribution.test.ts | 45 | YES (ws-other in harm at line 146, attribution at lines 311, 335) | Mock Prisma |
| **TOTAL** | **301** | — | All mock |

**Gaps:**
- No test uses the real DB (`getDbInstance`, real `DATABASE_URL`). All are mock Prisma. DB verification (LANE_B) is required to confirm schema actually works.
- `controlled-learning-rollout.service.ts` has no cross-tenant test (only rollback does).
- `controlled-learning-privacy.service.ts` does not have a dedicated cross-tenant test for the `setPrivacyControl` entry point.
- `controlled-learning-retention.service.ts` tests not in their own file — lumped in privacy test.

---

## 6. Integration Path Gaps

**End-to-end lifecycle has NO runtime path for Phases 30–35.**

A user can create, promote, and reject candidates via the API. They cannot:
- Create a review record through the application
- Admit a candidate through the application
- Record a formal rejection through the application
- Set privacy/consent/retention controls
- Record regression results
- Set rollout flags or rollback events
- Record harm events or attribution reviews

These are service-layer capabilities only. Whether future phases plan to add API routes is unclear from execution.md content inspected.

---

## 7. Local Gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` | PASS (0 errors) |
| `prisma validate` | PASS (valid schema, deprecation warning only) |
| All 8 Phase 29–35 test files | 301/301 PASS |
| Test runtime | 283.5s |

---

## 8. Phase Classification

| Phase | Classification |
|-------|---------------|
| 29 (domain + service + API) | READY_FOR_DB_VERIFICATION — all gates pass, cross-tenant enforced, API complete |
| 30 (reviews) | NEEDS_API_BEFORE_PRODUCTION — service/schema/tests complete, no HTTP surface |
| 31 (admissions/rejections) | NEEDS_API_BEFORE_PRODUCTION — same |
| 32 (privacy/consent/retention) | NEEDS_API_BEFORE_PRODUCTION — same |
| 33 (regression) | NEEDS_API_BEFORE_PRODUCTION — same |
| 34 (rollout/rollback) | NEEDS_API_BEFORE_PRODUCTION — same |
| 35 (harm/attribution) | NEEDS_API_BEFORE_PRODUCTION — same |

**All phases:** Pending DB migration deploy and real-DB smoke test (LANE_B).

---

## 9. Defects Ranked by Severity

| # | Severity | Finding |
|---|----------|---------|
| 1 | HIGH | 10 of 11 services skip `assertWorkspaceScopedQuery` — violates stated security invariant. Effective scoping still present via where-clause, but empty/null workspaceId would not throw early. |
| 2 | HIGH | Phases 30–35 have zero API routes — no runtime access path for any human actor through the web layer. |
| 3 | MEDIUM | Admission service (Phase 31) does not re-validate `evidenceOrigin` against `EVIDENCE_ORIGIN_FORBIDDEN`. Relies on upstream eligibility classification. |
| 4 | MEDIUM | `controlled-learning-rollout.service.ts` has no cross-tenant test case. |
| 5 | LOW | `ControlledLearningRetentionPolicy` has no candidateId FK — possibly intentional but undocumented. |
| 6 | LOW | All tests use mock Prisma — no integration tests against real DB schema. LANE_B required. |
