# Module 13 schema slice

## Objective
Implement schema for Module 13 — Notifications and Health.

## Entities
- notification record model
- health recomputation pathway

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

## Required support
- notification record model with durable storage
- health status fields or durable update pathway
