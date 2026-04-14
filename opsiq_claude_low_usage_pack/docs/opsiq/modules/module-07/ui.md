# Module 07 UI slice

## Objective
Implement UI for Module 07 — Recommendations.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Recommendations must carry class and feasibility-oriented scoring.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- recommendations list
- class and score display
- ranking or priority view
