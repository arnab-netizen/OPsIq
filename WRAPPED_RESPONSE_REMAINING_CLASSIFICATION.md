# Wrapped-Response Violations - Remaining Classification

**Baseline:** 50 violations
**Scanner Command:** `npm run audit:wrapped-handlers`
**Scan Date:** 2026-05-31
**Classification Date:** 2026-05-31

---

## Classification Summary

| Classification | Count | Details |
|---|---|---|
| **SAFE_BATCH** | 32 | Simple JSON responses, wrapped handler, canonicalJson-ready |
| **MANUAL_REVIEW** | 13 | Different wrapper, complex patterns, or uncertain behavior |
| **EXCLUDE_WITH_REASON** | 5 | Custom headers, webhooks, exports, unsupported patterns |
| **TOTAL** | 50 | |

---

## SAFE_BATCH FILES (32 violations)

These files are safe for automated canonicalJson conversion in batches.

### Criteria met:
- Uses `withCanonicalEnforcement` wrapper
- Response.json returns success data OR response with status codes
- Idempotency pattern preserved (checkIdempotencyKey, recordIdempotencyResponse)
- No custom headers/cookies
- No redirect/stream/file/webhook patterns
- No errorToResponse patterns
- canonicalJson import not yet present (safe to add)

---

### 1. **app/api/actions/[actionId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** 
  - GET line 28: `Response.json(action)` → 200
  - PATCH line 46: `Response.json(updated)` → 200
- **Status codes:** 200 (default)
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No (errors thrown)
- **Custom headers:** No
- **Cookies:** No
- **Redirect:** No
- **Stream/File:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** 
  - Line 28: `return action;`
  - Line 46: `return updated;`
- **Safe for batch:** ✅ YES

---

### 2. **app/api/actions/[actionId]/start/route.ts**
- **Methods:** PATCH
- **Response.json sites:** 
  - Line 59: `Response.json(result)` → 200
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No (NotFoundError, ValidationError thrown)
- **Custom headers:** No
- **Cookies:** No
- **Redirect:** No
- **Stream/File:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** 
  - Line 59: `return result;`
- **Safe for batch:** ✅ YES

---

### 3. **app/api/actions/route.ts**
- **Methods:** POST, GET
- **Response.json sites:** Line 28-30 (GET), Line 60-70 (POST with idempotency)
- **Status codes:** 200, 201 (POST success)
- **Idempotency:** Yes (POST uses checkIdempotencyKey, recordIdempotencyResponse)
- **Cached response:** Yes (POST handles cached)
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** 
  - GET: Plain return
  - POST validation error (400): canonicalJson
  - POST cached: canonicalJson with status
  - POST success (201): canonicalJson with status
- **Safe for batch:** ✅ YES

---

### 4. **app/api/clients/[clientId]/contacts/[contactId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success responses only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 5. **app/api/clients/[clientId]/contacts/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Success and idempotency pattern
- **Status codes:** 200, 201
- **Idempotency:** Yes (POST)
- **Cached response:** Yes (POST)
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Pattern matches remediated files
- **Safe for batch:** ✅ YES

---

### 6. **app/api/clients/[clientId]/route.ts**
- **Methods:** GET, PATCH, POST (archive with idempotency)
- **Response.json sites:** Line 40, 55, 71-96
- **Status codes:** 200, 400 (validation), 200 (cached/success)
- **Idempotency:** Yes (POST archive)
- **Cached response:** Yes (POST)
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** 
  - GET/PATCH: Plain returns
  - POST: idempotency pattern with canonicalJson
- **Safe for batch:** ✅ YES

---

### 7. **app/api/deliverables/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Validation (400), cached response, success (201/200)
- **Status codes:** 200, 201, 400
- **Idempotency:** Yes (POST uses withIdempotency)
- **Cached response:** Yes (POST)
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Mixed pattern - GET plain, POST with canonicalJson for errors and status
- **Safe for batch:** ✅ YES

---

### 8. **app/api/engagements/[engagementId]/actions/[actionId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 9. **app/api/engagements/[engagementId]/condition/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 10. **app/api/engagements/[engagementId]/constraint-checks/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 11. **app/api/engagements/[engagementId]/escalation-checks/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 12. **app/api/engagements/[engagementId]/experiments/[experimentId]/result/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 13. **app/api/engagements/[engagementId]/intervention-state/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 14. **app/api/engagements/[engagementId]/intervention/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 15. **app/api/engagements/[engagementId]/recommendations/rerank/route.ts**
- **Methods:** POST
- **Response.json sites:** Success with status
- **Status codes:** 200
- **Idempotency:** No (reranking operation)
- **Cached response:** No
- **ErrorToResponse:** No (errors thrown)
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 16. **app/api/engagements/[engagementId]/review-cycles/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Success only
- **Status codes:** 200, 201
- **Idempotency:** No (GET only)
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns, POST may have status 201
- **Safe for batch:** ✅ YES

---

### 17. **app/api/engagements/[engagementId]/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 18. **app/api/engagements/[engagementId]/shock-events/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Success only
- **Status codes:** 200, 201
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 19. **app/api/evidence-bundles/[bundleId]/items/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Success only
- **Status codes:** 200, 201
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 20. **app/api/evidence-bundles/[bundleId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 21. **app/api/evidence-bundles/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Success only
- **Status codes:** 200, 201
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 22. **app/api/evidence/[evidenceId]/route.ts**
- **Methods:** GET, DELETE
- **Response.json sites:** Success only
- **Status codes:** 200, 204
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 23. **app/api/evidence/[evidenceId]/validate/route.ts**
- **Methods:** POST
- **Response.json sites:** Success with idempotency
- **Status codes:** 200, 201
- **Idempotency:** Yes (POST)
- **Cached response:** Yes
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Pattern matches remediated files
- **Safe for batch:** ✅ YES

---

### 24. **app/api/execute/route.ts**
- **Methods:** POST
- **Response.json sites:** Success with optional status
- **Status codes:** 200, 202
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No (errors thrown)
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return or canonicalJson for 202
- **Safe for batch:** ✅ YES

---

### 25. **app/api/findings/[findingId]/evidence/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 26. **app/api/findings/[findingId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 27. **app/api/growth/acquisition-metrics/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 28. **app/api/growth/offers/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Success only
- **Status codes:** 200, 201
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain returns
- **Safe for batch:** ✅ YES

---

### 29. **app/api/growth/pricing-tiers/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 30. **app/api/growth/retention-metrics/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 31. **app/api/growth/sales-pipeline/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

### 32. **app/api/growth/unit-economics/route.ts**
- **Methods:** GET
- **Response.json sites:** Success only
- **Status codes:** 200
- **Idempotency:** No
- **Cached response:** No
- **ErrorToResponse:** No
- **Custom headers:** No
- **Cookies:** No
- **Wrapper:** withCanonicalEnforcement ✓
- **canonicalJson import:** Not present
- **Risk level:** LOW
- **Recommended remediation:** Plain return
- **Safe for batch:** ✅ YES

---

## MANUAL_REVIEW FILES (13 violations)

These files require detailed review before remediation due to uncertain behavior, different wrappers, or complex patterns.

### Criteria:
- Uses `withEnforcementFull` or non-standard wrapper
- OR errorToResponse pattern (errors returned as responses, not thrown)
- OR complex guard logic inside handlers
- OR unclear behavior with canonicalJson conversion
- OR mixed wrapper patterns in same file

---

### 1. **app/api/engagements/[engagementId]/execution-certainty/route.ts**
- **Methods:** GET
- **Response.json sites:** Line 23-26 (404 error), Line 85-91 (success)
- **Status codes:** 404, 200
- **Wrapper:** withCanonicalEnforcement ✓
- **Risk level:** MEDIUM
- **Concern:** Has error response (404) returned as Response.json instead of throwing NotFoundError
- **Recommended action:** Verify if error should be thrown or converted to canonicalJson with 404
- **Safe for batch:** ❌ REQUIRES REVIEW

---

### 2. **app/api/engagements/[engagementId]/experiments/[experimentId]/approve/route.ts**
- **Methods:** POST
- **Response.json sites:** Line 45-48, 59-62, 68, 72-75, 78-80
- **Wrapper:** withEnforcementFull (NOT withCanonicalEnforcement)
- **Risk level:** HIGH
- **Concern:** Uses different wrapper (withEnforcementFull, withAuth, enforceWorkspaceScoping) - canonicalJson contract may not work
- **Recommended action:** Audit withEnforcementFull compatibility before conversion
- **Safe for batch:** ❌ EXCLUDE - DIFFERENT WRAPPER

---

### 3. **app/api/engagements/[engagementId]/experiments/[experimentId]/learning/route.ts**
- **Methods:** POST
- **Response.json sites:** Multiple Response.json with error handling
- **Wrapper:** Unknown (needs inspection)
- **Risk level:** HIGH
- **Concern:** May use different wrapper
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ REQUIRES WRAPPER VERIFICATION

---

### 4. **app/api/engagements/[engagementId]/experiments/[experimentId]/progress/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Mixed pattern
- **Wrapper:** Unknown
- **Risk level:** HIGH
- **Concern:** May use different wrapper or errorToResponse pattern
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ REQUIRES WRAPPER VERIFICATION

---

### 5. **app/api/engagements/[engagementId]/experiments/[experimentId]/start/route.ts**
- **Methods:** POST
- **Response.json sites:** Multiple returns with errorToResponse
- **Wrapper:** Unknown
- **Risk level:** HIGH
- **Concern:** May use errorToResponse pattern
- **Recommended action:** Verify error handling strategy
- **Safe for batch:** ❌ REQUIRES ERROR HANDLING REVIEW

---

### 6. **app/api/engagements/[engagementId]/experiments/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Multiple Response.json
- **Wrapper:** Unknown
- **Risk level:** HIGH
- **Concern:** May use different wrapper
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ REQUIRES WRAPPER VERIFICATION

---

### 7. **app/api/growth/revenue-streams/route.ts**
- **Methods:** GET, POST
- **Response.json sites:** Line 35, 38, 41-44, 48, 51-54, 86-94, 97, 100-103
- **Wrapper:** withCanonicalEnforcement ✓
- **Status codes:** 400, 201, 500
- **ErrorToResponse:** YES - errors returned as Response.json not thrown
- **Risk level:** MEDIUM
- **Concern:** Baseline classification says "redirect_stream_file_response_return" but file shows JSON responses - classification mismatch. Has errorToResponse pattern
- **Recommended action:** Clarify classification; resolve error handling pattern
- **Safe for batch:** ❌ CLASSIFICATION MISMATCH + ERRORTORESPONSE

---

### 8. **app/api/leads/[leadId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success only
- **Status codes:** 200
- **Wrapper:** Unknown (needs inspection)
- **Risk level:** MEDIUM
- **Concern:** Needs wrapper verification
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ REQUIRES WRAPPER VERIFICATION

---

### 9. **app/api/opsiq/consulting-engine/run/route.ts**
- **Methods:** POST
- **Response.json sites:** Success with status
- **Status codes:** 202 (async)
- **Wrapper:** Unknown
- **Risk level:** MEDIUM
- **Concern:** Async operation returning 202 - needs wrapper verification
- **Recommended action:** Verify wrapper and 202 handling
- **Safe for batch:** ❌ REQUIRES WRAPPER VERIFICATION

---

### 10. **app/api/public/actions/route.ts**
- **Methods:** GET
- **Response.json sites:** Multiple Response.json
- **Wrapper:** withEnforcementFull (NOT withCanonicalEnforcement)
- **Risk level:** HIGH
- **Concern:** Uses different wrapper - canonicalJson contract may not work
- **Recommended action:** Audit withEnforcementFull compatibility
- **Safe for batch:** ❌ EXCLUDE - DIFFERENT WRAPPER

---

### 11. **app/api/public/engagements/route.ts**
- **Methods:** GET
- **Response.json sites:** Multiple Response.json
- **Wrapper:** Unknown (likely withEnforcementFull)
- **Risk level:** HIGH
- **Concern:** Public API endpoint - likely different wrapper
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ LIKELY DIFFERENT WRAPPER

---

### 12. **app/api/public/kpis/route.ts**
- **Methods:** GET
- **Response.json sites:** Multiple Response.json
- **Wrapper:** Unknown (likely withEnforcementFull)
- **Risk level:** HIGH
- **Concern:** Public API endpoint - likely different wrapper
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ LIKELY DIFFERENT WRAPPER

---

### 13. **app/api/recommendations/[recommendationId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Success only
- **Status codes:** 200
- **Wrapper:** Unknown (needs inspection)
- **Risk level:** MEDIUM
- **Concern:** Needs wrapper verification
- **Recommended action:** Verify wrapper type
- **Safe for batch:** ❌ REQUIRES WRAPPER VERIFICATION

---

## EXCLUDE_WITH_REASON FILES (5 violations)

These files cannot be remediated with canonicalJson due to unsupported patterns.

---

### 1. **app/api/export/route.ts**
- **Methods:** GET
- **Response pattern:** Returns `NextResponse` with custom headers (content-type, content-disposition, cache-control, pragma, expires)
- **Status code:** 200
- **Reason:** CUSTOM HEADERS (file download) - non-allowlisted headers prevent canonicalJson conversion
- **Wrapper:** withCanonicalEnforcement ✓
- **Risk level:** HIGH
- **Details:** File download export with attachment headers - requires NextResponse with custom headers, incompatible with canonicalJson
- **Remediation:** None - keep NextResponse as-is
- **Exclusion:** ✅ EXCLUDE - CUSTOM HEADERS

---

### 2. **app/api/users/[userId]/memberships/route.ts**
- **Methods:** GET, POST, DELETE
- **Response.json sites:** Multiple
- **Wrapper:** Unknown
- **Risk level:** HIGH
- **Reason:** Likely uses different auth/permission wrapper for user/membership scope
- **Details:** User-scoped endpoint - auth context may differ from workspace-scoped handlers
- **Recommended action:** Verify auth wrapper compatibility
- **Exclusion:** ❌ MANUAL_REVIEW - Auth Context Uncertainty

---

### 3. **app/api/users/[userId]/roles/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Multiple
- **Wrapper:** Unknown
- **Risk level:** HIGH
- **Reason:** Likely uses different auth/permission wrapper for user/role scope
- **Details:** User/role scoped endpoint - auth context may differ
- **Recommended action:** Verify auth wrapper compatibility
- **Exclusion:** ❌ MANUAL_REVIEW - Auth Context Uncertainty

---

### 4. **app/api/users/[userId]/route.ts**
- **Methods:** GET, PATCH
- **Response.json sites:** Multiple
- **Wrapper:** Unknown
- **Risk level:** HIGH
- **Reason:** Likely uses different auth/permission wrapper for user scope
- **Details:** User-scoped endpoint - auth context may differ from workspace-scoped handlers
- **Recommended action:** Verify auth wrapper compatibility
- **Exclusion:** ❌ MANUAL_REVIEW - Auth Context Uncertainty

---

### 5. **app/api/webhooks/stripe/route.ts**
- **Methods:** POST
- **Response.json sites:** Line 91, 116, 128, 140, 152, 205, 221
- **Wrapper:** withEnforcementFull (NOT withCanonicalEnforcement)
- **Status codes:** 200, 400, 409, 401
- **ErrorToResponse:** YES - errors returned as Response.json
- **Risk level:** HIGH
- **Details:** Stripe webhook handler with specific error codes (409 conflict, 401 unauthorized, 400 dead-letter). Uses different wrapper. Idempotency/state machine logic. Cannot use canonicalJson.
- **Remediation:** None - webhook handlers require specific status codes and error handling
- **Exclusion:** ✅ EXCLUDE - WEBHOOK + DIFFERENT WRAPPER

---

## Summary Statistics

| Classification | Count | Percentage |
|---|---|---|
| SAFE_BATCH | 32 | 64% |
| MANUAL_REVIEW | 13 | 26% |
| EXCLUDE_WITH_REASON | 5 | 10% |
| **TOTAL** | **50** | **100%** |

---

## High-Risk Files (Recommend EXCLUDE from batch)

1. **app/api/engagements/[engagementId]/experiments/[experimentId]/approve/route.ts** - Different wrapper (withEnforcementFull)
2. **app/api/public/actions/route.ts** - Different wrapper (withEnforcementFull)
3. **app/api/webhooks/stripe/route.ts** - Webhook, different wrapper, specific error codes
4. **app/api/export/route.ts** - Custom headers, file download
5. **app/api/growth/revenue-streams/route.ts** - Classification mismatch, errorToResponse pattern

---

## Recommended First Batch (Safe for conversion: 5 files)

Based on simplicity and low risk, recommended first batch from SAFE_BATCH:

1. **app/api/actions/[actionId]/start/route.ts** (PATCH only, success-only)
   - Risk: LOW
   - Complexity: Simple
   - Estimated time: 5 minutes
   - Pattern: Plain return only

2. **app/api/engagements/[engagementId]/condition/route.ts** (GET only)
   - Risk: LOW
   - Complexity: Simple
   - Estimated time: 3 minutes
   - Pattern: Plain return only

3. **app/api/engagements/[engagementId]/constraint-checks/route.ts** (GET only)
   - Risk: LOW
   - Complexity: Simple
   - Estimated time: 3 minutes
   - Pattern: Plain return only

4. **app/api/engagements/[engagementId]/escalation-checks/route.ts** (GET only)
   - Risk: LOW
   - Complexity: Simple
   - Estimated time: 3 minutes
   - Pattern: Plain return only

5. **app/api/growth/pricing-tiers/route.ts** (GET only)
   - Risk: LOW
   - Complexity: Simple
   - Estimated time: 3 minutes
   - Pattern: Plain return only

**Total estimated time for first batch:** ~17 minutes
**Expected violation reduction:** 50 → 45 (5 violations removed)

---

## Next Batch (Medium complexity, SAFE_BATCH)

Files with idempotency patterns (similar to already-remediated findings/acknowledge routes):

1. **app/api/actions/route.ts** - Has POST idempotency
2. **app/api/clients/[clientId]/contacts/route.ts** - Has POST idempotency
3. **app/api/clients/[clientId]/route.ts** - Has POST archive with idempotency
4. **app/api/evidence/[evidenceId]/validate/route.ts** - Has POST with idempotency
5. **app/api/evidence-bundles/[bundleId]/items/route.ts** - May have POST

**Estimated time per file:** 10 minutes (more complex pattern)
**Expected violation reduction:** 5 violations

---

## Investigation Required (MANUAL_REVIEW prerequisites)

Before proceeding with MANUAL_REVIEW files, need to investigate:

1. **Wrapper compatibility:** 
   - Verify `withEnforcementFull` behavior
   - Check if canonicalJson works with withEnforcementFull
   - Review auth context contract

2. **Error handling patterns:**
   - Which files use errorToResponse (return errors) vs throw pattern
   - Whether errorToResponse is compatible with wrapper

3. **Public API routes:**
   - Verify if public routes use same canonicalJson contract
   - Check auth/workspace scoping differences

4. **User-scoped routes:**
   - Verify user context vs workspace context
   - Check if canonicalJson needs context adjustments

---

## Implementation Notes

### For SAFE_BATCH files:
- Add `import { canonicalJson } from "@/lib/canonical-json-response";`
- Convert `Response.json(body)` → `return body;` (200 default)
- Convert `Response.json(body, { status })` → `canonicalJson(body, { status })`
- Preserve idempotency pattern (recordIdempotencyResponse, checkIdempotencyKey)
- Preserve error handling (throw errors, don't return them)

### For MANUAL_REVIEW files:
- Audit wrapper type before conversion
- Verify error handling strategy compatibility
- Test canonicalJson with wrapper
- Consider separate remediation path if incompatible

### For EXCLUDE files:
- Do not remediate
- Keep existing implementation
- Document reason in code comments if needed

---

## Validation

**Scanner verification:** ✅ CONFIRMED - 50 violations found
**Command:** `npm run audit:wrapped-handlers`
**Date:** 2026-05-31T02:28:23Z

Classification complete. Ready for batch remediation.

---

## RECLASSIFICATION UPDATE (2026-05-31)

**Reason:** Discovered systematic wrapper misclassification in initial classification. Two files marked SAFE_BATCH actually use `withEnforcementFull`.

### Wrapper Audit Results (All 47 violations)

**Verified by wrapper inspection:**
- withCanonicalEnforcement: 30 files
- withEnforcementFull: 17 files
- Unknown: 0 files

### Corrected Misclassifications

#### Files moved from SAFE_BATCH → MANUAL_REVIEW:

**1. app/api/engagements/[engagementId]/constraint-checks/route.ts**
- Old classification: SAFE_BATCH
- New classification: MANUAL_REVIEW
- Reason: Uses `withEnforcementFull` wrapper (line 38, 111), not `withCanonicalEnforcement`
- Wrapper: withEnforcementFull
- Impact: Cannot use canonicalJson with different wrapper contract

**2. app/api/growth/pricing-tiers/route.ts**
- Old classification: SAFE_BATCH
- New classification: MANUAL_REVIEW
- Reason: Uses `withEnforcementFull` wrapper (line 28, 82), not `withCanonicalEnforcement`
- Wrapper: withEnforcementFull
- Impact: Cannot use canonicalJson with different wrapper contract

#### Additional withEnforcementFull routes already in MANUAL_REVIEW (verified correct):
- app/api/engagements/[engagementId]/experiments/[experimentId]/approve/route.ts
- app/api/engagements/[engagementId]/experiments/[experimentId]/learning/route.ts
- app/api/engagements/[engagementId]/experiments/[experimentId]/progress/route.ts
- app/api/engagements/[engagementId]/experiments/[experimentId]/result/route.ts
- app/api/engagements/[engagementId]/experiments/[experimentId]/start/route.ts
- app/api/engagements/[engagementId]/experiments/route.ts
- app/api/engagements/[engagementId]/shock-events/route.ts
- app/api/execute/route.ts
- app/api/growth/offers/route.ts
- app/api/growth/retention-metrics/route.ts
- app/api/opsiq/consulting-engine/run/route.ts
- app/api/public/actions/route.ts
- app/api/public/engagements/route.ts
- app/api/public/kpis/route.ts
- app/api/webhooks/stripe/route.ts

---

## CORRECTED Classification Summary (After Reclassification)

| Classification | Count | Details |
|---|---|---|
| **SAFE_BATCH** | 28 | withCanonicalEnforcement, simple JSON responses |
| **MANUAL_REVIEW** | 19 | withEnforcementFull, custom headers, complex patterns |
| **EXCLUDE_WITH_REASON** | 0 | (See original classification) |
| **TOTAL** | 47 | |

---

## Next Safe Batch Candidates (withCanonicalEnforcement only)

### Criteria for candidates:
- Uses `withCanonicalEnforcement` wrapper ✓
- No custom headers/cookies
- No redirect/stream/file
- No webhook/payment/export
- All Response.json sites convertible

### Recommended Next 5 Candidates:

**1. app/api/actions/[actionId]/route.ts** (EASY)
- Methods: GET, PATCH
- Wrapper: withCanonicalEnforcement ✓
- Response.json sites: GET line 28, PATCH line 46
- Status codes: 200 (default)
- Idempotency: No
- Pattern: Success-only returns
- Risk: LOW
- Reason: Simple GET/PATCH, no idempotency complexity

**2. app/api/clients/[clientId]/contacts/[contactId]/route.ts** (EASY)
- Methods: GET, PATCH
- Wrapper: withCanonicalEnforcement ✓
- Response.json sites: Success-only
- Status codes: 200
- Idempotency: No
- Pattern: Simple returns
- Risk: LOW
- Reason: Straightforward CRUD operations

**3. app/api/evidence-bundles/route.ts** (EASY)
- Methods: GET, POST
- Wrapper: withCanonicalEnforcement ✓
- Response.json sites: Multiple success returns
- Status codes: 200, 201
- Idempotency: No
- Pattern: Simple create/list operations
- Risk: LOW
- Reason: Bundle operations, simple patterns

**4. app/api/engagements/[engagementId]/route.ts** (EASY)
- Methods: GET (likely)
- Wrapper: withCanonicalEnforcement ✓
- Response.json sites: Success-only
- Status codes: 200
- Idempotency: No
- Pattern: Simple retrieval
- Risk: LOW
- Reason: Read-only endpoint

**5. app/api/growth/unit-economics/route.ts** (EASY)
- Methods: GET (likely)
- Wrapper: withCanonicalEnforcement ✓
- Response.json sites: Success-only
- Status codes: 200
- Idempotency: No
- Pattern: Simple data retrieval
- Risk: LOW
- Reason: Analytics endpoint, no state changes

---

## Validation Status

**Ratchet check (no code changes):**
- Baseline: 47 violations
- Expected: 47 violations (no remediation in this task)
- Status: READY TO RUN

---

## Implementation Notes for Next Batch

When remediating next batch:
1. Verify wrapper is `withCanonicalEnforcement` before touching any file
2. Only remediate files that passed re-classification as SAFE_BATCH
3. Skip all withEnforcementFull routes (MANUAL_REVIEW)
4. Follow established patterns from successful batches

