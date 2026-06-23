# OpsIQ Dashboard Component Inventory

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase A  
**Status:** SPECIFICATION — inventory of existing vs. required  

---

## 1. Purpose

This document inventories all UI components required by the OpsIQ Owner Dashboard, classifies their current implementation status, and specifies what must be built or extended.

---

## 2. Existing Components (Confirmed Present)

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| `OwnerCommandCenterPage` | `src/app/(authenticated)/owner/page.tsx` | Partial | Implements Panel 1 + partial Panel 2/3 |
| `portfolio-command-center-shell` | `src/app/components/portfolio-command-center-shell.tsx` | Present | Shell wrapper, not panel content |
| `DiagnosisPanel` reference | `src/app/(authenticated)/owner/page.tsx` | Partial | Embedded in command center, not standalone |
| `DashboardImpactPage` | `src/app/dashboard/impact/page.tsx` | Present | Covers part of Panel 7 (outcomes) |
| `InboxClient` | `src/app/dashboard/inbox/inbox-client.tsx` | Present | Covers part of Panel 2 (action queue) |
| `Badge`, `Button`, `Select` | `src/ui/primitives` | Present | Core UI primitives |

---

## 3. Required Components — Not Yet Implemented

### 3.1 EvidencePanel

**Purpose:** Display evidence items with source, confidence tier, and missing-inputs call-to-action.

**Props:**
```typescript
interface EvidencePanelProps {
  evidence: EvidenceItem[];
  missingInputs: MissingInput[];
  onAddEvidence: () => void;
}
```

**States:** Empty (no evidence), Populated, Has-missing-critical, Stale-evidence-warning

---

### 3.2 ConfidencePanel

**Purpose:** Display computed confidence score with breakdown.

**Props:**
```typescript
interface ConfidencePanelProps {
  score: number;           // 0–100
  tier: 'High' | 'Moderate' | 'Low';
  knownCount: number;
  assumedCount: number;
  missingCriticalCount: number;
  topMissingInput: string | null;
}
```

**States:** High-confidence, Moderate-confidence, Low-confidence, Blocked (score < 20)

---

### 3.3 ReassessmentPanel

**Purpose:** Show next reassessment date, early-trigger conditions, and history summary.

**Props:**
```typescript
interface ReassessmentPanelProps {
  nextDate: Date;
  triggerConditions: TriggerCondition[];
  lastSummary: string | null;
  historyCount: number;
}
```

**States:** Scheduled, Due-soon (< 7 days), Overdue, No-history

---

### 3.4 OutcomePanelExtended

**Purpose:** Structured KPI tracking with baseline vs. current comparison.  
(Extends the existing impact page logic into a structured panel.)

**Props:**
```typescript
interface OutcomePanelProps {
  kpis: KPIEntry[];
  completedActions: ActionSummary[];
  openActions: ActionSummary[];
  deteriorationEvents: DeteriorationEvent[];
  outcomeSentence: string;
}
```

**States:** Improving, Flat, Deteriorating, No-baseline

---

### 3.5 AuditPanel

**Purpose:** Paginated audit trail of all governed mutations.

**Props:**
```typescript
interface AuditPanelProps {
  events: AuditEvent[];
  pageSize: number;
  collapsed?: boolean;
}
```

**States:** Empty, Populated, Loading, Collapsed

---

### 3.6 StaleDataBanner

**Purpose:** Inline warning shown within any panel when its data exceeds freshness threshold.

**Props:**
```typescript
interface StaleDataBannerProps {
  dataType: string;
  lastUpdated: Date;
  maxAgedays: number;
}
```

---

### 3.7 MissingInputCallout

**Purpose:** High-visibility callout for missing critical inputs that block diagnosis.

**Props:**
```typescript
interface MissingInputCalloutProps {
  missingInputs: string[];
  onAction: (input: string) => void;
}
```

---

### 3.8 ActionQueueExtended

**Purpose:** Extended action queue with P1/P2/P3 tiers, overdue detection, and accountability status.  
(Extends the existing inbox component with priority and accountability state.)

**Props:**
```typescript
interface ActionQueueProps {
  actions: Action[];
  onStatusChange: (actionId: string, status: ActionStatus) => void;
}
```

**States:** Empty, P1-only, Mixed-priority, Has-overdue, Stale

---

## 4. Component Dependency Graph

```
OwnerCommandCenterPage
├── BusinessIdentityHeader        (exists, embedded)
├── ActionQueueExtended           (to be built)
├── DiagnosisPanelStandalone      (to be extracted from page)
├── EvidencePanel                 (to be built)
├── ConfidencePanel               (to be built)
├── ReassessmentPanel             (to be built)
├── OutcomePanelExtended          (to be built, extends DashboardImpactPage)
└── AuditPanel                    (to be built)
    └── AuditEvent[]              (from API)

Shared across panels:
├── StaleDataBanner               (to be built)
├── MissingInputCallout           (to be built)
├── Badge                         (exists)
├── Button                        (exists)
└── Select                        (exists)
```

---

## 5. API Endpoints Required

| Panel | Endpoint | Status |
|-------|----------|--------|
| 1 — Command Center | `/api/owner/command-center` | Exists |
| 2 — Action Queue | `/api/owner/actions` | Exists (inbox) |
| 3 — Diagnosis | `/api/owner/diagnosis` | Exists (embedded in command-center) |
| 4 — Evidence | `/api/owner/evidence` | Missing |
| 5 — Confidence | `/api/owner/confidence` | Missing |
| 6 — Reassessment | `/api/owner/reassessment` | Missing |
| 7 — Outcomes | `/api/owner/outcomes` | Partial (dashboard/impact) |
| 8 — Audit | `/api/owner/audit` | Missing |

---

## 6. Mobile Component Requirements

All components must meet minimum mobile specifications:
- Touch target size: ≥ 44×44px for all interactive elements
- Font size: ≥ 14px for body text, ≥ 16px for critical information
- No horizontal scroll on 375px viewport
- Panel collapse/expand via tap (no hover states as primary interaction)
- Overdue P1 action must be visible above fold on mobile (375px × 667px minimum)

---

## 7. Component Build Priority Order

If implementation is authorized, build in this order:

1. `StaleDataBanner` (dependency of all panels)
2. `MissingInputCallout` (dependency of Evidence + Confidence panels)
3. `EvidencePanel` (blocks Confidence panel)
4. `ConfidencePanel` (requires Evidence data)
5. `ActionQueueExtended` (extends existing inbox)
6. `ReassessmentPanel` (requires Reassessment API)
7. `OutcomePanelExtended` (extends existing impact page)
8. `AuditPanel` (requires Audit API)

---

*This document is part of the OPTION-A Phase A repository completion work.*
