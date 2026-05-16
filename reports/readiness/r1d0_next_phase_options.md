# R1-D-0: Next Phase Options

**Date:** 2026-05-16  
**Phase:** R1-D-0 (Next Phase Evaluation)  
**Scope:** Evaluate 6 options for governance modernization next steps

---

## Current Status

**Completed Phases:**
- R1-A: ✓ 5 routes, 21 violations fixed
- R1-B: ✓ 3 routes, 9 violations fixed
- R1-C: ✓ 4 routes, 24 violations fixed
- **Cumulative:** 12 routes, 54 violations fixed

**Current State:**
- Violations Remaining: 390
- Classification: RUNTIME_ENFORCED_HYBRID
- Tests: 78/78 passing, 0 regressions
- Build: TypeScript 0 errors (ENV-GATED at page generation)

**Remaining Violations by Lane:**
- Lane A (Safe Routes): 90 violations - CAN IMPLEMENT NOW ✓
- Lane B (Policy Wrapper): 45 violations - NEEDS DESIGN
- Lane C (Workspace Role): 40 violations - NEEDS DESIGN
- Lane D (Service Boundary): 60 violations - NEEDS DESIGN
- Lane E (Run Route): 6 violations - NEEDS ISOLATED AUDIT
- Lane F (Verify Route): 4 violations - NEEDS SEMANTICS AUDIT
- Lane G (False Positive): 35 violations - NEEDS PATTERN AUDIT
- Lane H (Test/Dev): 10 violations - NON-PRODUCTION
- Lane I (Governance Infra): 32 violations - NEEDS INFRA AUDIT

---

## Option A: R1-D - Fourth Safe Route Batch Modernization

**Focus:** Implement remaining Lane A violations (90 violations from ~22 simple routes)

### Evaluation

| Aspect | Assessment |
|--------|------------|
| **Live Risk Reduction** | HIGH (90 violations, 60+ critical estimated) |
| **Implementation Risk** | LOW (proven pattern from R1-A/B/C) |
| **Scanner Reduction Potential** | 90 violations (-60+ critical) |
| **Build Break Risk** | NONE (pattern proven safe) |
| **Customer/Beta Impact** | POSITIVE (more routes secured before beta) |
| **Dependency on Other Lanes** | NONE (safe routes are independent) |
| **Parallel Execution** | YES - can run R2-0 in parallel |
| **Estimated Duration** | 1-2 days (larger batch than R1-C) |

### Implementation Details

**Routes to Modernize:** ~22 simple routes
- Engagement sub-routes (constraint-checks, escalation-checks, experiments, review-cycles, etc.)
- Client routes (clients, clients/contacts)
- Metrics and observability routes
- Growth and governance alert routes
- Additional notification routes

**Pattern:** Same as R1-A/R1-B/R1-C
```
withEnforcementFull → withCanonicalEnforcement
async (request) → async (ctx: CanonicalAuthContext)
authContext → ctx.verifiedActorId / ctx.verifiedWorkspaceId
```

**Expected Outcome:**
- Violations: 390 → 300 (-90)
- Critical: 247 → ~190 (-57 estimated)
- Block-build: 143 → ~130 (-13 estimated)
- Tests: 78/78 (0 regressions expected)
- Build: TypeScript 0 errors

### Recommendation
✓ **RECOMMENDED AS PRIMARY PHASE**
- Continues proven safe pattern
- Clears 23% of remaining violations
- Maintains project momentum
- Zero architectural risks
- Unblocks beta readiness progress

---

## Option B: R1-RUN-0 - Run/Route Isolated Modernization Audit

**Focus:** Design-only audit for src/app/api/run/route.ts (1000+ line decision engine)

### Evaluation

| Aspect | Assessment |
|--------|------------|
| **Live Risk Reduction** | MINIMAL (6 violations only) |
| **Implementation Risk** | HIGH (1000+ lines, decision engine criticality) |
| **Scanner Reduction Potential** | 6 violations only |
| **Build Break Risk** | MEDIUM (large handler, easy to break logic) |
| **Customer/Beta Impact** | NEUTRAL (audit only, no implementation) |
| **Dependency on Other Lanes** | NONE |
| **Parallel Execution** | YES - can run while R1-D implements |
| **Estimated Duration** | 1-2 days (audit only, no implementation) |

### What Would Happen

**Design Audit Phase:**
1. Analyze decision-engine business logic in detail
2. Identify all state mutations and dependencies
3. Map out modernization path for large handler
4. Identify potential accidental logic-change risks
5. Create implementation constraints document

**Implementation (separate phase):**
- High precision implementation with detailed review
- Possible need for multiple iterations (R1-C2-MAIN, etc.)
- Risk of rework if handler complexity underestimated

### Recommendation
⚠ **CONDITIONAL - Good as parallel track, not primary phase**
- High value for risk mitigation (large critical handler)
- Can run in parallel with R1-D
- Better insight before attempting implementation
- Minimal blocking (audit only)

---

## Option C: R1-VERIFY-0 - Verify/Route Workspace Semantics Audit

**Focus:** Design-only audit for src/app/api/verify/route.ts (workspace scoping semantics unclear)

### Evaluation

| Aspect | Assessment |
|--------|------------|
| **Live Risk Reduction** | MINIMAL (4 violations only) |
| **Implementation Risk** | MEDIUM (semantics ambiguity) |
| **Scanner Reduction Potential** | 4 violations only |
| **Build Break Risk** | LOW-MEDIUM (handler smaller, but semantics critical) |
| **Customer/Beta Impact** | NEUTRAL (audit only) |
| **Dependency on Other Lanes** | NONE |
| **Parallel Execution** | YES - can run while R1-D implements |
| **Estimated Duration** | 1-2 days (semantics audit) |

### What Would Happen

**Semantics Audit Phase:**
1. Determine if verify route is workspace-scoped or universal
2. Clarify decision record creation semantics
3. Identify canonical enforcement pattern fit
4. Define workspace context usage in handler

**Implementation (separate phase):**
- Once semantics clear, implementation straightforward
- May require special handling if universal (no workspace scope)
- Could follow Lane F design audit pattern

### Recommendation
✓ **OPTIONAL PARALLEL TRACK - Low risk, clarifies ambiguity**
- Small impact (4 violations) but removes uncertainty
- Can run in parallel with R1-D without blocking
- Clears ambiguity before implementation attempt

---

## Option D: R1-POLICY-0 - Policy Wrapper Route Design Audit

**Focus:** Design-only audit for Lane B policy-wrapper routes (45 violations from ~10 routes)

### Evaluation

| Aspect | Assessment |
|--------|------------|
| **Live Risk Reduction** | MEDIUM (45 violations, policy context routes) |
| **Implementation Risk** | MEDIUM (new wrapper pattern design needed) |
| **Scanner Reduction Potential** | 45 violations (-30+ critical estimated) |
| **Build Break Risk** | MEDIUM (new pattern, requires validation) |
| **Customer/Beta Impact** | POSITIVE if well-designed |
| **Dependency on Other Lanes** | Blocks Lane B implementation until complete |
| **Parallel Execution** | YES - can run while R1-D implements |
| **Estimated Duration** | 1-2 days (design audit and pattern validation) |

### What Would Happen

**Design Audit Phase:**
1. Review policy-aware routes requiring policy context
2. Design `withCanonicalPolicyEnforcement` pattern (or similar)
3. Define requireInternalAccess semantics
4. Create policy context validation pattern
5. Validate pattern in 2-3 pilot routes (no production code)

**Implementation (separate phase - R1-E or later):**
- Implement Lane B routes using new policy-wrapper pattern
- Validate with comprehensive tests
- May uncover edge cases requiring iteration

### Recommendation
✓ **OPTIONAL PARALLEL TRACK - Enables future phase R1-E**
- Clears policy pattern ambiguity
- Can run in parallel with R1-D without blocking
- Enables R1-E implementation immediately after completion

---

## Option E: R1-SERVICE-0 - Service Boundary Modernization Planning

**Focus:** Design-only audit for Lane D service-boundary routes (60 violations from ~15 routes)

### Evaluation

| Aspect | Assessment |
|--------|------------|
| **Live Risk Reduction** | HIGH (60 violations, 15% of remaining) |
| **Implementation Risk** | HIGH (service refactor needed) |
| **Scanner Reduction Potential** | 60 violations (-40+ critical estimated) |
| **Build Break Risk** | HIGH (service changes affect multiple routes) |
| **Customer/Beta Impact** | CRITICAL (service-layer changes touch core) |
| **Dependency on Other Lanes** | Blocks Lane D implementation until complete |
| **Parallel Execution** | YES - can run while R1-D implements, but needs careful service coordination |
| **Estimated Duration** | 2-3 days (service boundary design) |

### What Would Happen

**Design Audit Phase:**
1. Review service-boundary patterns and requirements
2. Design ServiceAuthEnvelope construction patterns
3. Define service input contract validation
4. Map service modernization strategy
5. Create service-boundary implementation guide

**Implementation (separate phases - R1-G or later):**
- Service refactor work (may span multiple phases)
- Requires careful coordination with route modernization
- Potential for cascading changes if not designed carefully

### Recommendation
⚠ **CONDITIONAL PARALLEL TRACK - High value but higher risk**
- Largest batch of modernization work
- Requires careful service design before implementation
- Should not block R1-D/R1-E if possible
- Better to start audit in parallel while R1-D completes

---

## Option F: R2-0 - Deployment Readiness Audit (Parallel Track)

**Focus:** Begin deployment/environment/database readiness in parallel with governance

### Evaluation

| Aspect | Assessment |
|--------|------------|
| **Live Risk Reduction** | N/A (deployment focus, not governance) |
| **Implementation Risk** | INDEPENDENT (not tied to governance phases) |
| **Governance Impact** | POSITIVE (clears deployment blockers) |
| **Build Break Risk** | NONE (deployment work is parallel) |
| **Customer/Beta Impact** | CRITICAL (enables actual beta launch) |
| **Dependency on Other Lanes** | NONE (independent track) |
| **Parallel Execution** | YES - runs simultaneously with R1-D/others |
| **Estimated Duration** | 3-5 days (environment setup, database, deployment) |

### What Would Happen

**Deployment Audit Phase (parallel to R1-D/others):**
1. Assess DATABASE_URL/environment setup requirements
2. Design deployment pipeline (staging, production)
3. Plan database migration strategy
4. Review infrastructure requirements
5. Create deployment readiness gate

**Goal:** Be ready to deploy whenever governance reaches beta gate

### Recommendation
✓ **STRONGLY RECOMMENDED AS PARALLEL TRACK**
- **Critical path item** (governance alone doesn't unblock deployment)
- Can run completely independently of R1-D/B/C phases
- Enables beta launch without waiting for 100% governance
- Removes time-dependent bottlenecks
- Unlocks parallelization opportunity

---

## Comparative Summary

| Option | Type | Violations | Risk | Duration | Blocks Beta | Parallel Ready |
|--------|------|-----------|------|----------|------------|----------------|
| **A: R1-D** | Implementation | 90 | LOW | 1-2 days | Advances | YES (R2-0) |
| **B: R1-RUN-0** | Design Audit | 6 | HIGH | 1-2 days | No | YES |
| **C: R1-VERIFY-0** | Design Audit | 4 | MEDIUM | 1-2 days | No | YES |
| **D: R1-POLICY-0** | Design Audit | 45 | MEDIUM | 1-2 days | Blocks R1-E | YES |
| **E: R1-SERVICE-0** | Design Audit | 60 | HIGH | 2-3 days | Blocks R1-G | YES (careful) |
| **F: R2-0** | Deployment | N/A | INDEPENDENT | 3-5 days | Unlocks | YES |

---

## Critical Path Analysis

**Path to Beta Launch:**
1. **Governance:** R1-C ✓ → R1-D → R1-E (+ audits as needed) → Beta Gate
2. **Deployment:** R2-0 (parallel) → Database setup → Staging → Production

**Blocker Status:**
- Governance: Not blocking (can get to <100 critical with R1-D + R1-E)
- Deployment: Currently blocking (no environment setup)

**Recommendation:** Start R2-0 in parallel ASAP while R1-D executes

---

## Final Comparison

### Most Direct Path to Beta
1. **NOW:** Start R1-D (90 violations, 1-2 days)
2. **PARALLEL:** Start R2-0 (deployment, 3-5 days)
3. **AFTER R1-D:** Evaluate R1-E/R1-F based on critical violation count
4. **GOAL:** Complete R1-D + R2-0 in ~1 week, ready for beta launch

### Option A (R1-D) is Primary
- Largest safe batch remaining (90 violations)
- Advances critical violation reduction significantly
- Maintains momentum from R1-A/B/C
- Zero architectural risks
- Expected to hit critical violation gate for beta

### Options B/C/D/E Should Run in Parallel
- Audit phases don't block each other
- Unblock future phases (R1-E, R1-F, R1-G)
- Parallel audit tracks accelerate timeline

### Option F (R2-0) is Critical Path
- Deployment is independent of governance completion
- Currently blocking actual beta launch
- Should start immediately

---

**Summary:** Proceed with Option A (R1-D) as primary next phase, with Options F (R2-0) starting immediately in parallel. Options B/C/D/E can be evaluated based on project timeline and resource availability.
