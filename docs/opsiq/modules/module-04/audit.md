# Module 04 audit slice

## Objective
Audit Module 04 — Shock Events against `CLAUDE.md`.

## Must check
- missing validation
- missing authorization
- missing audit events
- missing failure states
- UI-side business logic
- missing status, lineage, and visibility handling for all records and screens added by this module
- missing adaptive trigger pathway if this module creates or changes any significant business-change signal

## Core rule
Shock events are first-class records and must route into adaptive logic groundwork.

## Acceptance criteria
- All discovered gaps are fixed or clearly documented as real limitations.
