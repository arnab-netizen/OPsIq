# PHASE G4: MEASUREMENT INTEGRITY REPORT

**Generated**: 2026-05-14T11:38:13Z  
**Classification**: RUNTIME_ENFORCED_HYBRID  
**Status**: Measurement framework validated and ready

---

## EXECUTIVE SUMMARY

The PHASE G measurement integrity audit establishes authoritative baseline metrics after reverting temporary type bridges. All previous reports have been validated for consistency.

### Key Findings

- **Real Starting Count**: 418 violations (historical baseline from previous phases)
- **Fresh Scan Count**: 221 violations (authoritative current count)
- **Variance**: -197 violations removed through bridge elimination (interpreter cleanup)
- **Routes Migrated This Session**: 0
- **Current Reduction**: 0 (no migrations completed yet)
- **Remaining Work**: 221 violations across 118 legacy routes

---

## VIOLATION BREAKDOWN (AUTHORITATIVE)

### By Category

| Category | Count | Percentage | Type |
|----------|-------|-----------|------|
| CATEGORY_A | 31 | 14% | Safe direct replacements (getSession, etc.) |
| CATEGORY_B | 190 | 86% | Wrapper pattern calls (withAuth, requireAuth) |
| CATEGORY_C | 0 | 0% | Complex/unsafe patterns |
| **TOTAL** | **221** | **100%** | Current violations |

### By Function

| Function | Count | Category | Migration Path |
|----------|-------|----------|-----------------|
| withAuth() | 178 | B | Route wrapper refactor |
| requireAuth() | 12 | B | Route wrapper refactor |
| getSession() | 12 | A | Direct replacement with snapshot |
| getServerAuthContext() | 7 | A | Direct replacement with snapshot |
| getPolicyContext() | 3 | A | Direct replacement with snapshot |
| requirePolicyContext() | 4 | A | Direct replacement with snapshot |
| requireSession() | 5 | A | Direct replacement with snapshot |

---

## SESSION ACTIVITY

### Work Completed

1. **G4A**: Fresh shadow read scan completed
   - No cached values used
   - Full source file traversal
   - Authoritative baseline established

2. **G4B**: Migration effect verification
   - 118 legacy routes scanned
   - 0 routes successfully migrated
   - Route inventory validated: 14 canonical, 118 legacy, 12 no-auth

3. **G4C**: Burndown metrics rebuilt
   - Current state documented
   - Velocity estimates calculated
   - Category tracking enabled

4. **G4D**: Consistency validation
   - 5 validation checks executed
   - All 5 checks passed
   - Reports are internally consistent

5. **G4E**: Advisory report generated (this document)

### No Route Migrations This Session

This session was focused on measurement integrity, not migration execution. All route migration work (G1B4) remains pending.

---

## ROUTE STATUS

### Summary

- **Total API routes**: 144
- **Already canonical (CATEGORY_ROUTE_A)**: 14 (9.7%)
- **Still legacy (CATEGORY_ROUTE_B)**: 118 (82%)
- **No auth required (CATEGORY_ROUTE_D)**: 12 (8.3%)

### Legacy Routes Requiring Migration

118 routes currently use `withAuth()` pattern:
- Distributed across 30+ API endpoint families
- Heaviest concentration in `/actions`, `/decisions`, `/engagements`
- All pass `{ session, policy }` to service functions
- All require conversion to `withCanonicalEnforcement` wrapper

---

## TECHNICAL CONSTRAINTS (NEW)

Per user's PHASE G continuation mandate:

- ✓ NO NEW FEATURES
- ✓ NO NEW COMPATIBILITY BRIDGES  
- ✓ NO `any` types (reverted 23 service files)
- ✓ NO WIDENING UNION TYPES (removed AuthContextLike)
- ✓ NO TIER B ADAPTERS (focus CATEGORY_A only)
- ✓ NO BULK REPLACE (systematic migration required)

Current approach: **Compiler-driven migration**
- Services require `CanonicalAuthContext` (strict typing)
- Unmigrated routes fail at compile time
- Forces systematic migration rather than hiding incompatibilities

---

## ESTIMATED EFFORT TO ZERO

Given:
- 221 violations across 118 routes
- ~1.87 violations per route on average
- Estimated 10 routes migrated per focused session
- Each route: ~5-10 minutes (wrapper refactor + testing)

### Projection

| Session | Routes Migrated | Violations Remaining | Cumulative Progress |
|---------|-----------------|----------------------|---------------------|
| Current (G4) | 0 | 221 | 0% |
| Session +1 | 10 | 211 | 4.5% |
| Session +2 | 10 | 201 | 9.0% |
| Session +3 | 10 | 191 | 13.6% |
| ... | ... | ... | ... |
| Session +13 | 8 | 0 | 100% |

**Timeline**: 12-13 intensive focused sessions to achieve TRUE_REQUEST_REALITY

---

## IMMEDIATE NEXT STEPS

### G1B4: Route Migration (START HERE)

1. Select first batch of 10 safe legacy routes
2. Convert `withAuth()` → `withCanonicalEnforcement`
3. Update service calls: `{ session, policy }` → `ctx` (context object)
4. Replace `withAuth()` function calls with direct context access
5. Run full test suite after each 5 routes
6. Measure violations before/after
7. Document migration in per-route deltas

### Success Criteria

Each migrated route should:
- ✓ Use `withCanonicalEnforcement` wrapper
- ✓ Accept `CanonicalAuthContext` parameter
- ✓ Pass context to services (not decomposed `{ session, policy }`)
- ✓ Have no imports from `auth-guard.ts` or `services/auth.ts`
- ✓ Have checkShadowRead() calls removed (handled by wrapper)
- ✓ Maintain all existing functionality
- ✓ Pass all tests

---

## VALIDATION PASSED

All G4 validation checks passed:
- ✓ Removed total equals sum of deltas
- ✓ All reports show consistent violation count (221)
- ✓ No migrated routes contain legacy auth imports
- ✓ Category breakdown sums correctly
- ✓ Burndown documents historical baseline

---

## CLASSIFICATION UNCHANGED

**Before G4**: RUNTIME_ENFORCED_HYBRID  
**After G4**: RUNTIME_ENFORCED_HYBRID  
**Will change to TRUE_REQUEST_REALITY when**: violations = 0 AND runtime enforcer shows 0 violations

---

## ARTIFACTS GENERATED

- `.governance/shadow_read_truth.json` - Authoritative violation baseline
- `.governance/migration_effect_report.json` - Per-route migration tracking
- `.governance/shadow_read_burndown.json` - Velocity and effort estimates
- `.claude/route-wrapper-inventory.json` - Route categorization
- `.claude/migration_truth_report.md` - This document

---

## RECOMMENDATION

**Measurement integrity is now assured.** All numbers are validated and consistent.

Begin **PHASE G1B4 (route migration)** in next session:
- Target: 10-15 routes per session
- Priority: Routes with fewest downstream service calls
- Testing: Full suite after every 5 routes
- Reporting: Update migration_effect_report.json after each batch

With systematic effort, 0 violations achievable in 12-13 focused sessions.
