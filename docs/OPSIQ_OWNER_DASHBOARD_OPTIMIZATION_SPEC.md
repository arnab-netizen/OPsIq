# OpsIQ Owner Dashboard Optimization Specification

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase A  
**Status:** SPECIFICATION — not yet implemented  

---

## 1. Purpose

This document specifies the required state of the OpsIQ Owner Dashboard. The dashboard is the primary surface through which a business owner interacts with OpsIQ on a daily basis. Its design must reflect all four dimensions of the OpsIQ product model:

1. Consulting lifecycle stage
2. Business condition
3. Intervention mode and intervention phase
4. Human execution reality

The dashboard fails if any of those four dimensions is absent or unaddressed.

---

## 2. Seven Questions the Dashboard Must Answer

Every session, the dashboard must answer all seven of the following questions for the owner without requiring navigation:

| # | Question | Required Panel |
|---|----------|---------------|
| Q1 | What is my business condition right now, in one sentence? | Diagnosis Panel |
| Q2 | What is the single highest-priority action I must take today? | Action Queue |
| Q3 | What evidence led to that diagnosis? | Evidence Panel |
| Q4 | How confident is OpsIQ in this diagnosis and why? | Confidence Panel |
| Q5 | When is my next reassessment and what triggers it early? | Reassessment Panel |
| Q6 | What outcomes have been tracked since the last reassessment? | Outcome Panel |
| Q7 | What decisions or changes have been recorded and by whom? | Audit Panel |

The dashboard is NOT a navigation hub. It is a decision surface. All seven questions must be answerable from a single screen or a single scroll.

---

## 3. Eight Required Dashboard Panels

### Panel 1 — Owner Command Center (Navigation Anchor)

**Purpose:** Orient the owner to their business identity and consulting stage.

**Must display:**
- Business name
- Consulting lifecycle stage (e.g., Triage, Stabilize, Growth-Ready, Maintenance)
- Days since OpsIQ engagement began
- Business segment classification (retail SMB, professional services, trades, etc.)
- Quick-select for multi-business owners

**Must NOT display:**
- Motivational copy or decorative UI without data
- Status that has not been computed from evidence

---

### Panel 2 — Action Queue

**Purpose:** Surface the single highest-impact next action.

**Must display:**
- The one recommended action in plain language (verb-first sentence)
- Priority tier (P1/P2/P3)
- Estimated effort (Low/Medium/High)
- Owner accountability status (Committed / In Progress / Overdue / Blocked)
- Link to the full decision record
- Days since action was issued

**Must NOT display:**
- More than 3 concurrent P1 actions (cognitive overload)
- Actions without a linked evidence source
- Actions generated from cached stale data older than 7 days without a staleness flag

**Human-factors rule:** If owner has an overdue P1 action, display that before any new P2 action. Non-compliance history must surface.

---

### Panel 3 — Diagnosis Panel

**Purpose:** State the business condition in one clear, evidence-anchored sentence.

**Must display:**
- Primary root cause label (human-readable, not enum key)
- Secondary causes (up to 3, collapsed by default)
- Intervention mode (Triage / Stabilize / Recovery / Growth)
- Intervention phase within that mode
- Last updated timestamp
- Trigger that caused the current diagnosis

**Must NOT display:**
- Diagnosis text that parrots the owner's own input verbatim without synthesis
- Root cause enumeration without plain-language explanation

---

### Panel 4 — Evidence Panel

**Purpose:** Show the owner what OpsIQ knows and what it needs.

**Must display:**
- Evidence items used in current diagnosis (source, date, finding)
- Missing critical inputs flagged (each with an action link to provide it)
- Evidence confidence tier (Strong / Moderate / Weak / Assumed)
- Staleness warning for evidence older than 30 days

**Must NOT display:**
- Evidence manufactured without owner input
- More than 10 evidence items at a time without pagination

**Human-factors rule:** Missing evidence that directly blocks diagnosis confidence must be called out visually (red flag, not just a list item).

---

### Panel 5 — Confidence Panel

**Purpose:** Tell the owner how much to trust the current diagnosis.

**Must display:**
- Overall confidence score (0–100)
- Confidence tier (High ≥ 70 / Moderate 40–69 / Low < 40)
- Breakdown: what is known, what is assumed, what is missing
- Most critical missing input that would raise confidence

**Must NOT display:**
- Confidence without a breakdown
- 100% confidence in any early-stage diagnosis

---

### Panel 6 — Reassessment Panel

**Purpose:** Show when and why a reassessment is triggered.

**Must display:**
- Scheduled reassessment date
- Days remaining
- Early-trigger conditions and their current status (e.g., "Cash position deteriorates below $X — monitor")
- Last reassessment summary (2–3 sentences)
- Reassessment history count

**Must NOT display:**
- Reassessment due dates without an explanation of what will be reviewed
- Shock events that have occurred but not been surfaced to the owner

---

### Panel 7 — Outcome Panel

**Purpose:** Track what has actually changed since the last reassessment.

**Must display:**
- KPIs tracked (with current vs. baseline values)
- Actions completed since last reassessment
- Actions still open
- Any deterioration events
- Outcome narrative (1–2 sentences, evidence-based)

**Must NOT display:**
- Fabricated improvement narrative when KPIs are flat or declining
- Outcome claims without tracked evidence

---

### Panel 8 — Audit Panel

**Purpose:** Provide a governed record of all significant changes.

**Must display:**
- Chronological audit trail (decision made, by whom, when)
- Diagnosis changes with reason
- Action status changes
- Evidence additions
- Reassessment trigger events

**Must NOT display:**
- System-internal events with no owner-facing meaning
- Personally identifiable data beyond workspace scope

---

## 4. Dashboard Layout Requirements

- Mobile-first: all 8 panels must be accessible on a 375px viewport in a single scroll
- Panel 2 (Action Queue) and Panel 3 (Diagnosis) must be visible without scrolling on desktop (above fold)
- Confidence score and reassessment date must be visible on first screen load
- Panel 8 (Audit) may be collapsed by default but must be one tap/click to expand
- Stale-data warnings must appear inline in each panel, not in a separate "status" section

---

## 5. Data Freshness Requirements

| Data Type | Max Staleness Before Warning |
|-----------|---------------------------|
| Diagnosis | 14 days |
| Evidence items | 30 days |
| Action queue | 7 days |
| Outcome KPIs | 30 days |
| Confidence score | 14 days |
| Reassessment schedule | Computed at render |

---

## 6. Consulting Lifecycle Stage Definitions

| Stage | Description | Expected Intervention Mode |
|-------|-------------|--------------------------|
| Triage | First 2 weeks; diagnosis not yet stable | TRIAGE |
| Stabilize | Diagnosis stable; executing critical actions | STABILIZE |
| Recovery | Critical actions complete; rebuilding health | RECOVERY |
| Growth-Ready | Health stable; growth actions unlocked | GROWTH |
| Maintenance | Growth underway; monitoring and cadence | MAINTENANCE |

The lifecycle stage must be computed from evidence, not manually set by the owner.

---

## 7. Current Implementation Gap Summary

As of 2026-06-23, the OpsIQ owner dashboard (`/authenticated/owner/page.tsx`) implements Panel 1 (Owner Command Center) and portions of Panel 3 (Diagnosis) and Panel 2 (Action Queue). The following panels are missing or incomplete:

| Panel | Status |
|-------|--------|
| 1 — Command Center | Partially implemented |
| 2 — Action Queue | Partially implemented |
| 3 — Diagnosis | Partially implemented |
| 4 — Evidence | Missing |
| 5 — Confidence | Missing |
| 6 — Reassessment | Missing |
| 7 — Outcome | Partially implemented (impact page) |
| 8 — Audit | Missing |

This specification governs the target state. Implementation is a separate phase requiring explicit authorization.

---

## 8. Anti-Requirements

- The dashboard must NOT be a marketing surface
- The dashboard must NOT claim things are improving without tracked evidence
- The dashboard must NOT show "healthy" status based on stale data
- The dashboard must NOT allow the owner to navigate away before seeing their highest-priority action
- The dashboard must NOT display diagnosis text that uses language from the must_identify vocabulary as a label (leakage risk)

---

*This document is part of the OPTION-A Phase A repository completion work.*
