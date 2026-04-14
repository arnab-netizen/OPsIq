# Module 06 schema slice

## Objective
Implement schema for Module 06 — Findings.

## Entities
- Finding
- FindingEvidenceLink

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
- stageId optional if used
- title
- statement
- severity
- status
- confidenceLabel
- provisionalFlag
- clientVisibilityStatus
- supersedesFindingId optional
