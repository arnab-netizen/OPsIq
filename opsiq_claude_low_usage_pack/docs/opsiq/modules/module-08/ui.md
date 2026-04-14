# Module 08 UI slice

## Objective
Implement UI for Module 08 — Actions.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Actions must include contingency and fallback fields.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- action list or board
- action detail
- dependency editor
- contingency/fallback display
