# R0 Selected Readiness Roadmap — Option E (Parallel 4-Phase Plan)

**Date:** 2026-05-16  
**Selected Strategy:** Option E — Parallel Governance + Deployment + Payment + UX  
**Baseline:** main @ a19cb89 (X9 hardening closed, close route modernized)  
**Target:** Private beta Week 3, Paid beta Week 4+  

---

## Executive Summary

Three-week plan to private beta launch with parallel execution of four readiness tracks. All tracks coordinated by explicit gates that validate progress and prevent blocking. Total effort: 160-210 hours distributed across dedicated team.

---

## PHASE R1: GOVERNANCE HARDENING (Weeks 1-3, Parallel)

**Objective:** Modernize 30+ API routes from legacy withAuth() pattern to ctx.verifiedSessionSnapshot with capability enforcement.

**Blockers to Resolve:** BL-001, BL-003  
**Dependency:** Close route pattern (proven in X9G-4)

### Lane 1: Routes 1-15 (Week 1, Days 1-5)

| Day | Routes | Task |
|-----|--------|------|
| 1-2 | Billing (5) | Replace withAuth() → ctx.verifiedSessionSnapshot; add capability checks |
| 2-3 | Owner (5) | Same pattern; test each route |
| 4-5 | Recommendations (5) | Complete conversion; verify all imports removed |
| 5 | Validation | Run all tests; confirm 0 auth-guard imports in build |

**Acceptance:** 15 routes modernized, tests passing, no auth-guard imports in Lane 1 files.

### Lane 2: Routes 16-25 (Week 2, Days 6-12)

| Day | Routes | Task |
|-----|--------|------|
| 6-7 | Decision APIs (5) | Convert pattern; add DECISION_CREATE/UPDATE/EXECUTE capability checks |
| 8-9 | Intervention APIs (5) | Convert; test intervention execution guards |
| 10-12 | Service layer cleanup (5) | Remove auth-guard imports from services; update type imports |
| 12 | Integration test | Full workflow: request → auth → capability enforcement |

**Acceptance:** 25 routes modernized, integration test passes, scanner violations down 50%+.

### Lane 3: Routes 26-35 (Week 3, Days 13-17)

| Day | Routes | Task |
|-----|--------|------|
| 13-14 | Admin APIs (5) | Convert; ensure admin capability enforced |
| 15-16 | Audit/webhook (5) | Convert remaining routes |
| 17 | Scanner validation | Run scanner; expect 0 CRITICAL, 0 BLOCK_BUILD in production routes |
| 17 | Build validation | npm run build must succeed (with DATABASE_URL configured) |

**Acceptance:** All 35 routes modernized, scanner reports 0 violations, build passes.

### Pattern Template (from close route)
```typescript
// src/app/api/route-name/route.ts
export const POST = withEnforcementFull(async (ctx) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  
  // Capability check enforced by middleware, but validate in handler
  if (!policy.can('CAPABILITY_NAME')) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  // Handler receives pre-authenticated, pre-authorized context
  // Proceed with business logic
});
```

### Testing per Lane
- Unit tests: each route must pass its existing tests
- Capability tests: attempt bypass with missing capability → verify 403
- Integration tests: end-to-end workflow with auth and capability enforcement
- Regression tests: original functionality preserved

---

## PHASE R2: DEPLOYMENT INFRASTRUCTURE (Weeks 1-2, Parallel, then Week 3)

**Objective:** Enable production deployment with automated build, K8s manifests, and documented runbook.

**Blockers to Resolve:** BL-002, BL-014

### Week 1 (Days 1-4): Infrastructure Foundation

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Create Dockerfile | Multi-stage: deps → build → runtime |
| 2 | Create K8s manifests | deployment.yaml, service.yaml, ingress.yaml |
| 2 | GitHub Actions workflow | Build → test → push → deploy-staging |
| 3 | Staging database | Configure PostgreSQL connection pool |
| 4 | First deployment | Deploy to staging; validate health checks |

**Acceptance:** Dockerfile builds successfully; K8s deployment reaches Ready state in <5 minutes.

### Week 2 (Days 5-10): Testing & Documentation

| Day | Task | Validation |
|-----|------|-----------|
| 5-6 | Load testing | k6: 100 req/sec for 5 min; no errors |
| 7 | Database migration | Verify prisma migrate runs on deploy |
| 8 | Rollback test | Deploy version N, rollback to N-1, verify |
| 9 | Secrets audit | Verify no secrets in git; all env-var driven |
| 10 | Documentation | DEPLOYMENT.md with runbook, troubleshooting |

**Acceptance:** Staging deployment healthy for 48+ hours; rollback tested and successful.

### Week 3 (Days 11-14): Production Readiness Validation

| Day | Task |
|-----|------|
| 11-12 | Production database connectivity test |
| 13 | Security hardening (network policies, pod security) |
| 14 | Incident response runbook (deployment rollback, emergency procedures) |

**Acceptance:** Production deployment procedures documented and validated.

### Environment Variables Required
```
DATABASE_URL=postgresql://user:pass@host/opsiq
NEXT_PUBLIC_APP_URL=https://opsiq.example.com
STRIPE_API_KEY=(if payment beta)
NEXTAUTH_SECRET=<32-char random>
NEXTAUTH_URL=https://opsiq.example.com
```

---

## PHASE R3: PAYMENT INTEGRATION (Weeks 2-3, Parallel, start after governance clears billing)

**Objective:** Enable subscription billing and tier enforcement.

**Blockers to Resolve:** BL-004, BL-005, BL-006

**Dependency:** BL-003 (billing route modernized) must be complete first (by Day 5).

### Week 2 (Days 4-10): Stripe Core Setup

| Day | Task | Deliverable |
|-----|------|-------------|
| 4-5 | Stripe account setup | Test and live keys configured |
| 5-6 | Create price objects | Free, Pro ($99/mo), Enterprise (custom) |
| 7 | Webhook endpoint | POST /api/webhooks/stripe |
| 8-9 | Webhook testing | Simulate Stripe events; verify processing |
| 9-10 | Webhook monitoring | Confirm all events received and stored in DB |

**Acceptance:** Webhook endpoint receiving and processing Stripe events correctly.

### Week 3 (Days 11-17): Entitlement & Rate Limiting

| Day | Task | Validation |
|-----|------|-----------|
| 11-12 | Quota system | Add quota tracking to capability system |
| 13-14 | Tier enforcement | Decision/action creation checks tier limit |
| 15 | Rate limiting | Integrate rate-limit.ts into enforcement wrapper |
| 16 | Admin quota UI | Workspace quota viewing and override |
| 17 | End-to-end test | Signup → checkout → subscription → tier enforcement |

**Acceptance:** Full payment lifecycle working (signup, checkout, subscription status, tier enforcement, rate limiting).

### Key Endpoints
```
POST /api/billing/upgrade
  Input: { planId: "stripe_price_xxx" }
  Output: { sessionUrl: "https://checkout.stripe.com/..." }

POST /api/webhooks/stripe
  Input: Stripe event (invoice.paid, etc.)
  Output: 200 OK (event processed)

GET /api/billing/quota
  Output: { tier: "pro", decisions_used: 45, limit: 100 }
```

---

## PHASE R4: USER EXPERIENCE (Weeks 1-2, Parallel)

**Objective:** Deliver first-value experience and engagement drivers.

**Blockers to Resolve:** BL-011 (optional for MVP)

### Week 1 (Days 1-5): Onboarding Wizard

| Day | Task | Deliverable |
|-----|------|-------------|
| 1-2 | Design flow | 5-step wizard: workspace name, team size, industry, templates |
| 3-4 | Implement component | React form with validation and progress |
| 5 | Create templates | Sample business case + engagement templates |

**Acceptance:** Onboarding wizard loads in <2 sec; user reaches first-value in <5 minutes.

### Week 2 (Days 6-10): Notifications & Polish

| Day | Task | Deliverable |
|-----|------|-------------|
| 6-7 | Notification service | Email/in-app for due actions and escalations |
| 8 | User preferences | Notification channel and frequency settings |
| 9-10 | First-value dashboard | Quick-start card, contextual help, sample workflows |

**Acceptance:** Notification emails arrive within 1 minute; first-value completion rate ≥80%.

---

## GATE SYSTEM — Sequential Validation

### GATE 1: Week 1 Governance (Day 8)
**Condition:** 15 routes modernized + build passes with DATABASE_URL

**Validation:**
```bash
npm run build  # Exit code 0
npm test -- policy-wrapper-enforcement  # 32 pass
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Expect: violations reduced significantly in modernized routes
```

**Unlock:** Private beta can begin limited rollout; parallel tracks continue.

---

### GATE 2: Deployment Proven (Day 10)
**Condition:** Staging deployment healthy for 24+ hours + rollback tested

**Validation:**
```bash
kubectl rollout status deployment/opsiq --timeout=5m
curl https://staging.opsiq.example.com/api/health
  # Expected: {"status": "healthy"}
```

**Unlock:** Production deployment procedures validated.

---

### GATE 3: Full Governance + Deployment (Day 14)
**Condition:** All 35 routes modernized + scanner 0 violations + build passes

**Validation:**
```bash
npm run build  # Exit code 0
npx tsx src/governance/auth-shadow-read-scanner.ts
  # Expected: violations 0 (or <5 in test/comment code only)
npm test  # All governance tests pass
```

**Unlock:** Private beta deployment authorized with full governance hardening.

---

### GATE 4: Payment Integration (Day 17)
**Condition:** Stripe integration end-to-end tested (checkout → subscription → tier enforcement)

**Validation:**
```bash
# Create test subscription
stripe checkout.sessions create --customer cus_xxx --line-items 0.price=price_xxx,0.quantity=1

# Verify in database
psql -c "SELECT * FROM Subscription ORDER BY createdAt DESC LIMIT 1"

# Verify webhook received
psql -c "SELECT * FROM WebhookEvent WHERE type LIKE 'payment%' ORDER BY receivedAt DESC LIMIT 1"
```

**Unlock:** Paid beta launch authorized; revenue can begin.

---

## What CAN Be Deferred (Safe for Phase 5+)

| Feature | Rationale |
|---------|-----------|
| SSO (Azure AD, Okta) | Enterprise feature; can add in Phase 5 (Enterprise Readiness) |
| Data encryption at rest | Regulatory feature; can add in Phase 5 (EU Expansion) |
| Advanced runtime-proof tests (RP8/RP9) | Can run in parallel as Phase H |
| Structured onboarding (full) | Basic onboarding sufficient; enhance in Phase 5 |
| Admin analytics dashboard | Can defer to Phase 5 (Public Beta Hardening) |
| E2E test suite | Unit tests adequate; E2E nice-to-have for Phase 5 |
| closeDecision service refactor | Wait for private beta usage data; Phase 5 |

---

## What CANNOT Be Deferred

| Feature | Why |
|---------|-----|
| Route modernization (R1) | 163 BLOCK_BUILD violations prevent build |
| Stripe modernization (R3 partial) | BL-003 (billing route) must be modernized before payment |
| Deployment pipeline (R2) | No path to production without it |
| Database configuration | Build requires DATABASE_URL environment |
| Rate limiting (R3 partial) | Service vulnerable to abuse without throttling |

---

## Effort & Timeline Summary

| Phase | Owner | Hours | Weeks | Status |
|-------|-------|-------|-------|--------|
| **R1: Governance** | Backend Lead + Backend | 80-120 | 3 weeks, starting Day 1 |
| **R2: Deployment** | DevOps | 12-20 | 2 weeks, Days 1-10 (parallel) |
| **R3: Payment** | Backend Engineer | 40-60 | 2.5 weeks, starting Day 4 (after R1 clears billing) |
| **R4: UX** | Frontend Lead + Frontend | 20-30 | 1.5 weeks, Days 1-10 (parallel) |
| **Total** | Full Team | 152-230 | 3 weeks (compressed parallel) |

**Private Beta Ready:** Week 3, after Gate 1-3 pass (R1 + R2 complete)  
**Paid Beta Ready:** Week 3+, after Gate 4 passes (R3 complete)

---

## Team Allocation

- **Backend Lead:** 40+ hours/week on R1 governance
- **Backend Engineer #2:** 30+ hours/week on R1 + support R3
- **DevOps Engineer:** 20 hours/week on R2 (Days 1-10)
- **Frontend Lead:** 20 hours/week on R4
- **Backend #3 (if available):** 30+ hours/week on R3 payment from Day 4+
- **QA/Testing:** 10 hours/week across all phases

**Minimum Team:** 3-4 developers + 1 DevOps  
**Optimal Team:** 4-5 developers + 1 DevOps

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Route modernization takes longer | Medium | Parallelize routes; extend Week 3 if needed |
| Stripe webhook integration fails | Low | Use Stripe sandbox; start early |
| Database connection timeout in prod | Low | Connection pooling; load test staging |
| Build fails with DATABASE_URL missing | High | Document env requirement; CI/CD pre-check |
| Rate limiting too aggressive | Low | Conservative defaults (1000 req/min initially) |

---

## Success Criteria

### Private Beta Launch (Week 3)
- ✓ All governance blockers resolved (BL-001, BL-002, BL-003, BL-006, BL-014)
- ✓ Scanner reports 0 violations or <5 in test code only
- ✓ Build passes with DATABASE_URL configured
- ✓ Staging deployment healthy for 48+ hours
- ✓ Onboarding wizard complete
- ✓ All 78 governance tests passing

### Paid Public Beta (Week 4+)
- ✓ All payment blockers resolved (BL-004, BL-005)
- ✓ Stripe integration end-to-end tested
- ✓ Tier enforcement and rate limiting active
- ✓ 10+ trial customers processed successfully
- ✓ Zero escalations due to governance or deployment issues

