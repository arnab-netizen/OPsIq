# Module 04 schema slice

## Objective
Implement schema for Module 04 — Shock Events.

## Entities
- ShockEvent

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
- type
- severity
- happenedAt
- notes optional
- createdAt

## Supported types at minimum
- key_employee_loss
- major_client_loss
- payroll_pressure
- margin_collapse
- supplier_failure
- service_breakdown
- compliance_issue
- reputation_damage
- internal_conflict
- owner_withdrawal
- execution_stall
