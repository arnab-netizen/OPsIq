# Module 07 backend slice

## Objective
Implement backend for Module 07 — Recommendations.

## Entities
- Recommendation

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Recommendations must carry class and feasibility-oriented scoring.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- create recommendation
- link recommendation to findings
- store class and scores
- rank recommendation
