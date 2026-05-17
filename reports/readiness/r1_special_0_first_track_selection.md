# R1-SPECIAL-0: First Special-Lane Track Selection

**Date:** 2026-05-17  
**Status:** FIRST TRACK SELECTED - READY FOR AUDIT PHASE

---

## A. Selection Criteria

**Fastest risk reduction:** LANE_D (72 violations in 8 handlers = 9 violations per handler)

**Private beta readiness:** LANE_D audit unblocks policy decisions needed for other phases

**Precedence:** LANE_D policy semantics must be clarified before LANE_E execution semantics

---

## B. LANE_D: Policy or Custom Role Required - SELECTED

**Selected:** YES

**Handlers:** 8
- scenario (resolveServerRole + canView)
- value (resolveServerRole + canView)
- override (custom policy wrapper)
- evidence/validate (custom policy/internal-only)
- entity (resolveServerRole)
- diagnosis/* (4 routes: resolveServerRole)
- users/roles (role management)
- users/memberships (workspace membership)

**Violations:**
- Total: 72 (27% of 260)
- Critical: 45
- Block-build: 27

**Blocker Status:**
- Private beta: YES
- Public launch: YES

**Audit Scope:**
1. Identify all custom role resolution patterns
2. Audit capability implications of role changes
3. Determine if wrapper-enforced CanonicalAuthContext can support role-specific logic
4. Design modernization approach (adapter pattern or custom audit)

**Expected Outcome:**
- Clarify which LANE_D handlers can use standard adapter pattern
- Identify handlers needing custom logic/policy changes
- Reduce uncertainty for dependent LANE_E audit

**Next Phase Name:** R1-SPECIAL-1-D (LANE_D Policy/Role Audit)

---

## C. Files Allowed in R1-SPECIAL-1-D

**Implementation files (if audit leads to fixes):**
- src/app/api/scenario/route.ts
- src/app/api/value/route.ts
- src/app/api/override/route.ts
- src/app/api/evidence/[evidenceId]/validate/route.ts
- src/app/api/entity/route.ts
- src/app/api/diagnosis/*/route.ts
- src/app/api/users/[userId]/roles/route.ts
- src/app/api/users/[userId]/memberships/route.ts

**Forbidden files:**
- Service files (no service changes without separate audit)
- Wrapper/auth context (no framework changes)
- Unrelated routes
- Scanner source

---

## D. Stop Conditions for R1-SPECIAL-1-D

**HALT if:**
1. Any handler already modernized (verify in source first)
2. Role resolution service not found
3. Capability/role implications cannot be mapped
4. Service signature change required (move to LANE_G)
5. Risk level assessed as BLOCKED (needs design audit)

---

**Status: ✓ LANE_D SELECTED AS FIRST SPECIAL-LANE TRACK**
