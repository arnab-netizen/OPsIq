# Module 03 schema slice

## Objective
Implement schema for Module 03 — Intervention State.

## Entities
- InterventionState or explicit Engagement intervention phase fields

## Rules
- Add only schema and typed constants/enums needed for this module.
- Do not implement services or UI in this slice.
- Add relations, indexes, and enums where obviously required.
- Preserve lineage, visibility, status, and audit-readiness fields where relevant.

## Required result
- coherent schema
- migration-ready changes
- no ad hoc free-text statuses where governed enums are obvious

## Acceptance criteria
- Schema compiles.
- Migration is coherent.
- Required fields and relations for this module exist.

## Required fields
- engagementId
- interventionMode
- interventionPhase
- createdAt
- updatedAt or explicit version timestamp

## Required values
Mode:
- recovery
- stabilization
- growth
- shock_response
- mixed

Phase:
- triage
- stabilize
- repair
- strengthen
- grow
- protect
