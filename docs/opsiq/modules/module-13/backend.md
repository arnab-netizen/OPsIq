# Module 13 backend slice

## Objective
Implement backend for Module 13 — Notifications and Health.

## Entities
- notification model or equivalent
- health recomputation pathway

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Trigger-driven alerts and health changes; preserve adaptive cause metadata.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- create notification from trigger
- detect stale or overdue items
- recompute health
- route adaptive trigger
