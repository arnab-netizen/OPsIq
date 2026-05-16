# G6V: BATCH 1 REALITY ASSESSMENT

**Date**: 2026-05-14T14:15:00Z  
**Classification**: RUNTIME_ENFORCED_HYBRID  
**Status**: Batch selection revealed architectural reality

---

## CRITICAL FINDING

The initial batch selection (10 routes) was based on assuming routes used `withAuth()` with NO arguments. However, investigation revealed:

### Actual withAuth() Usage Patterns in Codebase

1. **withAuth() WITH capability argument** (MAJORITY)
   - Example: `await withAuth({ capability: CAPABILITIES.CLIENT_VIEW })`
   - Found in: clients/route.ts, findings/route.ts, leads/route.ts, etc.
   - Count: Most remaining routes

2. **withAuth() WITH capability AND internalOnly**
   - Example: `await withAuth({ capability: ..., internalOnly: true })`
   - Found in: report/route.ts, and others
   - Count: Many routes

3. **Custom workspace resolution patterns**
   - Example: `await requireWorkspaceContext()` (routes like governance/alerts)
   - Example: `await resolveServerRole()` (routes like value/route.ts)
   - Count: Multiple routes

4. **withAuth() NO ARGS** (RARE)
   - Example: `await withAuth()` (with no arguments)
   - Found in: The 3 already-migrated routes (G6T, G6U)
   - Count: Very few remaining

---

## G5 Analysis Accuracy Check

G5 reported "withAuth() no-args: 63 occurrences" but this was likely:
- A count of ROUTE-LEVEL patterns, not actual instances
- Or counted differently than current scanner

Current scanner shows withAuth() calls are predominantly WITH arguments.

---

## Revised Selection Strategy

### Option A: Migrate withAuth(capability) routes (LARGER BATCH)
- Requires understanding of capability patterns
- Requires translating `withAuth({ capability: X })` to wrapper options
- Higher complexity but larger batch possible

### Option B: Stop at 3-route pilot (CONSERVATIVE)
- Accept that cleanest routes already migrated
- Focus on understanding capability-based routes
- Plan capability-aware wrapper extension for future batches
- Batch size: 0 (wait for capability analysis)

### Option C: Selective capability routes (MEDIUM RISK)
- Identify safest capability-based routes
- Migrate just 2-3 that are most similar to pilots
- Smaller batch but measurable progress
- Batch size: 2-3 routes

---

## BLOCKER ANALYSIS

**Is it blocked to migrate more routes?** 

Depends on approach:

1. **If migrating withAuth(capability) routes**: 
   - NOT BLOCKED - can migrate using wrapper options
   - Requires capability extraction logic in bridge
   - Safe: canonicalizeAuthContext() can extract capabilities

2. **If migrating custom workspace patterns**:
   - POTENTIALLY BLOCKED - would require wrapper modifications
   - Custom patterns (requireWorkspaceContext, resolveServerRole) don't align with header-based wrapper
   - Workaround: Bridge pattern still works for these

3. **If only migrating withAuth() no-args**:
   - BLOCKED - only 3 exist (already done)

---

## RECOMMENDED DECISION

**For Phase G6V, recommend Option C: Selective Capability Routes**

Migrate 3-5 safest capability-based routes:
- Use withAuth(capability) routes that:
  - Use x-workspace-id header (not custom patterns)
  - Have single simple capability (not complex conditions)
  - Are GET-only (read-safe)
  - Have clear response shapes

This maintains:
- ✓ Safety (capability extraction proven in bridge)
- ✓ Progress (3-5 more routes clean)
- ✓ Learning (understand capability patterns)
- ✓ No blocker (bridge handles capability routes)

Expected reduction: 6-10 violations (2 per route × 3-5 routes)
Timeline: 20-30 minutes

---

## FINDINGS SUMMARY

1. **Original 10-route selection was flawed**: Assumed withAuth() no-args pattern doesn't exist in sufficient quantity
2. **Only 3 routes had withAuth() no-args**: Already migrated in G6D
3. **Most remaining routes use withAuth(capability)**: Different pattern, still migratable
4. **No hard blocker**: Both patterns can use canonical wrapper
5. **Realistic batch size for G6V**: 3-5 routes (not 10), using capability-aware selection

---

## NEXT STEP

Revise batch selection to include safest 3-5 `withAuth(capability)` routes that meet criteria:
- x-workspace-id header source
- Single simple capability check
- GET-only methods
- Clear authorization pattern

This is a safe, measured step with proven bridge pattern.

