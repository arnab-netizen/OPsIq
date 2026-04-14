# Module 10 backend slice

## Objective
Implement backend for Module 10 — Deliverables.

## Entities
- Deliverable
- DeliverableVersion

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
No silent overwrite. Source manifest and version lineage required.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- create deliverable
- create deliverable version
- fetch version history
- supersede current version
