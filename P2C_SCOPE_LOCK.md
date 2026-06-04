# P2C Scope Lock — Recommendation System Hardening through Business Condition Context

**Date:** 2026-06-04  
**Status:** SCOPE_LOCKED_BEFORE_IMPLEMENTATION  
**Required Before:** Any P2C product/test/schema code changes

---

## 1. Verified P2B Baseline

**Branch:** main  
**HEAD:** a1baa920  
**origin/main:** a1baa920  
**P2B Workflow ID:** 26921421588  
**P2B Result:** 42/42 tests PASSING ✓  
**P2B Classification:** P2B_DB_VERIFIED  

**Baseline Lock:** P2B baseline must remain unchanged throughout P2C development. No reopening of P2B work.

---

## 2. P2C Final Definition

```
P2C = Recommendation System Hardening through Business Condition Context

Purpose:
Use existing business-condition assessment signals to make recommendations safer,
and expose business-condition risk context where recommendations/decisions are 
evaluated, preventing recommendations from presenting false confidence when 
business condition is weak.
```

---

## 3. Scope Reconciliation

### Contradiction Found in Repository

**Source 1:** `MAIN_P2B_STATUS_LOCK.md` (2026-06-02, merge gate document)
```
P2C (Recommendation system hardening) development BLOCKED
```

**Source 2:** `P2B_DB_RESULT_AFTER_DECISION_BC_IMPLEMENTATION.md` (2026-06-04, result document)
```
P2C: Decision Business Condition implementation (when authorized)
```

### Resolution

These two definitions are **reconciled** by treating business-condition assessment as the **hardening context** for recommendation/decision behavior:

- "Recommendation system hardening" = making recommendations safer and more contextual
- "Decision Business Condition implementation" = using BC signals to inform recommendation/decision safety
- **Combined:** P2C hardens recommendations by exposing and integrating business-condition risk context

This means P2C must **use business-condition context to strengthen recommendation behavior**, not implement a separate business-condition system (which already exists).

---

## 4. P2C Objective

P2C must:

✅ Use existing business-condition assessment signals to make recommendations safer  
✅ Expose business-condition risk context where recommendations/decisions are evaluated  
✅ Prevent recommendations from presenting false confidence when business condition is weak  
✅ Preserve P2B outcome verification behavior (do not modify verification, fraud detection, or disputed logic)  
✅ Preserve workspace isolation (all business-condition lookups must respect workspaceId)  
✅ Maintain idempotency and audit trail contracts from P2B  

---

## 5. Non-Goals

P2C must NOT:

❌ Rebuild the entire recommendation engine  
❌ Redesign diagnosis workflow  
❌ Modify P2B outcome verification, fraud detection, or dispute logic  
❌ Modify P2A recommendation lifecycle unless explicitly proven necessary later  
❌ Add schema changes/migrations unless unavoidable and proven necessary  
❌ Add broad route integrations before service-level tests prove behavior  
❌ Create new dashboards or UI features  
❌ Work on growth engine blockers from NEXT_EXECUTION_QUEUE.md  
❌ Change payment/webhook/auth/workspace isolation systems  

---

## 6. Evidence from Repository Inspection

| File | Section | Evidence | Classification |
|------|---------|----------|-----------------|
| MAIN_P2B_STATUS_LOCK.md | Rule 1 | "P2C (Recommendation system hardening) development BLOCKED" | DIRECT_SCOPE_PROOF |
| P2B_DB_RESULT_...BC_IMPLEMENTATION.md | Ready for next phases | "P2C: Decision Business Condition implementation" | DIRECT_SCOPE_PROOF |
| P2B_MINIMAL_BACKBONE.md | Deferred to P2C/Future | "If needed: Add `PATCH /api/operator/:id/verify` in P2C" | INDIRECT_SCOPE_HINT |
| P2B_MINIMAL_BACKBONE.md | Deferred to P2C/Future | "If needed: Extend verificationEvidence JSON or add new field in P2C" | INDIRECT_SCOPE_HINT |
| src/services/business-condition.ts | Exported functions | `assessCondition()`, `getCurrentCondition()`, `getConditionHistory()` | EXISTING_IMPLEMENTATION |
| src/domain/business-condition/business-condition.ts | Domain model | Financial health, owner availability, team capability, customer health | EXISTING_IMPLEMENTATION |
| src/app/api/engagements/[engagementId]/condition/route.ts | Route | GET/POST endpoints for condition assessment | EXISTING_IMPLEMENTATION |
| src/__tests__/domain/business-condition/business-condition.test.ts | Tests | Domain logic tests, in __tests__/ (active) | EXISTING_IMPLEMENTATION |
| src/__ignored_tests__/services/business-condition.test.ts | Tests | Service tests, in __ignored_tests__ (inactive) | EXISTING_BUT_INACTIVE |
| execution.md | Full document | No mention of P2C or P2D | OUT_OF_SCOPE |
| NEXT_EXECUTION_QUEUE.md | Full document | No mention of P2C or P2D | OUT_OF_SCOPE |

**Contradiction Reconciliation:** Two repo documents defined P2C differently → Resolved by scope lock stating P2C = Recommendation hardening using BC context.

---

## 7. Existing Business Condition Inventory

### Exported Functions (from src/services/business-condition.ts)
- `assessCondition(input: CreateConditionProfileInput, authContext: CanonicalAuthContext)` - Creates new business condition profile
- `getCurrentCondition(engagementId: string, workspaceId: string)` - Retrieves current condition
- `getConditionHistory(engagementId: string, workspaceId: string)` - Retrieves historical assessments

### Domain Model (from src/domain/business-condition/business-condition.ts)
- Financial health assessment
- Owner availability and commitment scoring
- Team capability evaluation
- Customer health assessment
- Overall health calculation
- Risk factor identification
- Risk-to-status mapping

### Existing API Route
- **Endpoint:** POST/GET `/api/engagements/[engagementId]/condition`
- **Status:** Active and operational
- **Callers:** Diagnosis service calls assessCondition()

### Existing Test Coverage
- **Active Tests:** `src/__tests__/domain/business-condition/business-condition.test.ts` (financial health, owner availability, team capability, customer health)
- **Inactive Tests:** `src/__ignored_tests__/services/business-condition.test.ts` (service-level tests, currently not running)

### Current Callers/Importers
1. `src/services/diagnosis.ts` - calls assessCondition() during diagnosis creation
2. `src/app/api/engagements/[engagementId]/condition/route.ts` - exposes condition assessment via API
3. Tests (active and ignored)

### Missing Integration Points
- **Decision routes** (`src/app/api/decisions/**`) - DO NOT call business-condition
- **Operator routes** (`src/app/api/operator/**`) - DO NOT call business-condition
- **Recommendation routes** (if exist) - DO NOT call business-condition
- **Outcome evaluation** - Does not check business-condition context

### Existing DB/Schema Dependencies
- Uses existing `BusinessConditionProfile` model (not verified in schema during this analysis)
- Workspace isolation enforced via workspaceId parameter
- Engagement-scoped (one condition per engagement)

---

## 8. P2C Implementation Principle

### Service-First, Test-First, Route-Last

**Meaning:**

1. **Service-first:** Prove business-condition hardening behavior at service and domain level through tests, BEFORE touching any route handlers
2. **Test-first:** Write tests that define expected behavior before modifying code; use tests to drive hardening logic
3. **Route-last:** Only after service-level tests prove behavior should route integration be considered; and only where repo evidence proves a decision/recommendation call path needs it

**Rule:** Do not start by modifying routes. Start by defining what "hardening through business condition context" means at the service layer.

---

## 9. Allowed Initial Files for First Batch

**P2C-BATCH-1 (Business-condition hardening contract tests)** may inspect or modify:

- ✅ `src/services/business-condition.ts` (read existing implementation)
- ✅ `src/domain/business-condition/**` (read existing domain model)
- ✅ `src/__tests__/domain/business-condition/**` (existing active tests)
- ✅ `src/__ignored_tests__/services/business-condition.test.ts` (understand what exists but don't activate yet)
- ✅ `src/__tests__/p2c/**` (new test files for P2C hardening contract)
- ✅ `P2C_SCOPE_LOCK.md` (this document)
- ✅ `P2C_*_RESULT.md` (result documents, only after verified CI)

---

## 10. Forbidden Initial Files

P2C-BATCH-1 must NOT modify:

- ❌ `src/__tests__/p2b/**` (P2B tests are locked)
- ❌ P2B result documents (read-only reference only)
- ❌ `prisma/schema.prisma` (no schema changes)
- ❌ `.github/workflows/**` (no workflow changes yet)
- ❌ Payment/webhook/auth/workspace files
- ❌ `src/app/api/operator/**` (route-last principle)
- ❌ `src/app/api/decisions/**` (route-last principle)
- ❌ `src/app/api/recommendations/**` (if exists - route-last principle)
- ❌ Route files generally (unless later batch explicitly authorizes)

---

## 11. Required First Implementation Batch

### P2C-BATCH-1: Business-Condition Hardening Contract Tests

**Objective:**
Define and test what "recommendation hardening through business-condition context" actually means, at the service/domain level, before any route integration.

**Scope:**
1. Activate or create tests proving how business-condition severity/status maps to recommendation safety signals
2. Define what "weak business condition should harden recommendations" means in concrete test form
3. Verify workspace isolation if any DB-backed condition lookups are needed
4. Avoid route integration (service-first principle)

**Expected Test Topics:**
- Business condition severity mapping to hardening signals
- Workspace isolation in condition assessment
- Condition context enrichment for recommendations (at service level)
- Risk signal extraction from business condition

**Success Criteria:**
- ✅ All new P2C-BATCH-1 tests pass locally and in CI
- ✅ No P2B tests regress
- ✅ No schema changes required
- ✅ No route modifications
- ✅ Service-level hardening behavior is testable

---

## 12. Required Workflow Decision

### Workflow Coverage Check Before Claiming Verification

**Rule:** Do not assume P2B workflow covers P2C.

**Current State:**
- P2B workflow triggers on: `src/services/audit/**, src/services/entitlement.service.ts, src/services/outcome/**, src/services/decisions/**, src/services/operator/**, src/app/api/operator/**, src/app/api/decisions/**, prisma/**`
- P2B workflow DOES NOT trigger on: `src/services/business-condition.ts, src/domain/business-condition/**, src/__tests__/p2c/**`

**Decision Required:**
Before P2C implementation claims verification, the team must explicitly decide:

- **Option A:** Extend P2B workflow to cover P2C paths (governance change)
- **Option B:** Create a new P2C-specific database verification workflow
- **Option C:** Accept that P2C is CI-verified but not P2B-regression-protected
- **Option D:** Require manual P2B workflow trigger for P2C changes

**This decision is made AFTER first batch testing, not before.**

---

## 13. Acceptance Criteria for P2C Scope Lock

This scope lock is complete and accepted when:

✅ P2C definition is explicit: "Recommendation system hardening through business condition context"  
✅ Contradictions are reconciled: Both repo sources reconciled into single definition  
✅ First batch is narrow: Only service-level tests, no route integration  
✅ Allowed/forbidden files are clear: Lists provided above  
✅ No implementation has started: Only documentation created  
✅ Working tree is clean after commit: Only P2C_SCOPE_LOCK.md added  
✅ P2B baseline is retained: a1baa920 unmodified  

---

## 14. Decision Gate

**This scope lock must be reviewed and approved by human decision-maker before P2C-BATCH-1 implementation begins.**

**Clarifications proven by this lock:**
- ✅ P2C is NOT a new feature addition; it's hardening recommendations with business-condition signals
- ✅ P2C does NOT redesign recommendations; it uses existing condition assessment
- ✅ P2C does NOT modify P2B; P2B outcome verification is preserved
- ✅ P2C does NOT require schema changes in first batch
- ✅ P2C does NOT start with route integration; service-first principle applies

---

**Scope Lock Created:** 2026-06-04  
**P2B Baseline:** a1baa920 (42/42 PASSING)  
**P2C Status:** SCOPE_LOCKED_BEFORE_IMPLEMENTATION  
**Next Step:** P2C-BATCH-1 implementation (when authorized)
