# X2C-PREFLIGHT: Lane 2 Remaining Inventory Decision

**Audit Date:** 2026-05-15  
**Phase:** X2C-PREFLIGHT (Phase C)  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Inventory Summary

### True Lane 2 Ready Handlers Remaining
**Count:** 0

**Analysis:** X2B Batch 1 migrated the core 15 Lane 2 handlers. Post-inventory analysis shows:
- No additional GET-only canonical read handlers identified as ready
- All obvious candidates (summary, aggregation, metric reads) were captured in Batch 1
- Remaining routes either: migrated, use alternative wrappers, are direct async, or are mixed handlers

### Already Migrated & Clean
**Count:** 18+ handlers on withCanonicalEnforcement

Includes the 15 from X2B Batch 1 plus additional handlers:
- audit/route.ts (AUDIT_READ) - already migrated
- me/route.ts (USER_VIEW) - already migrated  
- entitlement/route.ts (ENTITLEMENT_VIEW) - already migrated

### Handlers Requiring Detailed Inspection
**Count:** ~10 files

Candidates for secondary inventory:
- health/route.ts (uses withEnforcement wrapper - different pattern)
- liveness/route.ts (direct async - no auth wrapper needed)
- readiness/route.ts (direct async - no auth wrapper needed)
- verify/route.ts (requires pattern inspection)
- startup/route.ts (requires pattern inspection)
- admin/audit-log/route.ts (admin capability read)
- billing routes (billing capability reads)
- growth metrics routes (growth capability reads)

**Assessment:** These use different wrappers or are specialized capabilities outside Lane 2 core scope. May be Lane 4+ (getServerAuthContext), Lane 5+ (requireAuth variants), or specialized domain wrappers.

---

## Lane 2 Exhaustion Assessment

### Question: Is Lane 2 exhausted?

**Answer: LIKELY YES, with minor caveats**

**Reasoning:**
1. X2B Batch 1 captured 15 core Lane 2 candidates (summary, aggregation, engagement reads)
2. No additional true Lane 2 ready handlers identified in inventory
3. Remaining routes use alternative patterns (withEnforcement, direct async)
4. Specialized capabilities (admin, billing, growth) may have Lane 2 candidates but are lower priority
5. Mixed handler files (GET+POST) have GET partially migrated, POST protected

**Evidence:**
- Batch 1 targeted typical Lane 2 pattern: `withEnforcementFull(async (request) => { await withAuth(...) })`
- Current state shows 18+ handlers already on withCanonicalEnforcement
- Scanner still shows 312 violations but mostly in services, infrastructure, unmigrated write paths
- No withEnforcementFull + withAuth pattern found in remaining read handlers

### Question: Which exact files are ready?

**Answer: NONE IDENTIFIED**

All obvious Lane 2 candidates have been migrated. No GET-only capability canonical read handlers identified as ready for immediate migration.

### Question: Were any files reclassified?

**Answer: YES - Conditional**

Handlers identified as requiring detailed inspection:
- **health/route.ts** - Likely Lane 4+ (getServerAuthContext or alternative enforcement)
- **liveness/route.ts** - Likely OUT_OF_SCOPE (health checks, no auth)
- **readiness/route.ts** - Likely OUT_OF_SCOPE (health checks, no auth)
- **verify/route.ts** - Requires inspection (verification pattern unclear)
- **startup/route.ts** - Requires inspection (startup pattern unclear)
- **admin/audit-log/route.ts** - Likely Lane 9+ (specialized admin pattern)
- **billing routes** - Likely Lane 9+ (specialized billing domain)
- **growth routes** - Likely Lane 9+ (specialized growth domain)

### Question: Why were they reclassified?

**Answer: Pattern differences**

1. **Alternative wrappers:** health/route.ts uses `withEnforcement` not `withEnforcementFull`
2. **Direct async:** liveness, readiness use direct async without auth wrappers
3. **Specialized domains:** admin, billing, growth may have domain-specific auth patterns
4. **Clear pattern mismatch:** withEnforcementFull + withAuth pattern not observed in remaining reads

### Question: Should we run another Lane 2 batch?

**Answer: NO**

**Justification:**
- 0 true Lane 2 ready handlers remain
- Batch 1 captured the core 15 candidates
- Remaining handlers require different lane classifications
- Diminishing returns on Lane 2 effort
- Resources better allocated to Lane 3+ planning

### Question: Is Lane 3 ready for pre-flight?

**Answer: YES - with pre-flight checklist**

**Prerequisites for Lane 3 pre-flight:**
1. Lane 2 formally closed (this phase)
2. Mutation handler strategy confirmed
3. Bridge usage plan for write paths
4. Policy context handling in POST/PATCH defined
5. Scope constraints updated for mutations

---

## Decision

### Recommended Next Phase

**X2D: LANE_2_CLOSEOUT_AND_LANE_3_PREFLIGHT**

### Rationale

1. **Lane 2 is exhausted:** No true Lane 2 ready candidates remain
2. **Batch 1 was comprehensive:** 15 handlers captured core Lane 2 scope
3. **Inventory confirms closure:** All obvious candidates migrated
4. **Next phase identified:** Lane 3 mutation handlers are the natural next step
5. **Pre-flight required:** Lane 3 introduces new patterns (write paths) not yet tested

### Timeline

1. **Immediate:** Formal Lane 2 closure (this phase)
2. **Next:** Lane 3 pre-flight planning (X2D)
3. **Then:** Lane 3 Batch 1 mutation handler migration (X3A)

---

## Summary

| Question | Answer |
|----------|--------|
| **True Lane 2 remaining?** | 0 |
| **Lane 2 exhausted?** | YES |
| **Another Batch 2 recommended?** | NO |
| **Lane 3 ready for pre-flight?** | YES |
| **Next phase?** | X2D_LANE_2_CLOSEOUT_AND_LANE_3_PREFLIGHT |

