# R1-SPECIAL-0: Special-Lane Summary

**Date:** 2026-05-17  
**Status:** SPECIAL-LANE CLASSIFICATION COMPLETE

---

## A. Violation Distribution by Lane

| Lane | Violations | Critical | Block-Build | Route Handlers | Audit Required |
|------|-----------|----------|------------|----------------|----------------|
| **LANE_D** (Role/Policy) | 72 | 45 | 27 | 8 | YES - Policy audit |
| **LANE_E** (State/Side-effect) | 92 | 58 | 34 | 12 | YES - State audit |
| **Domain** (Client/User/Growth) | 64 | 40 | 24 | 5 | YES - Domain audit |
| **LANE_H** (Framework) | 32 | 12 | 20 | 3 | No - Artifacts |
| **TOTAL** | **260** | **155** | **105** | **28** | **25 handlers** |

---

## B. Lane Details

### LANE_D: Policy or Custom Role Required (72 violations)

**Handlers:** 8 route handlers  
**Examples:** scenario, value, override, evidence/validate, entity, diagnosis/*, users/roles, users/memberships

**Blockers:**
- Private beta: YES
- Public launch: YES

**Action:** AUDIT_FIRST (audit policy/role service before modernization)

**Estimated Effort:** High (each handler has custom role/policy logic)

---

### LANE_E: Webhook, Payment, or Side-Effect Special (92 violations)

**Handlers:** 12 route handlers  
**Examples:** run, verify, webhooks/*, onboarding/*, experiments/*, decisions/*, constraint-checks, shock-events, growth/*, metrics/*

**Blockers:**
- Private beta: YES (for execution/decision routes)
- Public launch: YES

**Action:** AUDIT_FIRST (per-handler state/side-effect audit)

**Estimated Effort:** High (complex state machines and integrations)

---

### Complex Domain Semantics (64 violations)

**Handlers:** 5 groups of routes  
**Examples:** growth/*, metrics/*, users/*, clients/*, intervention

**Blockers:**
- Private beta: Mixed (NO for analytics, YES for others)
- Public launch: YES

**Action:** Domain consolidation (group by domain, audit together)

**Estimated Effort:** High (requires domain expertise)

---

### LANE_H: Framework Infrastructure (32 violations)

**Files:** shadow-read-classifier, auth-guard, ci-shadow-read-gate

**Blockers:** NO (not route handlers)

**Action:** FALSE_POSITIVE_REVIEW (violations are artifacts of framework use)

**Estimated Effort:** Low (no implementation needed, violations decrease as routes modernize)

---

## C. Private Beta vs Public Launch Blockers

**Private Beta Blockers (must fix before launch):**
- LANE_D: 8 handlers (policy/role)
- LANE_E: 12 handlers (state/side-effects) - especially decisions/run/verify
- Domain: User/client/intervention handlers

**Can Defer Post-Launch (with documented risk):**
- Growth metrics (LANE_E analytics)
- General metrics (LANE_E analytics)

---

## D. Recommended Execution Order

**Phase 1:** LANE_D Audit (8 handlers, 72 violations)
- Audit policy/role service semantics
- Identify capability changes needed
- Plan modernization approach

**Phase 2:** LANE_E Audit (12 handlers, 92 violations)
- Audit state machines per handler
- Identify side-effect scopes
- Plan modernization per category

**Phase 3:** Domain Consolidation
- Group remaining by domain
- Audit domain semantics
- Plan domain-specific modernization

**Phase 4:** Framework Update
- Remove legacy auth usage
- Framework violations decrease naturally

---

## E. Batching Feasibility

**LANE_D:** Can batch? MAYBE (after audit, if role semantics similar)

**LANE_E:** Can batch? ONLY by type (all webhooks, all experiments, etc.)

**Domain:** Can batch? Only by domain (all client routes, all user routes)

**Framework:** Automated as routes modernize

---

## F. Risk Summary

**Highest Risk:** LANE_D policy/role routes (capability implications)

**High Risk:** LANE_E decisions/run/verify (state/execution implications)

**Medium Risk:** Domain routes (semantic but domain-specific)

**Low Risk:** Framework artifacts (natural decrease)

---

**Status: ✓ SPECIAL-LANE SUMMARY COMPLETE - READY TO SELECT FIRST TRACK**
