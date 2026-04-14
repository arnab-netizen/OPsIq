# Module 04 backend slice

## Objective
Implement backend for Module 04 — Shock Events.

## Entities
- ShockEvent

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Shock events are first-class records and must route into adaptive logic groundwork.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- create shock event
- list shock events for engagement
- retrieve shock event detail
- route creation into adaptive trigger groundwork
