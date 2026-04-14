# Module 11 schema slice

## Objective
Implement schema for Module 11 — Workflow and Governance.

## Entities
- StageTemplate
- StageInstance
- StageBlocker
- ApprovalRecord
- OverrideRecord
- ScopeVersion
- ScopeChangeRequest
- RiskRecord
- AssumptionRecord
- ReferralRecord

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

## Include entities
- StageTemplate
- StageInstance
- StageBlocker
- ApprovalRecord
- OverrideRecord
- ScopeVersion
- ScopeChangeRequest
- RiskRecord
- AssumptionRecord
- ReferralRecord

## Stage states
- draft
- not_started
- active
- pending_input
- awaiting_client
- awaiting_consultant
- awaiting_validation
- awaiting_approval
- blocked
- deferred
- partially_completed
- completed
- cancelled
- reopened
- disputed
- provisional_output_only
- forced_closure_review
- dormant
