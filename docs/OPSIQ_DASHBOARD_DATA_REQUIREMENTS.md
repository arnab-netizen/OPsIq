# OpsIQ Dashboard Data Requirements

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase A  
**Status:** SPECIFICATION — not yet implemented  

---

## 1. Purpose

This document specifies all data requirements for the OpsIQ Owner Dashboard: API contracts, payload shapes, computed fields, freshness rules, and database query requirements.

---

## 2. Panel 1 — Owner Command Center

### API: `GET /api/owner/command-center`

**Current status:** Implemented (partial)

**Required payload shape:**
```typescript
{
  selectedBusinessId: string;
  businesses: {
    id: string;
    name: string;
    segment: string;         // e.g., 'retail_smb', 'professional_services'
    daysInEngagement: number;
    lifecycleStage: 'TRIAGE' | 'STABILIZE' | 'RECOVERY' | 'GROWTH' | 'MAINTENANCE';
  }[];
  profile: {
    interventionMode: string;
    interventionPhase: string;
    recommendedNextAction: string | null;
    missingCriticalData: string[];
    riskScore: number;
    healthScore: number;
    lastDiagnosisAt: string; // ISO timestamp
  } | null;
}
```

**Gap:** `lifecycleStage` and `daysInEngagement` not currently returned.

---

## 3. Panel 2 — Action Queue

### API: `GET /api/owner/actions?businessId=<id>`

**Current status:** Partial (inbox endpoint exists, no priority tiers)

**Required payload shape:**
```typescript
{
  actions: {
    id: string;
    title: string;
    description: string;
    priority: 'P1' | 'P2' | 'P3';
    status: 'PENDING' | 'IN_PROGRESS' | 'COMMITTED' | 'OVERDUE' | 'BLOCKED' | 'COMPLETED';
    estimatedEffort: 'LOW' | 'MEDIUM' | 'HIGH';
    issuedAt: string;
    dueDate: string | null;
    daysOverdue: number;    // computed; 0 if not overdue
    evidenceSource: string; // which evidence item triggered this action
    decisionRecordId: string | null;
  }[];
  hasOverdueP1: boolean;
  queueStaleDays: number;  // days since last queue refresh
}
```

**Sort rule:** P1 actions first; within P1, overdue before non-overdue; then by issuedAt descending.

---

## 4. Panel 3 — Diagnosis

### API: `GET /api/owner/diagnosis?businessId=<id>`

**Current status:** Embedded in command-center; no standalone endpoint

**Required payload shape:**
```typescript
{
  primaryRootCause: {
    code: string;               // e.g., 'WORKING_CAPITAL_STRESS'
    label: string;              // human-readable: 'Working Capital Stress'
    description: string;        // 1-sentence explanation
  };
  secondaryCauses: {
    code: string;
    label: string;
  }[];
  interventionMode: 'TRIAGE' | 'STABILIZE' | 'RECOVERY' | 'GROWTH';
  interventionPhase: string;
  diagnosisTrigger: string;     // what caused the current diagnosis
  diagnosedAt: string;          // ISO timestamp
  staleDays: number;            // days since diagnosis
}
```

---

## 5. Panel 4 — Evidence

### API: `GET /api/owner/evidence?businessId=<id>`

**Current status:** Missing

**Required payload shape:**
```typescript
{
  evidence: {
    id: string;
    finding: string;
    source: 'OWNER_INPUT' | 'FINANCIAL_DATA' | 'INTERVIEW' | 'OBSERVATION' | 'EXTERNAL';
    collectedAt: string;
    confidenceTier: 'STRONG' | 'MODERATE' | 'WEAK' | 'ASSUMED';
    staleDays: number;
    usedInCurrentDiagnosis: boolean;
  }[];
  missingInputs: {
    label: string;
    description: string;
    impact: 'BLOCKS_DIAGNOSIS' | 'REDUCES_CONFIDENCE' | 'INFORMATIONAL';
    addInputUrl: string;
  }[];
  totalEvidenceCount: number;
  missingCriticalCount: number;
}
```

**DB query:** JOIN `BusinessEvidence` with current `BusinessConditionProfile.evidenceIds` to determine `usedInCurrentDiagnosis`.

---

## 6. Panel 5 — Confidence

### API: `GET /api/owner/confidence?businessId=<id>`

**Current status:** Missing

**Required payload shape:**
```typescript
{
  score: number;               // 0–100
  tier: 'HIGH' | 'MODERATE' | 'LOW' | 'BLOCKED';
  breakdown: {
    confirmedItems: number;
    assumedItems: number;
    missingCritical: number;
    recencyWeight: number;     // 0–1, penalty for stale evidence
  };
  topMissingInput: string | null;
  computedAt: string;          // ISO timestamp; not cached
}
```

**Computation (not stored):**
```
rawScore = confirmedItems / (confirmedItems + missingCritical)
score = rawScore × recencyWeight × 100
tier = score ≥ 70 → HIGH; ≥ 40 → MODERATE; ≥ 20 → LOW; else BLOCKED
```

---

## 7. Panel 6 — Reassessment

### API: `GET /api/owner/reassessment?businessId=<id>`

**Current status:** Missing

**Required payload shape:**
```typescript
{
  nextDate: string;             // ISO date
  daysRemaining: number;
  triggerConditions: {
    condition: string;
    currentValue: string | null;
    threshold: string;
    triggered: boolean;
  }[];
  lastReassessment: {
    date: string;
    summary: string;
    outcomeNarrative: string;
  } | null;
  historyCount: number;
}
```

**Early trigger conditions (standard set):**
- Cash position deteriorates below baseline - 20%
- Any P1 action overdue by > 14 days
- New critical evidence submitted
- Owner-reported shock event
- KPI deterioration > 15% from baseline

---

## 8. Panel 7 — Outcomes

### API: `GET /api/owner/outcomes?businessId=<id>`

**Current status:** Partial (dashboard/impact page exists with different shape)

**Required payload shape:**
```typescript
{
  kpis: {
    name: string;
    baseline: number;
    current: number;
    unit: string;            // e.g., '$', '%', 'days'
    trend: 'IMPROVING' | 'FLAT' | 'DETERIORATING';
    delta: number;
    measuredAt: string;
  }[];
  completedActions: {
    id: string;
    title: string;
    completedAt: string;
  }[];
  openActions: {
    id: string;
    title: string;
    priority: 'P1' | 'P2' | 'P3';
    daysOpen: number;
  }[];
  deteriorationEvents: {
    date: string;
    kpiName: string;
    description: string;
  }[];
  outcomeSentence: string;   // evidence-based; must not fabricate improvement
  baselineDate: string;
}
```

**Anti-fabrication rule:** `outcomeSentence` must be derived from KPI delta values, not generated as a positive narrative independently.

---

## 9. Panel 8 — Audit

### API: `GET /api/owner/audit?businessId=<id>&page=<n>&pageSize=<n>`

**Current status:** Missing

**Required payload shape:**
```typescript
{
  events: {
    id: string;
    eventType: 'DIAGNOSIS_CHANGE' | 'ACTION_STATUS_CHANGE' | 'EVIDENCE_ADDED' | 'REASSESSMENT_TRIGGERED' | 'ACTION_ISSUED';
    description: string;
    actor: 'SYSTEM' | 'OWNER' | 'OPERATOR';
    occurredAt: string;
    metadata: Record<string, unknown>;
  }[];
  totalCount: number;
  page: number;
  pageSize: number;
}
```

---

## 10. Freshness Enforcement

All endpoints must return a `dataFreshnessWarnings` field when applicable:

```typescript
dataFreshnessWarnings?: {
  field: string;
  lastUpdated: string;
  maxAgeDays: number;
  currentAgeDays: number;
}[]
```

The frontend must render `StaleDataBanner` inline in the panel for any warning returned.

---

## 11. Database Entities Required

| Entity | Prisma Model | Status |
|--------|-------------|--------|
| Business | `Business` | Exists |
| BusinessConditionProfile | `BusinessConditionProfile` | Exists |
| InterventionAction | `InterventionAction` | Exists |
| BusinessEvidence | `BusinessEvidence` | Exists |
| ReassessmentSchedule | `ReassessmentSchedule` | Unknown — needs audit |
| OutcomeRecord | `OutcomeRecord` | Unknown — needs audit |
| KPISnapshot | `KPISnapshot` | Unknown — needs audit |
| AuditEvent | `AuditEvent` | Exists (audit helper) |

Before implementing missing panels, a Prisma schema audit is required to determine whether `ReassessmentSchedule`, `OutcomeRecord`, and `KPISnapshot` exist or need to be created. This is a LANE_B change if new entities are needed.

---

*This document is part of the OPTION-A Phase A repository completion work.*
