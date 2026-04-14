# Module 11 audit slice

## Objective
Audit Module 11 — Workflow and Governance against `CLAUDE.md`.

## Must check
- missing validation
- missing authorization
- missing audit events
- missing failure states
- UI-side business logic
- missing status, lineage, and visibility handling for all records and screens added by this module
- missing adaptive trigger pathway if this module creates or changes any significant business-change signal

## Core rule
Centralized transitions, approvals, overrides, and scope/risk governance.

## Acceptance criteria
- All discovered gaps are fixed or clearly documented as real limitations.
