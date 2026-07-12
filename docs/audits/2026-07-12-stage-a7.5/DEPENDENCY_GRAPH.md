# Dependency Graph — Layer Violation Audit (Invariant I10)

Audit date: 2026-07-12

## Architecture Rule

```
DB/Prisma
   ↑
Services (src/services/)
   ↑
Domain  (src/domain/)        [pure business logic; no DB, no services]

API Routes (src/app/api/)
   → Services only           [never domain directly]
   → Never DB directly       [86 routes violate this — pre-existing, not new]
```

Permitted imports:
- Routes → Services
- Services → Domain
- Domain → (nothing from Services or Routes)

## I10-FAIL Findings

### I10-001 — domain/owner-mode/input-catalog.ts imports runtime value from services (FAIL)

```typescript
// src/domain/owner-mode/input-catalog.ts:17
import { CRITICAL_INGESTION_DOMAINS } from "@/services/owner-mode/owner-domain-ingestion";
```

**Classification:** Hard upward dependency (domain → service, runtime value).  
**Fix:** Move `CRITICAL_INGESTION_DOMAINS` const and its type `IngestionDomain` from `owner-domain-ingestion.ts` to a shared domain types file (e.g., `src/domain/owner-mode/ingestion-types.ts`). Update both the service and the domain file to import from the shared location.

---

### I10-002 — arbitrate/route.ts calls domain directly (FAIL)

```typescript
// src/app/api/owner/arbitrate/route.ts:12
import { arbitrate } from "@/domain/owner-mode/decision-arbitration";
return canonicalJson(arbitrate(candidates), { status: 200 });
```

**Available service wrapper:** `src/services/owner-mode/intervention-arbitration.service.ts::arbitrateInterventions()`  
**Impact:** Bypasses service layer's auditing and DB persistence that the service wrapper adds.  
**Fix:** Route calls `arbitrateInterventions()` from service instead of `arbitrate()` from domain.

---

### I10-003 — proof-risk/queue/route.ts calls domain directly (FAIL)

```typescript
// src/app/api/owner/proof-risk/queue/route.ts:13
import { buildAdjudicationQueue, ADJUDICATION_OUTCOME_OPTIONS } from "@/domain/owner-mode/adjudication-queue";
const { items, summary } = buildAdjudicationQueue({...})
```

**No service wrapper exists.**  
**Fix:** Create `src/services/owner-mode/adjudication-queue.service.ts` wrapping `buildAdjudicationQueue()`.

---

### I10-004 — owner/config/route.ts calls domain validation directly (FAIL)

```typescript
// src/app/api/owner/config/route.ts:12
import { validateOwnerDashboardConfig, ... } from "@/domain/owner-mode/owner-dashboard";
const validationErrors = validateOwnerDashboardConfig(updated);
```

**No service wrapper exists.**  
**Fix:** Create or extend a config service to own validation + persistence.

---

### I10-005 — guardrails/screen/route.ts calls 3 domain functions directly (FAIL)

```typescript
// src/app/api/owner/guardrails/screen/route.ts:16
import { screenOpportunity, screenContractQuote, shouldRunMarketing } from "@/domain/owner-mode/opportunity-contract-guardrails";
```

**Available service:** `src/services/owner-mode/opportunity-decision.service.ts` already wraps some of these.  
**Fix:** Route calls the service wrapper instead of domain functions directly.

---

### I10-006 — guidance/route.ts calls sealBoundary directly (FAIL)

```typescript
// src/app/api/employee/tasks/[taskId]/guidance/route.ts:4
import { sealBoundary } from "@/domain/execution/boundary";
const boundary = body.boundary ? sealBoundary(body.boundary) : null;
```

**Available service:** `src/services/execution/` contains guidance services.  
**Fix:** Move `sealBoundary` call into guidance service.

---

## I10-WARN Findings

### I10-007 — domain/decision/monetization.ts imports type from services

```typescript
// src/domain/decision/monetization.ts:8
import type { ScenarioComparison } from "@/services/control/scenario-comparison";
```
`ScenarioComparison` is a domain concept defined in a service file. Type-only import (no runtime coupling) but wrong structural direction.

---

### I10-008 through I10-012 — Domain files import Confidence/IngestionDomain/ReassessmentTrigger types from services

5 domain files reach up into `@/services/owner-mode/owner-domain-ingestion` for `Confidence` and `IngestionDomain` types, and into `@/services/owner-mode/reassessment-event.service` for `ReassessmentTrigger`.

Files:
- `src/domain/owner-mode/supervisor-summary.ts:21`
- `src/domain/owner-mode/owner-onboarding.ts:24`
- `src/domain/owner-mode/readiness-score.ts:25`
- `src/domain/owner-mode/input-guidance.ts:35`
- `src/domain/execution/proof-dispute.ts:16`

**Fix:** Extract `Confidence`, `IngestionDomain`, and `ReassessmentTrigger` to `src/domain/owner-mode/types.ts` (or separate domain type files). Update all 5 domain files and the service files to import from the shared location.

---

### I10-013, I10-014 — Routes call domain utility functions directly (WARN)

- `src/app/api/owner/approvals/resolve/route.ts:17` — calls `hashApprovalContent()` from domain
- `src/app/api/owner/manual-entry/route.ts:18` — calls `detectPiiInFields()` from domain

Both are utility-level operations alongside a proper service call. Lower risk than I10-002 through I10-006 but still violate the layer rule.

---

## Pre-Existing Note: 86 Routes Import lib/db Directly

During the pre-scan phase, 86 API route files were found to import `lib/db` directly rather than going through the service layer. This is a systemic pattern pre-dating this audit phase. It is tracked but not individually listed here — addressing it requires a systematic refactor (not a single PR).
