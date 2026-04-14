# Module 11 UI slice

## Objective
Implement UI for Module 11 — Workflow and Governance.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Centralized transitions, approvals, overrides, and scope/risk governance.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- stage map
- blocker panel
- approval/override queue or panel
- scope history
- risk/assumption/referral views
