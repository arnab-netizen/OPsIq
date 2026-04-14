# Module 03 UI slice

## Objective
Implement UI for Module 03 — Intervention State.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Separates intervention phase from consulting stage. Do not confuse them.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- engagement summary display of intervention mode and phase
- clear empty state if not yet set
