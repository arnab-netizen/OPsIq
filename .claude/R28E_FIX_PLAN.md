# R28E REAL DEFECT CANONICALIZATION — FIX PLAN

**Phase:** R28E (Canonicalization + R29 Fix Plan)  
**Date:** 2026-05-20

---

## PHASE C: EXACT COUNTS (DEDUPLICATED)

```
raw_real_items: 39
deduplicated_real_defects: 38
duplicates_removed: 1 (util_2: comment line in shared-error-extractor.ts)

api_response_defects: 27
operator_ui_defects: 9 (4 ui + 3 comp + 2 page)
utility_defects: 2 (shared-error-extractor lines 34, 45)

files_to_fix: 12 files
deployment_state: BLOCKED_BY_38_REAL_DEFECTS
```

---

## PHASE D: R29 FIX PLAN (GROUPED BY FILE)

### Group 1: UI Component Errors (4 violations, 1 file)

**src/ui/decision-acceptance-modal.tsx**
```
Lines: 54, 81
Violations: 2 (both raw-error-message, operator-facing alerts)

Current:
  L54: const message = err instanceof Error ? err.message : "Failed to accept decision";
  L81: const message = err instanceof Error ? err.message : "Failed to reject decision";

Fix Strategy:
  1. Import: import { toOperatorSafeError } from "@/lib/operator-safe-errors";
  2. Wrap both with: const message = toOperatorSafeError(err, "decision_modal").error;
  
Severity: REAL_OPERATOR_UI (blocker)
Effort: 2 min
```

---

### Group 2: UI Component Errors (2 violations, 2 files)

**src/ui/decision-csv-upload.tsx**
```
Line: 78
Violation: 1 (raw-error-message, operator-facing error display)

Current:
  L78: const errorMsg = error instanceof Error ? error.message : String(error);

Fix Strategy:
  1. Import: import { toOperatorSafeError } from "@/lib/operator-safe-errors";
  2. Wrap: const errorMsg = toOperatorSafeError(error, "csv_upload").error;

Severity: REAL_OPERATOR_UI (blocker)
Effort: 2 min
```

**src/ui/decision-creation-form.tsx**
```
Line: 94
Violation: 1 (raw-error-message, operator-facing error display)

Current:
  L94: const errorMsg = error instanceof Error ? error.message : String(error);

Fix Strategy:
  1. Import: import { toOperatorSafeError } from "@/lib/operator-safe-errors";
  2. Wrap: const errorMsg = toOperatorSafeError(error, "creation_form").error;

Severity: REAL_OPERATOR_UI (blocker)
Effort: 2 min
```

---

### Group 3: Component Alert Errors (3 violations, 1 file)

**src/components/OperatorItem.tsx**
```
Lines: 36, 61, 93
Violations: 3 (all raw-error-message in alert calls, operator-facing alerts)

Current:
  L36: alert(error instanceof Error ? error.message : "Unknown error");
  L61: alert(error instanceof Error ? error.message : "Unknown error");
  L93: alert(error instanceof Error ? error.message : "Unknown error");

Fix Strategy:
  1. Import: import { toOperatorSafeError } from "@/lib/operator-safe-errors";
  2. Replace all 3 with:
     const safe = toOperatorSafeError(error, "operator_item");
     alert(safe.error);

Severity: REAL_OPERATOR_UI (blocker)
Effort: 3 min
```

---

### Group 4: Page Error Render (2 violations, 2 files)

**src/app/(authenticated)/settings/page.tsx**
```
Line: 58
Violation: 1 (unsafe-error-render, ErrorState component)

Current:
  L58: if (error) return <ErrorState message={error} />;

Fix Strategy:
  1. Import: import { classifyOperatorError } from "@/lib/operator-error-governance";
  2. Wrap error:
     if (error) {
       const classified = classifyOperatorError(error, { context: "settings" });
       return <ErrorState message={classified.message} />;
     }

Severity: REAL_OPERATOR_UI (blocker)
Effort: 3 min
```

**src/app/(authenticated)/users/page.tsx**
```
Line: 87
Violation: 1 (unsafe-error-render, ErrorState component)

Current:
  L87: if (error) return <ErrorState message={error} onRetry={fetchUsers} />;

Fix Strategy:
  1. Import: import { classifyOperatorError } from "@/lib/operator-error-governance";
  2. Wrap error:
     if (error) {
       const classified = classifyOperatorError(error, { context: "users" });
       return <ErrorState message={classified.message} onRetry={fetchUsers} />;
     }

Severity: REAL_OPERATOR_UI (blocker)
Effort: 3 min
```

---

### Group 5: Shared Error Extractor Utility (2 violations, 1 file)

**src/lib/shared-error-extractor.ts**
```
Lines: 34, 45
Violations: 2 (unsafe-error-render, utility function returning raw error.message)

Current:
  L34: return error.message;
  L45: return error instanceof Error ? error.message : String(error);

Fix Strategy:
  Refactor function to use classification:
  1. Import: import { classifyOperatorError } from "@/lib/operator-error-governance";
  2. Update function to return classified error:
     export function extractErrorMessage(error: unknown, context?: string): string {
       const classified = classifyOperatorError(error, { context });
       return classified.message;
     }

Severity: UTILITY_SHARED_ERROR (medium - depends on callers)
Effort: 5 min
```

---

### Group 6: API Routes (27 violations, 10 files)

**File Pattern:** src/app/api/**/route.ts

**27 violations across API routes, all same pattern:**
```
Pattern: return Response.json({ error: error.message }, { status: 400 });
Context: Error responses returned to operators without governance classification
Severity: REAL_API_RESPONSE (blocker - operator-facing API)
Effort per file: 5-10 min (depends on error handling complexity)
```

**API Files Needing Fix (10 files, 27 violations total):**
1. src/app/api/report/route.ts (1 violation: L18)
2. src/app/api/public/kpis/route.ts (1 violation: L137)
3. src/app/api/public/engagements/route.ts (1 violation: L114)
4. src/app/api/public/actions/route.ts (1 violation: L128)
5. src/app/api/owner/dashboard/route.ts (1 violation: L154)
6. src/app/api/owner/config/route.ts (2 violations: L76, L165)
7. src/app/api/operator/queue/route.ts (1 violation: L77)
8. src/app/api/operator/my-day/route.ts (1 violation: L30)
9. src/app/api/growth/* (9 violations across 7 files)
   - unit-economics/route.ts (1): L116
   - sales-pipeline/route.ts (1): L88
   - revenue-streams/route.ts (2): L49, L98
   - retention-metrics/route.ts (1): L82
   - pricing-tiers/route.ts (1): L68
   - offers/route.ts (1): L82
   - acquisition-metrics/route.ts (1): L80
10. src/app/api/engagements/** (10 violations across 7 files)
    - review-cycles/route.ts (1): L49
    - experiments/route.ts (2): L194, L236
    - escalation-checks/route.ts (1): L62
    - constraint-checks/route.ts (1): L97
    - experiments/[experimentId]/result/route.ts (1): L106
    - experiments/[experimentId]/start/route.ts (1): L77
    - experiments/[experimentId]/progress/route.ts (1): L96
    - experiments/[experimentId]/learning/route.ts (1): L96
    - experiments/[experimentId]/approve/route.ts (1): L78

**Fix Strategy (All API Routes):**
```typescript
// Current pattern (all routes):
try {
  // ... operation ...
} catch (error) {
  return Response.json({ error: error.message }, { status: 400 });
}

// Fixed pattern (apply to all):
import { classifyOperatorError } from "@/lib/operator-error-governance";

try {
  // ... operation ...
} catch (error) {
  const classified = classifyOperatorError(error, { 
    context: "route_name",
    route: request.url
  });
  return Response.json(
    { error: classified.message, errorCode: classified.code },
    { status: classified.httpStatus || 400 }
  );
}
```

---

## SUMMARY: FIX PLAN

| File | Violations | Type | Effort |
|------|-----------|------|--------|
| src/ui/decision-acceptance-modal.tsx | 2 | UI | 2min |
| src/ui/decision-csv-upload.tsx | 1 | UI | 2min |
| src/ui/decision-creation-form.tsx | 1 | UI | 2min |
| src/components/OperatorItem.tsx | 3 | Component | 3min |
| src/app/(authenticated)/settings/page.tsx | 1 | Page | 3min |
| src/app/(authenticated)/users/page.tsx | 1 | Page | 3min |
| src/lib/shared-error-extractor.ts | 2 | Utility | 5min |
| API Routes (10 files) | 27 | API | 60min |
| **TOTAL** | **38** | — | **~85 min** |

---

## NEXT STEP: R29 IMPLEMENTATION

**Expected Outcome:**
- 38 violations fixed
- All operator-facing errors wrapped with governance (`toOperatorSafeError` or `classifyOperatorError`)
- npm run build ✓, npx tsc ✓, npx prisma validate ✓
- npm run governance:scan:strict still shows 265 false positives (no change, those remain exempted)

**Deployment State After R29:**
- Real defects: 38 → 0 ✓
- Scanner false positives: 265 (still exempted)
- Gates: ALL GREEN (build, tsc, prisma, governance:scan:strict with exemptions)
- **Ready for deployment ✓**
