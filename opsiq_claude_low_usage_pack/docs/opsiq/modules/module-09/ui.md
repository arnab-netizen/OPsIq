# Module 09 UI slice

## Objective
Implement UI for Module 09 — KPIs.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
KPIs must support survival, execution, stability, and growth readiness.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- KPI list/dashboard
- create/edit KPI
- snapshot entry
- history/trend display
