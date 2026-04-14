# Module 10 UI slice

## Objective
Implement UI for Module 10 — Deliverables.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
No silent overwrite. Source manifest and version lineage required.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- deliverables list
- detail page
- version history
- source manifest display
