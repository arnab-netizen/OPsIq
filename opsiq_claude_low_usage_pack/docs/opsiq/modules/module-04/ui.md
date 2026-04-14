# Module 04 UI slice

## Objective
Implement UI for Module 04 — Shock Events.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Shock events are first-class records and must route into adaptive logic groundwork.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- shock event list on engagement or dedicated page
- create shock event form
- detail view that shows type, severity, timestamp, notes, and linked engagement
