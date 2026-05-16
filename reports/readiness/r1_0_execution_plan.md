# R1-0: Execution Plan — Governance Hardening Lane-by-Lane

**Date:** 2026-05-16  
**Phase:** R1 (Governance Hardening)  
**Strategy:** Lane-based implementation with batch sequencing  
**Total Effort:** 80-120 hours (3 weeks)  
**Team:** 2-3 backend engineers  

---

## R1 Phase Structure

R1 is NOT "modernize all 444 violations at once."  
R1 IS "systematic lane-based modernization with gates between lanes."

---

## R1-A: Safe Routes (Lanes 1-4)

**Scope:** 240 violations across ~40-50 routes  
**Timeline:** Week 1-2  
**Risk:** LOW (proven pattern)  
**Prerequisites:** None (can start immediately)  
**Blockers:** None  

### R1-A Batches

#### Batch 1.1 (Days 1-2): Operator Read Routes
- Routes: operator/myday, operator/queue
- Violations: ~6
- Pattern: withAuth() → ctx.verifiedSessionSnapshot (read-only)
- Tests: Must pass 100%
- Validation Command: `npm test -- operator && npx tsx src/governance/auth-shadow-read-scanner.ts`

**Gate 1.1:** Both routes pass tests + scanner shows violation reduction

#### Batch 1.2 (Days 3-4): Billing & My-Day Routes
- Routes: billing/upgrade, operator/my-day
- Violations: ~6
- Pattern: withAuth() → ctx.verifiedSessionSnapshot (with mutations)
- Tests: Must pass 100%
- Validation: `npm test -- billing && npm test -- operator`

**Gate 1.2:** Both routes pass tests + scanner shows continued reduction

#### Batch 1.3 (Days 5-6): Recommendation Routes
- Routes: recommendations/*, read-only endpoints
- Violations: ~6
- Pattern: withAuth() → ctx.verifiedSessionSnapshot (read-only)
- Tests: Must pass 100%
- Validation: `npm test -- recommendations`

**Gate 1.3:** All 5 routes pass tests, scanner shows ~15-20 violation reduction total

#### Batch 1.4 (Days 7-9): Owner Dashboard Routes
- Routes: owner/dashboard, owner/config
- Violations: ~6-8
- Pattern: withAuth() → ctx.verifiedSessionSnapshot (dashboard access)
- Tests: Must pass 100%
- Complexity: Owner routes may need admin capability check
- Validation: `npm test -- owner`

**Gate 1.4:** Owner routes pass tests

#### Batch 1.5+ (Days 10-12): Additional Lane 1-4 Routes
- Continue with low-risk routes from Lanes 1, 2, 3, 4
- Gradually increase scope as pattern repetition proves reliability
- Maximum 3-5 routes per batch
- Stop when Lane 1-4 coverage reaches 80% (~180-190 violations resolved)

**Gate 1.5+:** Cumulative scanner reduction to ~200-250 violations remaining

---

## R1-B: Service Boundary Routes (Lane 5)

**Scope:** 58 violations in service layers  
**Timeline:** Week 2-3  
**Risk:** MEDIUM (service refactor needed)  
**Prerequisites:** Lane 1-4 complete + service input contracts defined  
**Blockers:** Must define service boundary contracts before implementation  

### R1-B Tasks

#### Task 1: Define Service Input Contracts
- Document current shape: what auth-guard services expect
- Document new shape: what ctx.verifiedSessionSnapshot provides
- Create migration guide for each service

**Validation:** Contracts reviewed and approved by backend team

#### Task 2: Service Refactor (Phased)
- Services: owner-dashboard.service.ts, stage.ts, etc.
- Pattern: Change from `(workspaceId, authContext)` → `(workspaceId, verifiedSnapshot)`
- Update all callers to use new signature

**Validation:** `npm test -- services` passes

#### Task 3: Caller Updates
- Update all routes that call refactored services
- Verify they pass new signature and extract policy correctly

**Validation:** All route tests pass + scanner shows 58 more violations resolved

**Gate 1.B:** Services refactored, all tests pass, scanner shows ~300-350 violations remaining

---

## R1-C: Unknown Routes (Lane 8)

**Scope:** 43 violations in edge cases  
**Timeline:** Week 3+  
**Risk:** UNKNOWN (audit needed)  
**Prerequisites:** Lanes 1-4 and Lane 5 complete  
**Blockers:** Each violation must be audited individually  

### R1-C Tasks

#### Task 1: Audit Unknown Violations
- Review each of 43 violations in detail
- Classify into Lanes 1-7 based on actual code patterns
- Document findings

**Validation:** All 43 violations classified with remediation path

#### Task 2: Implement Based on Classification
- Violations reclassified to Lane 1-5 → implement in appropriate batch
- Violations classified to Lane 6 or 7 → handle accordingly

**Validation:** All audited violations have remediation plan

**Gate 1.C:** All 43 violations classified and implementation path defined

---

## R1-D: False Positives & Test Code (Lane 6 & 7)

**Scope:** 103 violations (25 false positives + 78 test/dev code)  
**Timeline:** Week 3 (parallel to R1-C)  
**Risk:** NONE (test code only)  
**Prerequisites:** Optional - can skip if not impacting release  
**Blockers:** None  

### R1-D Tasks

#### Task 1: Safe-List False Positives (Lane 6)
- Mark 25 violations as false positives in scanner config
- Document why each is safe-listed

**Validation:** Scanner configuration updated

#### Task 2: Update Test Fixtures (Lane 7)
- Update test code to use new auth patterns
- Update dev fixtures if needed
- Exclude test code from production scanner run

**Validation:** Test suite passes with new auth patterns

**Gate 1.D:** Scanner configured; test code updated (optional)

---

## Quality Gates

### Gate 1: End of Batch (Per Batch)
```bash
# Must pass:
npm test -- [batch-routes]
npm test -- governance-capabilities          # 32/32
npm test -- policy-wrapper-enforcement       # 32/32
npm test -- g6r-auth-bridge                  # 14/14
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Expect: violations reduced, cumulative from batch 1.1 start
```

**Stop Condition:** Any test fails → investigate + fix + retest (do NOT skip failing tests)

### Gate 2: After Lane 1-4 Complete
```bash
# All tests must pass
npm test
  # Expect: 5119+/5310 pass (no regression)
  
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Expect: violations < 200 (from 444 starting)
  
npm run build  # With DATABASE_URL configured
  # Expect: exit code 0
```

**Stop Condition:** If build fails or tests regress → pause R1-B, investigate

### Gate 3: After Lane 5 Complete
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Expect: violations < 100
  
npm test
  # Expect: no regression
```

**Stop Condition:** Any service refactor breaks tests → rollback that service, audit before retry

### Gate 4: After Lane 8 & Audit
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Expect: violations < 50 (or 0 if all audited)
  
npm test
  # Expect: all tests passing
```

### Final Gate: R1 Complete
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Must: violations = 0 (or < 5 in test code only)
  
npm run build  # With DATABASE_URL
  # Must: exit code 0
  
npm test
  # Must: all tests passing
  
git log --oneline | head -1
  # Must: latest commit is R1 completion
```

**Success Criteria:**
- ✓ Scanner reports 0 block-build violations
- ✓ Scanner reports 0 critical violations (in production routes)
- ✓ Build succeeds
- ✓ All 78 core governance tests pass
- ✓ All 5310+ total tests pass (or only known failures like RP8/RP9)

---

## Stop Conditions (When to Pause R1)

### Critical Stop Conditions
1. **Build fails after route change** → Pause all routes, debug migration pattern
2. **Core governance tests fail** → Pause, verify capability system not broken
3. **Route test fails + cannot be fixed in 30 minutes** → Rollback batch, audit issue before retry
4. **Service refactor breaks 5+ callers** → Pause, re-evaluate service boundary contract
5. **Scanner output increases violations** → Stop, investigate regex patterns

### Minor Stop Conditions (Can Continue)
- RP8/RP9 runtime-proof tests fail (advanced phase, can proceed in parallel)
- Test coverage drops but tests pass (acceptable for MVP)
- Intermediate batch shows no violation reduction (verify scanner is working)

### When to Pivot to R1-B
- All Lanes 1-4 routes pass tests (no minimum violation count required)
- Service input contracts are defined
- Backend team confirms readiness to refactor services

---

## Maximum Scope Limits

**Per Batch:** Maximum 5 routes or 1 service  
**Per Week:** Maximum 20 routes or 3 services  
**Total R1:** 444 violations across ~40-50 routes + ~10-15 services

**Never:**
- Don't batch >5 routes without testing intermediate progress
- Don't change >20 files in single commit
- Don't skip test validation between batches
- Don't refactor multiple services in parallel
- Don't commit code that breaks any test, even "known failures"

---

## Validation Commands per Phase

### R1-A Validation
```bash
npm test -- operator && npm test -- billing && npm test -- recommendations && npm test -- owner
npm test -- governance-capabilities
npm test -- policy-wrapper-enforcement
npx tsx src/governance/auth-shadow-read-scanner.ts | head -20
```

### R1-B Validation
```bash
npm test  # Full suite
npx tsx src/governance/auth-shadow-read-scanner.ts | head -20
```

### R1-C Validation
```bash
npm test  # Full suite
npm test -- [audit-classified-routes]
```

### R1-D Validation
```bash
npm test  # Full suite
npx tsx src/governance/auth-shadow-read-scanner.ts | grep -E "Total|Critical|Block"
```

---

## Team Allocation

| Role | Hours/Week | Responsibility |
|------|-----------|-----------------|
| Backend Lead | 30-35 | R1-A route modernization (lead developer) |
| Backend #2 | 30-35 | R1-A parallel routes + R1-B service refactor |
| Backend #3 (if available) | 20-25 | R1-C audit + R1-D test code |
| QA | 10-15 | Validation between batches |

**Minimum Team:** 2 backend engineers (lead + secondary)  
**Optimal Team:** 3 backend engineers + 1 QA  

---

## Success Metrics

By end of R1:
- ✓ 444 → 0 violations (100% resolution)
- ✓ All core tests passing (78/78)
- ✓ Build succeeds with DATABASE_URL
- ✓ No test regressions
- ✓ Pattern established for future maintenance

---

## Timeline Estimate

| Phase | Duration | Violations Resolved |
|-------|----------|-------------------|
| R1-A (Lanes 1-4) | 2 weeks | 240 violations (54%) |
| R1-B (Lane 5) | 1 week | 58 violations (13%) |
| R1-C (Lane 8) | 1 week | 43 violations (10%) |
| R1-D (Lanes 6-7) | 3-4 days | 103 violations (23%) |
| **Total R1** | **3-4 weeks** | **444 violations (100%)** |

**Compressed with 3 developers:** 2-3 weeks  
**With 2 developers:** 3-4 weeks  
**With 1 developer:** 6-8 weeks (not recommended)  

