# Module 06 UI slice

## Objective
Implement UI for Module 06 — Findings.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Findings must trace to evidence or explicit provisional path.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- findings list
- finding detail
- evidence trace panel
- confidence and provisional indicators
