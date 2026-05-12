# NEXT EXECUTION QUEUE
**Priority-Ordered Fixes Based on Forensic Audit**  
**Start Date:** 2026-05-12  
**Estimated Duration:** 20-30 hours  

---

## CRITICAL PATH (Must Fix Before Any Other Work)

### BLOCKER #1: Fix Growth Engine Workspace Isolation Bug
**Severity:** CRITICAL (Data Leakage Vulnerability)  
**Duration:** 8-12 hours  
**Dependency:** None (fixes can run immediately)

#### Root Cause
Growth engine services are stateless. They accept `workspaceId` parameter but don't verify workspace ownership of input data. Any workspace can pass metrics from any other workspace.

**Example:**
```typescript
// BROKEN - same metrics for all workspaces
const ws1Curve = RetentionEngine.calculateRetentionCurve(ws1, {1: 0.95, 2: 0.90})
const ws2Curve = RetentionEngine.calculateRetentionCurve(ws2, {1: 0.95, 2: 0.90})

// Both return SAME curve because service doesn't verify workspace owns the data
expect(ws1Curve.length).toBe(2) ✓
expect(ws2Curve.length).toBe(0) ✗ (actually returns 2)
```

#### Files Affected
1. `src/services/growth/retention-engine.ts`
2. `src/services/growth/acquisition-engine.ts`
3. `src/services/growth/pricing-engine.ts`
4. `src/services/growth/sales-pipeline-engine.ts`
5. `src/services/growth/unit-economics-engine.ts`

#### Fix Steps
1. **For each growth engine service:**
   - Add workspace data store (e.g., `Map<string, WorkspaceMetrics>`)
   - Validate workspace owns queried data before returning
   - Return `null` or error if workspace not found
   
2. **Example fix for RetentionEngine:**
   ```typescript
   // Add workspace-scoped data store
   private static workspaceMetrics = new Map<string, RetentionMetrics[]>();
   
   static getRetentionCurve(workspaceId: string, cohortId: string) {
     // Verify workspace owns this data
     const metrics = this.workspaceMetrics.get(workspaceId);
     if (!metrics) return { curve: [], error: "Not found" };
     
     const cohort = metrics.find(m => m.cohortId === cohortId);
     if (!cohort) return { curve: [], error: "Not found" };
     
     // Now safe to process
     return { curve: calculateCurve(cohort), error: null };
   }
   ```

3. **Verification:**
   - Run: `npm test -- growth`
   - All workspace isolation tests must pass
   - Cross-workspace queries must return empty/error

#### Tests That Must Pass
- `src/__tests__/services/growth/retention-engine.test.ts` "should prevent cross-workspace assessment"
- `src/__tests__/services/growth/retention-engine.test.ts` "should prevent cross-workspace curve analysis"
- `src/__tests__/services/growth/acquisition-engine.test.ts` "should prevent cross-workspace metric analysis"
- `src/__tests__/services/growth/acquisition-engine.test.ts` "should enforce workspace in ROI calculation"
- `src/__tests__/services/growth/pricing-engine.test.ts` (all strategy tests)
- `src/__tests__/services/growth/unit-economics-engine.test.ts` (all health assessment tests)

#### Success Criteria
```bash
$ npm test -- growth
✓ RetentionEngine: 30 tests passing
✓ AcquisitionEngine: 25 tests passing
✓ PricingEngine: 20 tests passing
✓ SalesPipelineEngine: 18 tests passing
✓ UnitEconomicsEngine: 15 tests passing
# Total 96 previously-failing tests must now PASS
```

---

### BLOCKER #2: Replace 21 Fake Placeholder Tests
**Severity:** CRITICAL (Hidden Code Quality)  
**Duration:** 3-5 hours  
**Dependency:** Blocker #1 (fixes the tests it reveals)

#### Root Cause
21 test files contain `expect(true).toBe(true)` placeholder assertions instead of real tests.

#### Files Affected
1. `src/__tests__/services/action.test.ts`
2. `src/__tests__/services/usage.service.test.ts`
3. `src/__tests__/api/review-cycles.test.ts`
4. `src/__tests__/api/escalation-checks.test.ts`
5. `src/__tests__/api/execution-certainty.test.ts`
6. `src/__tests__/api/actions.test.ts`
7. `src/__tests__/api/operator-queue.test.ts`
8. `src/__tests__/api/decisions.test.ts`
9. `src/__tests__/api/notifications.test.ts`
10. `src/__tests__/api/constraint-checks.test.ts`
... (11 more files)

#### Fix Steps
For each file:
1. Identify all `expect(true).toBe(true)` assertions
2. Replace with real assertions:
   - If testing service logic: verify inputs/outputs
   - If testing routes: verify status codes, response structure
   - If testing permissions: verify auth enforcement
3. Example:
   ```typescript
   // BEFORE (fake)
   it("should handle request", () => {
     expect(true).toBe(true);
   });
   
   // AFTER (real)
   it("should handle request with valid workspace", () => {
     const result = SomeService.process(workspaceId, data);
     expect(result.success).toBe(true);
     expect(result.data).toBeDefined();
   });
   ```

#### Success Criteria
```bash
$ npm test
Test Files  0 failed | 99 passed (99)  # ALL test files pass
Tests       0 failed | 3942 passed (3942)  # ALL tests pass
# Zero placeholder assertions remaining
```

---

### BLOCKER #3: Run Complete Test Suite Until All 3942 Pass
**Severity:** CRITICAL (Verification Gate)  
**Duration:** 1 hour (execution) + Blockers #1-2 (fixes)  
**Dependency:** Blockers #1-2

#### Verification
```bash
$ npm test
[Should output: "Tests 3942 passed (3942)"]
$ npm run build  
[Should output: "✓ Compiled successfully"]
$ npx tsc --noEmit
[Should output: "✓ No TypeScript errors"]
```

#### Success Criteria
- Zero failing tests
- Zero skipped tests  
- Build succeeds with 0 errors
- TypeScript strict mode passes

---

## PHASE 2: FIX CRITICAL ARCHITECTURE (Parallel with Phase 1)

### BLOCKER #4: Add Database-Backed Stores for Growth Engines
**Severity:** HIGH (Scalability)  
**Duration:** 8-12 hours  
**Dependency:** DATABASE_URL (Phase 3)  
**Can Start During:** Phase 1 (code prep before DB available)

#### Root Cause
Growth engines use in-memory stores, cannot scale to multi-instance or persist across restarts.

#### Fix Steps
1. **Define Prisma models for growth data:**
   ```prisma
   model RetentionMetrics {
     id String @id
     workspaceId String
     cohortMonth String
     monthlyRetention Json
     createdAt DateTime @default(now())
     @@index([workspaceId, cohortMonth])
   }
   
   model AcquisitionMetrics { ... }
   model PricingAnalysis { ... }
   model SalesPipelineData { ... }
   model UnitEconomicsAnalysis { ... }
   ```

2. **Update growth engine services to use Prisma:**
   ```typescript
   static async recordMetrics(workspaceId: string, data: ...) {
     return await db.retentionMetrics.create({
       data: {
         workspaceId,
         ...data
       }
     });
   }
   ```

3. **Migrate in-memory stores to DB queries**

#### Files to Create
- `prisma/migrations/*_add_growth_engine_tables/migration.sql`

#### Files to Modify
- `src/services/growth/retention-engine.ts`
- `src/services/growth/acquisition-engine.ts`
- `src/services/growth/pricing-engine.ts`
- `src/services/growth/sales-pipeline-engine.ts`
- `src/services/growth/unit-economics-engine.ts`

#### Success Criteria
```bash
$ npx prisma validate
✓ Schema valid
$ npm test -- growth
✓ All growth tests pass with DB-backed stores
```

---

### BLOCKER #5: Integrate Rate Limiting Middleware Into Protected Routes
**Severity:** HIGH (Monetization)  
**Duration:** 10-15 hours  
**Dependency:** RateLimitMiddleware exists, needs integration  
**Can Start:** Immediately (non-DB work)

#### Root Cause
Rate limiting middleware is implemented but not applied to any routes. ~50 POST/PATCH/DELETE routes need wrapping.

#### Fix Steps
1. **Identify all protected routes that need rate limiting:**
   - POST /api/actions/*
   - POST /api/decisions/*
   - POST /api/recommendations/*
   - POST /api/experiments/*
   - PATCH /api/actions/*
   - PATCH /api/decisions/*
   - DELETE /api/actions/*
   - DELETE /api/decisions/*
   - ... (50 total)

2. **Apply middleware:**
   ```typescript
   export const POST = applyRateLimit(
     withRequestContext(async (req) => {
       // existing handler
     }),
     {
       windowMs: 3600000, // 1 hour
       maxRequests: 100,
       keyGenerator: (req) => req.context.workspaceId
     }
   );
   ```

3. **Test rate limiting enforcement:**
   - Exceed limit, verify 429 response
   - Different workspaces have separate limits

#### Files to Modify
- `src/app/api/actions/route.ts` and children
- `src/app/api/decisions/route.ts` and children
- `src/app/api/recommendations/route.ts` and children
- `src/app/api/experiments/route.ts` and children
- ~50 route files total

#### Success Criteria
```bash
$ npm test -- rate-limit
✓ Rate limiting enforced on all protected routes
$ npm run build
✓ Build succeeds (91 routes, no new errors)
```

---

### BLOCKER #6: Integrate Entitlement Middleware Into Protected Routes
**Severity:** HIGH (Monetization)  
**Duration:** 3-5 hours  
**Dependency:** EntitlementService exists, needs integration

#### Root Cause
Entitlement checking middleware defined but not applied to routes. Subscription tier enforcement not active.

#### Fix Steps
1. **Apply entitlement middleware:**
   ```typescript
   export const POST = withAuth(
     withEntitlement(CAPABILITIES.ACTION_CREATE, { tier: "PRO" }),
     async (req) => {
       // existing handler
     }
   );
   ```

2. **Test subscription enforcement:**
   - FREE tier: blocked from premium actions
   - PRO tier: allowed
   - ENTERPRISE tier: allowed

#### Files to Modify
- All POST/PATCH/DELETE routes in `/api/actions/*`
- All POST/PATCH/DELETE routes in `/api/decisions/*`
- All routes marked premium in spec

#### Success Criteria
```bash
$ npm test -- entitlement
✓ Subscription tier enforcement working
✓ Quota checks passing
```

---

## PHASE 3: DEPLOY PERSISTENCE

### BLOCKER #7: Configure DATABASE_URL
**Severity:** CRITICAL (Infrastructure)  
**Duration:** 0.5 hours  
**Dependency:** PostgreSQL instance available

#### Verification Steps
```bash
# 1. Get PostgreSQL connection string
# 2. Set environment variable
export DATABASE_URL="postgresql://user:pass@host:5432/opsiq"

# 3. Verify connectivity
psql $DATABASE_URL -c "SELECT 1"
# Output should be: 1

# 4. Verify Prisma sees it
npx prisma validate
# Should pass
```

#### Success Criteria
```bash
$ echo $DATABASE_URL
postgresql://...
$ npx prisma validate
✓ Schema valid 🚀
```

---

### BLOCKER #8: Run Prisma Migrations
**Severity:** CRITICAL (Database Setup)  
**Duration:** 1 hour  
**Dependency:** DATABASE_URL configured (Blocker #7)

#### Steps
```bash
$ npx prisma migrate deploy
[creates all tables]

$ npx prisma generate
[updates Prisma client]

$ npm test -- db
✓ Database tests passing
```

#### Success Criteria
```bash
$ psql $DATABASE_URL -c "\dt"
# Should list: workspaces, recommendations, engagements, actions, decisions, experiments, growth_* tables

$ npx prisma validate
✓ Schema valid
```

---

## PHASE 4: ENTERPRISE HARDENING

### BLOCKER #9: Implement Admin Dashboard
**Severity:** HIGH (Enterprise)  
**Duration:** 8-12 hours  
**Dependency:** Database available (Phase 3)

#### Requirements
- GET /api/admin/workspaces (list all workspaces)
- GET /api/admin/workspaces/[id]/members (list users)
- GET /api/admin/audit-log (queryable audit trail)
- POST /api/admin/workspaces/[id]/disable (soft delete)

#### Files to Create
- `src/app/api/admin/workspaces/route.ts`
- `src/app/api/admin/workspaces/[id]/members/route.ts`
- `src/app/api/admin/audit-log/route.ts`

#### Tests Required
- 50+ tests covering admin access control
- Permission matrix tests (admin-only data)
- Audit trail query accuracy tests

#### Success Criteria
```bash
$ npm test -- admin
✓ Admin API tests passing
$ npm run build
✓ Build succeeds
```

---

### BLOCKER #10: Implement Webhook Infrastructure
**Severity:** MEDIUM (Integration)  
**Duration:** 6-8 hours  
**Dependency:** Database available (Phase 3)

#### Requirements
- POST /api/webhooks/subscribe (register webhook endpoint)
- POST /api/webhooks/test (send test payload)
- Webhook delivery with retry logic
- HMAC-SHA256 signature verification

#### Files to Create
- `src/app/api/webhooks/route.ts`
- `src/services/webhooks.ts`
- `src/infra/webhook-delivery.ts`

#### Tests Required
- 40+ tests covering delivery, retry, signature validation

---

## PHASE 5: VERIFICATION GATES (Before Deployment)

### Gate 1: Code Quality
```bash
$ npm test  # 3942 tests, 0 failures
$ npm run build  # succeeds
$ npx tsc --noEmit  # passes
```

### Gate 2: Security
```bash
$ npm test -- workspace-isolation  # all pass
$ npm test -- permission-matrix  # all pass
$ npm test -- dto-leakage  # all pass
```

### Gate 3: Database
```bash
$ npx prisma validate  # passes
$ npx prisma migrate deploy  # succeeds
$ npm run test:db  # all DB tests pass
```

### Gate 4: Enterprise
```bash
$ npm test -- admin-governance  # passes
$ npm test -- enterprise-safety  # passes
```

---

## EXECUTION SEQUENCE

```
DAY 1-2 (Code Fixes - Can start immediately)
├─ BLOCKER #1: Fix growth engine workspace isolation (8-12 hrs)
├─ BLOCKER #2: Replace fake placeholder tests (3-5 hrs)
└─ BLOCKER #3: Run full test suite (1 hr when #1-2 done)

DAY 2-3 (Architecture - Start while awaiting DB)
├─ BLOCKER #4: Add database-backed stores (8-12 hrs, prep code)
├─ BLOCKER #5: Integrate rate limiting middleware (10-15 hrs)
└─ BLOCKER #6: Integrate entitlement middleware (3-5 hrs)

DAY 3 (Infrastructure Setup)
├─ BLOCKER #7: Configure DATABASE_URL (0.5 hrs)
└─ BLOCKER #8: Run Prisma migrations (1 hr)

DAY 4-5 (Enterprise Features)
├─ BLOCKER #9: Admin dashboard (8-12 hrs)
└─ BLOCKER #10: Webhook infrastructure (6-8 hrs)

DAY 5+ (Final Verification)
└─ All gates passing → DEPLOYABLE
```

---

## ROLLBACK RISK ASSESSMENT

| Blocker | Rollback Risk | Impact | Mitigation |
|---------|---------------|--------|-----------|
| #1: Growth engine fix | LOW | Bug fix only | Commit to feature branch, test locally |
| #2: Fake test replacement | LOW | Test improvement | Git diff to verify no behavior change |
| #3: Full test suite | NONE | Verification only | Just running tests |
| #4: DB-backed stores | MEDIUM | Schema addition | Create new migrations, keep old code path |
| #5: Rate limit integration | MEDIUM | Middleware wrapper | Can disable middleware per route if needed |
| #6: Entitlement middleware | MEDIUM | Middleware wrapper | Can disable per route if needed |
| #7: DATABASE_URL | NONE | Config only | Just env var |
| #8: Migrations | HIGH | Schema committed | Careful ordering, test in staging first |
| #9: Admin dashboard | MEDIUM | New endpoints | Can delete routes if issues |
| #10: Webhooks | MEDIUM | New service | Can disable if issues |

---

## DEPLOYMENT READINESS CHECKLIST

**Before Merging to Main:**
- [ ] Growth engine isolation bug FIXED
- [ ] 21 fake tests REPLACED with real assertions
- [ ] All 3942 tests PASSING
- [ ] npm run build SUCCEEDING
- [ ] npx tsc --noEmit PASSING

**Before Production Deployment:**
- [ ] DATABASE_URL configured
- [ ] Migrations deployed
- [ ] Admin dashboard implemented
- [ ] Webhook infrastructure complete
- [ ] All 4 verification gates PASSING
- [ ] Monitoring alerts configured
- [ ] Backup/restore tested
- [ ] Runbooks written

---

**Queue Created:** 2026-05-12  
**Total Estimated Time:** 20-30 hours focused development  
**Critical Path:** Blockers #1-3 → #7-8 → #4-6 → #9-10  
**First Action:** Fix growth engine workspace isolation (Blocker #1)
