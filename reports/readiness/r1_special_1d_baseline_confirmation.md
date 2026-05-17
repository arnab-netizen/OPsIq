# R1-SPECIAL-1-D: Baseline Confirmation

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-1-D (LANE_D Policy/Role Audit - Audit Phase Only)  
**Status:** BASELINE CONFIRMED - AUDIT PHASE AUTHORIZED

---

## A. Starting Baseline

**Violations:** 260 (from R1-SPECIAL-0 final state)
- Critical: 155
- Block-build: 105

**LANE_D Scope:** 8 route handlers with 72 violations
- scenario (POST)
- value (GET)
- override (POST)
- evidence/[evidenceId]/validate (POST)
- entity (GET/POST) - partially modernized
- diagnosis/route (POST) - already modernized
- diagnosis/archetype (POST)
- diagnosis/maturity (POST)
- diagnosis/root-cause (POST)
- diagnosis/bottleneck (POST)
- users/[userId]/roles (GET/POST/DELETE) - partially modernized
- users/[userId]/memberships (GET/POST/DELETE) - partially modernized

**Build Status:** ✓ PASS (0 TypeScript errors)

**Tests:** 5117 passed, 192 failed (pre-existing)

---

## B. Audit Scope Confirmation

**Phase Type:** AUDIT_ONLY - NO CODE CHANGES

**Handler Count:** 8 (with multiple methods: GET, POST, DELETE)

**Modernization State:**
- Fully legacy (withEnforcementFull): 5 handlers
- Partially modernized: 3 handlers (with some methods already using withCanonicalEnforcement)
- Fully modernized (diagnosis/route): 1 handler

**Pattern Categories Identified:**
1. Custom role resolution (resolveServerRole)
2. Custom access control functions (canView, canEdit)
3. Custom policy wrappers (internalOnly flags)
4. Hierarchy-based authorization (getActorHierarchyLevel)
5. Context bridge patterns (canonicalizeAuthContext)

---

## C. Audit Work Plan

**Phase B:** Read and analyze all 8 LANE_D handlers
**Phase C:** Document custom patterns and design constraints
**Phase D:** Evaluate modernization approaches per handler
**Phase E:** Identify required capability/role changes
**Phase F:** Assess service changes needed
**Phase G:** Generate final audit decision and recommendations

---

## D. Key Questions for Audit

1. Can custom role resolution be expressed as standard capabilities?
2. Do canView/canEdit functions map to standard CAPABILITIES?
3. What is the semantic meaning of "internalOnly" vs standard public routes?
4. Can hierarchy-based auth be modeled in verifiedCapabilities?
5. Are there service changes required (signature or semantics)?
6. Can mixed-state handlers (partial modernization) be completed safely?

---

**Status: ✓ BASELINE CONFIRMED - READY FOR PATTERN AUDIT IN PHASE B**
