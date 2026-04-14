# Module 08 backend slice

## Objective
Implement backend for Module 08 — Actions.

## Entities
- ActionItem
- ActionDependency

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Actions must include contingency and fallback fields.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- create action
- update action
- assign owner
- complete action
- manage dependencies
