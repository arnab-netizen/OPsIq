# PHASE G5: Migration Velocity Forecast

**Generated**: 2026-05-14  
**Classification**: RUNTIME_ENFORCED_HYBRID (unchanged)  
**Authority**: Simulation-based, requires validation through execution

---

## BASELINE

- **Starting Violations**: 418 (historical, PHASE F baseline)
- **Fresh Scan Violations**: 221 (authoritative, PHASE G4)
- **Current CATEGORY_B**: 190 violations
- **Routes in CATEGORY_B**: 118 legacy routes

**Key Finding**: Migration removes violations, not routes. One route may have multiple violations.

---

## MIGRATION TIMELINE ESTIMATES

### Linear Estimate (Violations Per Session)

If routes migrate at ~10 routes per session, with ~1.6 violations per route:

```
Session    Routes Migrated    Violations Reduced    Remaining    Cumulative %
────────────────────────────────────────────────────────────────────────────
   1              10                   16              174          8.4%
   2              10                   16              158         16.8%
   3              10                   16              142         25.3%
   4              10                   16              126         33.7%
   5              10                   16              110         42.1%
   6              10                   16               94         50.5%
   7              10                   16               78         58.9%
   8              10                   16               62         67.4%
   9              10                   16               46         75.8%
  10              10                   16               30         84.2%
  11               8                   13               17         91.6%
  12               8                   13                4         98.1%
  13               2                    4                0        100%
```

**Linear Timeline**: 13 sessions at ~10 routes/session

### Pattern-Based Estimate (Recipes Apply)

If top 3 recipes apply with stated reductions:

```
Recipe 1 (withAuth no args):    63 violations → 38 routes
Recipe 2 (withAuth capability): 36 violations → 35 routes
Recipe 3 (getServerAuthContext): 14 violations → 5 routes (CATEGORY_B adapter needed)
Subtotal: 113 violations reduced in 78 routes (in best case)

Remaining: 77 violations in 40 routes
Average: 1.9 violations per remaining route
Estimate: 4-5 more sessions at 10 routes/session
```

**Pattern-Based Timeline**: 9-10 sessions total (using recipes)

### Best Case

- All recipes apply cleanly without blockers
- 180 violations removed by recipes
- Only 10 violations remain requiring manual work
- **Timeline: 5 sessions**

### Likely Case

- Recipes apply with some rework required
- 132 violations removed by recipe application
- 58 violations require manual analysis
- **Timeline: 10 sessions**

### Worst Case

- Recipes reveal complexity and hidden dependencies
- Only 90 violations removed by recipes
- 100 violations require manual, time-intensive migration
- **Timeline: 15 sessions**

---

## RECOMMENDED MIGRATION ORDER

Based on pattern analysis and cluster distribution:

### Phase 1: Low-Risk Mechanical Replacements (Sessions 1-4)
1. **withAuth no args** - 63 violations, 38 routes
   - Mechanical: just replace wrapper
   - Risk: LOW
   - Estimated time: 3-4 sessions at 10 routes/session
   - Confidence: HIGH

### Phase 2: Capability-Based Routes (Sessions 5-8)
2. **withAuth with capability** - 36 violations, 35 routes
   - Slightly more complex: move capability check to route
   - Risk: MEDIUM
   - Estimated time: 3-4 sessions
   - Confidence: MEDIUM

### Phase 3: Optional Auth (Session 9)
3. **getServerAuthContext** - 14 violations, 5 routes
   - Requires new adapter (CATEGORY_B)
   - Risk: MEDIUM-HIGH
   - Estimated time: 1 session (5 routes)
   - Confidence: LOW

### Phase 4: Remaining Mixed Patterns (Sessions 10-13)
4. **Other patterns** - 77 violations, 40 routes
   - Manual analysis required
   - Risk: HIGH (mixed patterns, potential complexity)
   - Estimated time: 4 sessions
   - Confidence: LOW

---

## EFFORT ASSUMPTIONS

### Per-Route Effort

- **Simple pattern (no-args)**: ~8 minutes per route
  - Wrapper replacement + test verification
  - Service call update
  
- **Capability pattern**: ~10 minutes per route
  - Add capability check to route
  - Update error handling
  - Verify capability enforcement
  
- **Optional auth**: ~15 minutes per route
  - Conditional logic for auth/no-auth
  - Data classification verification
  - Integration testing

- **Manual/mixed**: ~15-20 minutes per route
  - Requires code review
  - May need service layer changes
  - Potential adapter development

### Session Capacity

- **Target**: 10 routes per session
- **Reality**: Likely 8-12 routes per session
  - Includes test runs after every 5 routes
  - Includes git commits after every batch
  - Includes validation and burndown tracking

---

## IDENTIFIED BLOCKERS

1. **Optional Auth Adapter**
   - getServerAuthContext needs `withOptionalCanonicalEnforcement`
   - Currently doesn't exist
   - Blocker: MEDIUM (5 routes depend on it)
   - Mitigation: Create adapter in G5 follow-up session

2. **Workspace Scoping Differences**
   - Legacy withAuth() vs new wrapper may handle workspace differently
   - Blocker: LOW (identified in recipes, testable)
   - Mitigation: Add tests for workspace scoping behavior

3. **Service Layer Type Mismatch**
   - Services now require `CanonicalAuthContext`
   - Unmigrated routes still pass `AuthContext`
   - Blocker: HIGH (compiler enforces, prevents unmigrated routes from calling services)
   - Mitigation: This is intentional - drives migration! Not a blocker, a feature.

4. **Test Coverage**
   - Some routes may lack tests
   - Blocker: MEDIUM (can't verify after migration)
   - Mitigation: Add tests before migration

5. **Mixed Authentication Strategies**
   - Some files use multiple auth patterns
   - Blocker: MEDIUM (requires careful refactoring)
   - Mitigation: Refactor one pattern at a time

---

## VELOCITY VALIDATION

### Assumptions Built Into Estimate

✓ Compiler enforcement provides immediate feedback (no silent failures)  
✓ Test suite provides regression detection  
✓ Routes are relatively self-contained  
✓ Services don't have complex auth dependencies  
✓ No architectural refactoring needed (only wrapper changes)  

### Confidence Levels

- **Weeks 1-2 (Linear estimate)**: HIGH confidence
  - Pattern-based recipes well-defined
  - Mechanical replacements
  - Tests validate behavior
  
- **Weeks 3-4 (Pattern recipes)**: MEDIUM confidence
  - Depends on recipes applying as described
  - Some routes may have edge cases
  - Optional auth adapter needed
  
- **Weeks 5+ (Remaining violations)**: LOW confidence
  - Manual analysis required
  - Unknown complexity in remaining code
  - Possible undiscovered patterns

---

## EXPLICIT STATEMENT: CLASSIFICATION PRESERVED

**Before PHASE G5**: RUNTIME_ENFORCED_HYBRID  
**After PHASE G5**: RUNTIME_ENFORCED_HYBRID  
**After Migration (G1B4)**: Still RUNTIME_ENFORCED_HYBRID until code violations = 0  
**Final Classification**: TRUE_REQUEST_REALITY when violations = 0 AND runtime enforcer = 0 violations  

PHASE G5 is measurement and planning only. No routes are migrated. Classification unchanged.

---

## NEXT IMMEDIATE ACTION

**G1B4: Route Migration Execution** (when authorized)

1. Start with Recipe 1 (withAuth no args) - 63 violations, 38 routes
2. Migrate 10 routes per session
3. Test after every 5 routes
4. Update burndown after every 10 routes
5. Track success/failure of recipes for forecast refinement

---

## ARTIFACT AUDIT

Generated in this session:
- ✓ category_b_clusters.json (11 clusters, 190 violations)
- ✓ pattern_frequency.json (6 patterns, sorted by frequency)
- ✓ migration_recipe_withauth_no_args.md (63 violations)
- ✓ migration_recipe_withauth_capability.md (36 violations)
- ✓ migration_recipe_getserverauthcontext.md (14 violations - CATEGORY_B)
- ✓ migration_simulation.json (4 recipes simulated)
- ✓ migration_velocity_forecast.md (this document)

All artifacts exist. No execution performed. Classification: RUNTIME_ENFORCED_HYBRID.
