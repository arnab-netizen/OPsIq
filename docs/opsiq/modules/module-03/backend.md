# Module 03 backend slice

## Objective
Implement backend for Module 03 — Intervention State.

## Entities
- InterventionState or explicit Engagement intervention phase fields

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Separates intervention phase from consulting stage. Do not confuse them.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- read current intervention state for engagement
- update intervention state through controlled service
- basic groundwork for adaptive update when triggered
