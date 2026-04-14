# Module 05 schema slice

## Objective
Implement schema for Module 05 — Evidence Vault.

## Entities
- EvidenceItem
- EvidenceBundle
- FileBlob

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
- financial
- operational
- human
- resilience
- client
- commercial
- leadership
- execution

## Required metadata
- evidence type
- source type
- source label
- source owner
- capture method
- capturedAt
- validation status
- traceability status
- visibility classification where relevant
