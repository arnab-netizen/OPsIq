# Module 03 audit slice

## Objective
Audit Module 03 — Intervention State against `CLAUDE.md`.

## Must check
- missing validation
- missing authorization
- missing audit events
- missing failure states
- UI-side business logic
- missing status, lineage, and visibility handling for all records and screens added by this module
- missing adaptive trigger pathway if this module creates or changes any significant business-change signal

## Core rule
Separates intervention phase from consulting stage. Do not confuse them.

## Acceptance criteria
- All discovered gaps are fixed or clearly documented as real limitations.
