# Module 11 backend slice

## Objective
Implement backend for Module 11 — Workflow and Governance.

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

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Centralized transitions, approvals, overrides, and scope/risk governance.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- controlled stage transition
- blocker create/resolve
- approval request/record
- override request/apply
- create scope version and scope change request
- create risk, assumption, referral
