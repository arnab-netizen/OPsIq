# P2A BASELINE: REPOSITORY TRUTH CHECK

**Date:** 2026-06-02  
**Phase:** P2A (Expectation Fields)  
**Scope:** why_now, cost_of_inaction, expected_metric, expected_direction, expected_target  
**Storage:** Recommendation.constraintsConsidered (JSON)  

---

## 1. STORAGE FIELD VERIFICATION

### Field: Recommendation.constraintsConsidered

**Location:** `/home/user/OPsIq/prisma/schema.prisma:778`

```prisma
constraintsConsidered   Json?       @map("constraints_considered")
```

**Status:** ✅ EXISTS  
**Type:** JSON (flexible, no schema validation)  
**Nullable:** Yes (optional)  
**Migration Required:** NO

---

## 2. CORE SERVICE FILES

### File 1: `/home/user/OPsIq/src/services/recommendation.ts`

**CreateRecommendationInput Interface (lines 31-41)**
```typescript
export interface CreateRecommendationInput {
  engagementId: string;
  findingId?: string;
  priority: string;
  title: string;
  description?: string;
  expectedImpact?: string;
  implementationPhase?: string;
  class?: RecommendationClass;
  scoringInput?: RecommendationScoringInput;
}
```

**Current:** No expectation fields. Will extend with 5 P2A fields.

**UpdateRecommendationInput Interface (lines 43-51)**
```typescript
export interface UpdateRecommendationInput {
  status?: string;
  priority?: string;
  version: number;
  overrideExecutionCertainty?: {
    reason: string;
    approvedBy: string;
  };
}
```

**Current:** No expectation fields. Will extend with 5 P2A fields.

**Function: createRecommendation() (lines 357-562)**

Execution Path:
1. Line 363-373: Capability check (generate_recommendation)
2. Line 375-378: Auth context validation
3. Line 380-386: Engagement validation
4. Line 388-396: Evidence assessment + KPI assessment
5. Line 398-410: Build payload with derived priority
6. Line 412-498: Idempotency-wrapped transaction (WITH idempotencyKey)
   - Line 420-437: tx.recommendation.create() with data
   - Line 439-449: Emit audit event
   - Line 451-471: Emit canonical event
7. Line 500-562: Direct create without idempotency

**Payload Structure (lines 420-437, 502-519):**
```typescript
data: {
  engagementId: input.engagementId,
  findingId: input.findingId,
  priority: derivedPriority,
  title: input.title,
  description: input.description,
  estimatedImpact: input.expectedImpact,
  workspaceId: validatedWorkspaceId,
  createdBy: userId,
  evidenceValidationScore: ...,
  reliabilityLevel: ...,
  kpiHealthScore: ...,
  kpiRiskLevel: ...,
  // NO constraintsConsidered field currently
}
```

**P2A Change Required:** Add constraintsConsidered to payload when expectation fields present.

**Function: updateRecommendation() (lines 1159-1231)**

Execution Path:
1. Line 1165-1168: Auth context validation
2. Line 1170-1176: Load recommendation (throws NotFoundError if missing)
3. Line 1178-1180: Version check
4. Line 1182-1190: Build updates map
   - Currently: status, priority, version
5. Line 1192-1195: db.recommendation.update()
6. Line 1197-1205: Emit audit event
7. Line 1207-1228: Emit canonical event

**P2A Change Required:** Add constraintsConsidered merge logic before update.

---

### File 2: `/home/user/OPsIq/src/app/api/recommendations/[recommendationId]/route.ts`

**updateRecommendationSchema (lines 16-29)**
```typescript
const updateRecommendationSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  priority: z.enum(RECOMMENDATION_PRIORITIES).optional(),
  type: z.enum(RECOMMENDATION_TYPES).optional(),
  rationale: z.string().min(1).optional(),
  expectedImpact: z.string().optional(),
  estimatedEffort: z.string().optional(),
  targetMetric: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  status: z.enum(RECOMMENDATION_STATUSES).optional(),
  version: z.number().int().min(1),
});
```

**P2A Change Required:** Add expectation fields to schema.

**PATCH Handler (lines 47-71)**
```typescript
export const PATCH = withCanonicalEnforcement(async (ctx, params) => {
  // Authorization check
  // Parse params + body
  const body = await parseRequestBody(ctx.request!, updateRecommendationSchema);
  await updateRecommendation(recommendationId, body, authContext, workspaceId);
  const updated = await getRecommendation(recommendationId, workspaceId);
  return canonicalJson(updated, { status: 200 });
});
```

**P2A Change Required:** Accept expectation fields in body schema.

**GET Handler (lines 31-45)**
```typescript
export const GET = withCanonicalEnforcement(async (ctx, params) => {
  const recommendation = await getRecommendation(recommendationId, workspaceId);
  return canonicalJson(recommendation, { status: 200 });
});
```

**Current:** getRecommendation() selects specific fields (line 1121-1150).  
**P2A Change Required:** Include constraintsConsidered in select.

---

## 3. VALIDATION FRAMEWORK

**Location:** `/home/user/OPsIq/src/lib/validation.ts`

**Pattern:**
```typescript
function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  // Validates with Zod
  // Throws ValidationError on failure
}

function parseRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T> {
  // Extracts JSON body + validates
  // Throws ValidationError on unknown fields
}
```

**P2A Implementation:** Use existing z.object() pattern for expectation field validation.

---

## 4. AUDIT TRAIL INFRASTRUCTURE

**Audit Events:**
- Line 439-449 (createRecommendation): AUDIT_EVENTS.RECOMMENDATION_CREATED
- Line 521-531 (createRecommendation): AUDIT_EVENTS.RECOMMENDATION_CREATED
- Line 912-921 (updateRecommendationStatus): AUDIT_EVENTS.RECOMMENDATION_APPROVED
- Line 979-990 (updateRecommendationPriorityFromScore): AUDIT_EVENTS.RECOMMENDATION_APPROVED
- Line 1197-1205 (updateRecommendation): "recommendation.updated"

**Event Emission (EventEmitterService):**
- Line 451-471 (createRecommendation)
- Line 533-549 (createRecommendation)
- Line 925-939 (updateRecommendationStatus)
- Line 993-1008 (updateRecommendationPriorityFromScore)
- Line 1217-1227 (updateRecommendation)

**P2A Change:** Expectation fields will be stored silently in constraintsConsidered JSON (no separate events needed). Audit trail tracks recommendation.created/updated events.

---

## 5. EXISTING TESTS

**Test Suite Files:**
- `/home/user/OPsIq/src/__tests__/phase-g/g1-recommendation-contract.test.ts` (80+ lines)
- `/home/user/OPsIq/src/__tests__/api/owner-dashboard-recommendations.test.ts`
- `/home/user/OPsIq/src/__tests__/r1-runtime/recommendation-engine.test.ts`

**Testing Framework:** vitest (describe, it, expect)

**P2A Test Files to Create:**
1. `src/__tests__/p2a/expectation-fields.test.ts` — Unit tests for validation
2. `src/__tests__/p2a/expectation-api.test.ts` — Integration tests for API

---

## 6. EXECUTION FLOW: CREATE RECOMMENDATION WITH EXPECTATIONS

```
POST /api/recommendations
  ↓
updateRecommendationSchema.parse({
  title: "...",
  why_now: "Rate declining...",
  cost_of_inaction: "Backlog grows...",
  expected_metric: "approval_rate",
  expected_direction: "INCREASE",
  expected_target: "85%+"
})
  ↓
createRecommendation(input, authContext, workspaceId)
  ↓
[Validate expectations: validateExpectationFields(input)]
  ↓
[Build constraintsConsidered JSON payload]:
  {
    why_now: "Rate declining...",
    cost_of_inaction: "Backlog grows...",
    expected_metric: "approval_rate",
    expected_direction: "INCREASE",
    expected_target: "85%+"
  }
  ↓
db.recommendation.create({
  ...,
  constraintsConsidered: { ... }
})
  ↓
AUDIT_EVENTS.RECOMMENDATION_CREATED emitted
  ↓
recommendation.created canonical event emitted
  ↓
Return created recommendation with constraintsConsidered visible
```

---

## 7. EXECUTION FLOW: UPDATE RECOMMENDATION WITH EXPECTATIONS

```
PATCH /api/recommendations/:id
{
  why_now: "...",
  cost_of_inaction: "...",
  expected_metric: "...",
  expected_direction: "...",
  expected_target: "..."
}
  ↓
updateRecommendationSchema.parse(body)
  ↓
updateRecommendation(id, input, authContext, workspaceId)
  ↓
[Validate expectations: validateExpectationFields(input)]
  ↓
[Load current recommendation]
  ↓
[Merge expectations into constraintsConsidered]:
  {
    ...existing,
    why_now: "...",
    cost_of_inaction: "...",
    expected_metric: "...",
    expected_direction: "...",
    expected_target: "..."
  }
  ↓
db.recommendation.update({
  ...,
  constraintsConsidered: { merged }
})
  ↓
"recommendation.updated" audit event emitted
  ↓
recommendation.updated canonical event emitted
  ↓
Return updated recommendation with constraintsConsidered visible
```

---

## 8. BACKWARD COMPATIBILITY MATRIX

| Scenario | Current | P2A | Break? |
|----------|---------|-----|--------|
| GET /api/recommendations/:id (no expectations) | Returns rec | Returns rec + empty/null expectations | NO |
| POST /api/recommendations (no expectations) | Creates rec | Creates rec, constraintsConsidered null | NO |
| PATCH /api/recommendations/:id (no expectations) | Updates status/priority | Updates status/priority, expectations null | NO |
| POST /api/recommendations (with expectations) | 400 INVALID | Creates rec with JSON | NO (additive) |
| PATCH /api/recommendations/:id (with expectations) | 400 INVALID | Merges JSON | NO (additive) |

---

## 9. FILES TO MODIFY (MINIMAL)

### To Create:
1. `src/__tests__/p2a/expectation-fields.test.ts` — Unit tests
2. `src/__tests__/p2a/expectation-api.test.ts` — Integration tests

### To Modify:
1. `src/services/recommendation.ts`:
   - Extend CreateRecommendationInput
   - Extend UpdateRecommendationInput
   - Add validateExpectationFields() function
   - Modify createRecommendation() payload
   - Modify updateRecommendation() payload merge

2. `src/app/api/recommendations/[recommendationId]/route.ts`:
   - Extend updateRecommendationSchema
   - Ensure getRecommendation() returns constraintsConsidered

3. `src/app/api/recommendations/route.ts` (if exists):
   - Extend POST schema (create path)
   - Pass expectation fields to createRecommendation()

### No Changes:
- schema.prisma (field exists)
- Migrations (no schema changes)
- UI components (no UI scope)
- New endpoints (reuse existing)

---

## 10. VALIDATION RULES (TO IMPLEMENT)

| Field | Rule |
|-------|------|
| why_now | Required, string, 10-500 chars |
| cost_of_inaction | Required, string, 10-500 chars |
| expected_metric | Required, enum (whitelist: approval_rate, processing_time, ...) |
| expected_direction | Required, enum (INCREASE, DECREASE, STABILIZE) |
| expected_target | Required, string, non-empty (format: "85%+" or "85-90%") |

---

## 11. ASSUMPTIONS VERIFIED

✅ Recommendation.constraintsConsidered exists  
✅ JSON type supports flexible schema  
✅ Existing createRecommendation/updateRecommendation can be extended  
✅ API validation pattern is z.object() + parseOrThrow()  
✅ Audit infrastructure in place (no new events needed)  
✅ No schema migration required  
✅ No new entities needed  
✅ No new tables needed  
✅ No parallel metadata structures exist  

**RESULT: All assumptions PROVEN_TRUE. No blockers detected.**

---

## 12. NEXT TASK: TEST-FIRST IMPLEMENTATION

1. Create failing tests for expectation fields
2. Create validation function
3. Modify service functions to handle expectations
4. Modify API schema
5. Run tests until green
6. TypeScript check, build, governance scan

---

**Repository Truth Check: COMPLETE ✅**  
**P2A Baseline Established: READY FOR IMPLEMENTATION**
