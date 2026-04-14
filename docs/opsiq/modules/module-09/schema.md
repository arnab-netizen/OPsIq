# Module 09 schema slice

## Objective
Implement schema for Module 09 — KPIs.

## Entities
- KPIDefinition
- KPISnapshot

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

## Required categories
- survival
- execution
- stability
- growth_readiness

## Required snapshot fields
- kpiDefinitionId
- periodStart optional
- periodEnd optional
- value
- sourceNote or evidence linkage
- confidenceLabel
- recordedAt
