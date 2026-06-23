# OpsIQ Dashboard Information Architecture

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase A  
**Status:** SPECIFICATION — not yet implemented  

---

## 1. Purpose

This document defines the information architecture (IA) of the OpsIQ Owner Dashboard: what data exists, how it is structured, where it comes from, and how panels consume it. This is distinct from UI layout (covered in the UX spec) and API schema (covered in data requirements).

---

## 2. Information Hierarchy

```
Owner Dashboard
├── Identity Layer
│   ├── Owner identity (name, workspace)
│   ├── Business identity (name, segment, size)
│   └── Consulting lifecycle stage
│
├── Condition Layer
│   ├── Active diagnosis
│   │   ├── Primary root cause
│   │   ├── Secondary causes (ordered by severity)
│   │   └── Diagnosis trigger
│   ├── Intervention mode
│   └── Intervention phase
│
├── Action Layer
│   ├── Action queue (priority-ordered)
│   │   ├── P1 actions (critical, must be addressed first)
│   │   ├── P2 actions (important, scheduled)
│   │   └── P3 actions (informational, deferred)
│   └── Action accountability state per action
│
├── Evidence Layer
│   ├── Confirmed evidence items (with source and timestamp)
│   ├── Missing critical inputs
│   └── Evidence confidence tier
│
├── Confidence Layer
│   ├── Overall confidence score
│   ├── Known / assumed / missing breakdown
│   └── Highest-impact missing input
│
├── Reassessment Layer
│   ├── Scheduled reassessment date
│   ├── Early-trigger conditions
│   └── Reassessment history
│
├── Outcome Layer
│   ├── KPI baseline vs. current
│   ├── Completed actions since last reassessment
│   └── Deterioration events
│
└── Audit Layer
    ├── Diagnosis change events
    ├── Action status change events
    ├── Evidence addition events
    └── Reassessment trigger events
```

---

## 3. Layer Dependencies

| Layer | Depends On | Blocked By |
|-------|-----------|-----------|
| Condition | Evidence | Insufficient evidence → low-confidence diagnosis |
| Action | Condition + Evidence | No diagnosis → no actions |
| Confidence | Evidence + Condition | Missing inputs reduce confidence |
| Reassessment | Condition + Outcome | No baseline → no reassessment schedule |
| Outcome | Action + Baseline KPIs | No tracked actions → no outcome data |
| Audit | All mutations | Any change emits audit event |

---

## 4. Data Sources by Layer

### Identity Layer
- Source: `workspace` record + `business` record  
- Staleness: None (always current)
- Computed: Consulting lifecycle stage from diagnosis + time-in-engagement

### Condition Layer
- Source: `BusinessConditionProfile` (Prisma model)
- Computed: `diagnosis-engine.ts` output
- Staleness limit: 14 days before warning

### Action Layer
- Source: `InterventionAction` records linked to active intervention
- Priority ordering: P1 first, then by issue date
- Staleness limit: 7 days since last queue refresh

### Evidence Layer
- Source: `BusinessEvidence` records + owner-submitted inputs
- Confidence tier: Computed from source type and recency
- Staleness limit: 30 days per item

### Confidence Layer
- Source: Computed from Evidence layer at render time
- Not persisted separately; derived on request
- Formula: (confirmed items / (confirmed + missing critical)) × recency weight

### Reassessment Layer
- Source: `ReassessmentSchedule` records
- Trigger conditions: Derived from `BusinessConditionProfile` thresholds
- Computed at render; not cached

### Outcome Layer
- Source: `OutcomeRecord` + `KPISnapshot` records
- Baseline: KPI values at last reassessment date
- Current: KPI values at render time

### Audit Layer
- Source: `AuditEvent` records emitted by all governed mutations
- Always appended, never mutated
- Display: Paginated, newest first

---

## 5. Navigation Model

The dashboard is a single-surface decision tool, not a navigation hub. Deep-links are secondary:

```
/owner/                     → Owner Command Center (Panel 1)
/owner/diagnosis/           → Expanded Diagnosis Panel (Panel 3)
/owner/evidence/            → Full Evidence Panel (Panel 4)
/owner/actions/             → Full Action Queue (Panel 2)
/owner/reassessment/        → Reassessment history + schedule (Panel 6)
/owner/outcomes/            → Outcome tracking detail (Panel 7)
/owner/audit/               → Full Audit trail (Panel 8)
```

The root `/owner/` page must include all eight panels in collapsed or summary form.

---

## 6. State Machine: Dashboard Render States

```
LOADING          → (fetch pending)
NO_BUSINESS      → (owner has no business registered)
TRIAGE           → (first 2 weeks; diagnosis not yet stable)
ACTIVE_STABLE    → (diagnosis stable; action queue active)
ACTIVE_OVERDUE   → (P1 action is overdue; must be surfaced first)
REASSESSMENT_DUE → (scheduled reassessment within 7 days)
DATA_STALE       → (evidence or diagnosis older than thresholds)
BLOCKED          → (missing critical data prevents any diagnosis)
ERROR            → (API failure)
```

Transitions are governed by business logic, not manually set by the owner.

---

## 7. Panel Data Contract Summary

| Panel | Primary Entity | Key Fields | Computed Fields |
|-------|---------------|-----------|----------------|
| 1 — Command Center | Business, Workspace | name, segment, stage | days_in_engagement |
| 2 — Action Queue | InterventionAction | title, priority, status | days_overdue |
| 3 — Diagnosis | BusinessConditionProfile | primary_root_cause, secondary_causes | trigger_description |
| 4 — Evidence | BusinessEvidence[] | finding, source, collected_at | confidence_tier |
| 5 — Confidence | Computed | — | score, tier, breakdown |
| 6 — Reassessment | ReassessmentSchedule | next_date, trigger_conditions | days_remaining |
| 7 — Outcome | OutcomeRecord, KPISnapshot | kpi_name, baseline, current | delta, trend |
| 8 — Audit | AuditEvent[] | event_type, actor, timestamp | — |

---

## 8. Information Access Rules

- Owners see only their own workspace data
- Multi-business owners see a switcher; cross-business data is never merged
- Audit panel data is read-only for owners
- Diagnosis data may only be updated by the engine, not by owners directly
- Evidence may be added by owners but cannot be deleted without audit record
- Confidence score is computed, not stored, to prevent staleness

---

## 9. Gaps in Current Implementation

The current `/authenticated/owner/page.tsx` uses a single `command-center` API endpoint that returns a partially-typed `any` payload. The following IA gaps exist:

1. No `ReassessmentSchedule` entity queried or displayed
2. No `OutcomeRecord` / `KPISnapshot` entities displayed (impact page exists separately but is not part of owner dashboard)
3. No `AuditEvent` display in owner dashboard
4. No confidence score computation displayed
5. Evidence panel is absent; evidence items are embedded in diagnosis text rather than structured

These gaps must be addressed before the dashboard can answer all 7 required questions (see optimization spec).

---

*This document is part of the OPTION-A Phase A repository completion work.*
