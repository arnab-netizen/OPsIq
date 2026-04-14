# Module 13 UI slice

## Objective
Implement UI for Module 13 — Notifications and Health.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Trigger-driven alerts and health changes; preserve adaptive cause metadata.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- notifications list
- health indicator
- stale/overdue warnings
