# Production Hardening Pack for Phase 1–5

**Date:** 2026-04-28  
**Audit Status:** Hostile audit complete on main branch  
**Scope:** Phase 1–5 (operator queue, calibration, decision engine, scenario lab, override, policy, reporting)

---

## 1. Executive Verdict

| Status | Answer |
|--------|--------|
| **Production-ready** | ❌ NO |
| **Paid-pilot-ready** | ❌ NO |
| **Enterprise-ready** | ❌ NO |

**Reason:** 8 P0 blockers prevent any real-world deployment. All Phase 1–5 data is ephemeral; auth is absent; financial outputs are unauditable; safety checks are broken.

---

## 2. P0 Blocker Index

### P0.1: In-Memory Persistence Only
**Risk:** Data loss on restart. No SLA, audit trail, or recovery.  
**Inspected:**
- `src/services/operator/store.ts` (lines 5–6: `let store: OperatorItem[] = []`)
- `src/services/override/store.ts` (line 3: `let overrideStore: OverrideRecord[] = []`)
- `src/services/entity/store.ts` (lines 3–4: in-memory only)
- `src/services/calibration/summary.ts` (uses in-memory store)
- `prisma/schema.prisma` (0 of 8 required models present)

**Still Need:**
- Verify all Phase 1–5 APIs for Prisma usage (grep all routes)
- Check if any Phase 1–5 data already has a database write anywhere

---

### P0.2: No Session-Based Authentication
**Risk:** Any client can call any API. No user accountability.  
**Inspected:**
- `src/services/auth.ts` (proper session/RBAC exists for Module 2–3)
- `src/app/api/operator/route.ts` (no requireSession call)
- `src/app/api/override/route.ts` (no auth check)
- `src/app/api/calibration/route.ts` (no auth check)
- `src/app/api/report/route.ts` (no auth check)
- `src/app/api/entity/route.ts` (no auth check)

**Still Need:**
- Grep all Phase 1–5 API routes for requireSession/requirePolicyContext calls
- Verify Module 2–3 auth patterns are complete and usable

---

### P0.3: Role Accepted from Request Body
**Risk:** Client-side role spoofing. No server-side validation.  
**Inspected:**
- `src/app/api/operator/route.ts` (line 28: `const { id, status, actualOutcome, role } = body;`)
- Role used directly in canEdit() call without session validation

**Still Need:**
- Find all Phase 1–5 APIs accepting role parameter
- Verify no other auth checks bypass session

---

### P0.4: Hardcoded Financial Baselines & Multipliers
**Risk:** Cannot defend $1.2M recommendation. No assumption tracking.  
**Inspected:**
- `src/services/finance/normalize.ts` (lines 34–35: hardcoded 0.7, 1.3 multipliers)
- `src/services/system/run.ts` (line 45: hardcoded baseline 10000/5000)
- `src/app/api/run/route.ts` (lines 26–29: hardcoded revenueChange * 0.1, confidence = 0.75)
- `src/services/scenario/engine.ts` (line 19: hardcoded confidence = 0.8)

**Still Need:**
- Trace all decision/impact paths for other hardcoded values
- Check if any assumptions are persisted anywhere

---

### P0.5: Audit is Console.Log Only
**Risk:** No tamper-proof record. Compliance failure.  
**Inspected:**
- `src/services/audit/log.ts` (line 4: `console.log(...)`)
- `src/infra/audit.ts` (proper emitAuditEvent exists but unused by Phase 1–5)
- AuditEvent model exists in schema

**Still Need:**
- Verify all Phase 1–5 mutation APIs for emitAuditEvent calls
- Check if any audit events are being created

---

### P0.6: Fail-Closed Safety Checks are Broken
**Risk:** System will not block dangerous decisions.  
**Inspected:**
- `src/__tests__/backbone.test.ts` (3 failing tests, lines 20, 42, 53)
- Low confidence clamped to 0.4 before validation (bypasses < 0.4 check)
- Zero impact masked by hardcoded baseline (NO_IMPACT never triggers)
- ImpactEstimate field mismatch (confidence vs confidenceWeight)

**Still Need:**
- Verify validateRuleInput calls and safety thresholds
- Check if any Phase 1–5 API validates inputs before processing

---

### P0.7: Webhooks are Console.Log Only
**Risk:** External integrations silent-fail. No delivery tracking.  
**Inspected:**
- `src/services/integration/webhook.ts` (line 4: `console.log(...)`)
- Called from `src/app/api/operator/route.ts` (line 95 on completion)
- No WebhookDelivery model in schema

**Still Need:**
- Find all webhook call sites
- Verify no other integration patterns exist

---

### P0.8: Tests Failing
**Risk:** Safety mechanisms are proven broken.  
**Inspected:**
- `src/__tests__/backbone.test.ts`
  - ❌ "should execute with high risk scenario" — confidence undefined
  - ❌ "should fail-closed on low confidence" — clamp bypasses validation
  - ❌ "should fail-closed on zero impact" — hardcoded baseline masks zero

**Still Need:**
- Run full test suite and identify all Phase 1–5 test failures
- Verify no other safety tests are silently passing

---

## 3. Prisma Persistence Plan
**Placeholder** — Will detail 8 models, fields, relationships, indexes, migration path.

---

## 4. Auth Hardening Plan
**Placeholder** — Will detail session integration, role mapping, capability checks, endpoint protection.

---

## 5. Financial Credibility Plan
**Placeholder** — Will detail assumption capture, derivation chain, user-provided baselines, output transparency.

---

## 6. Audit Hardening Plan
**Placeholder** — Will detail event emission, snapshot capture, replay strategy, compliance mapping.

---

## 7. Webhook Hardening Plan
**Placeholder** — Will detail delivery table, HTTP sender, retry logic, safe-fail behavior.

---

## 8. Safety Hardening Plan
**Placeholder** — Will detail validation fixes, fail-closed enforcement, test coverage matrix.

---

## 9. API Contract Table
**Placeholder** — Will detail 10+ Phase 1–5 endpoints: method, input, validation, auth, DB writes, audit events, responses.

---

## 10. Test Matrix
**Placeholder** — Will detail unit, API, regression tests for all 8 P0 areas.

---

## 11. Implementation Sequence
**Placeholder** — Will detail 8 token-safe prompts, one per P0 blocker, with exact files and acceptance criteria.
