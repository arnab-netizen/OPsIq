# Module 14 backend slice

## Objective
Implement backend for Module 14 — Final UX, Client Portal, Admin Portfolio.

## Entities
- mode-aware projections and views

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Beginner vs expert behavior must be meaningfully different.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- mode-aware projection for beginner vs expert
- client-safe projection rules
- admin portfolio aggregation queries
