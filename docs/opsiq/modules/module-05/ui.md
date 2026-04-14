# Module 05 UI slice

## Objective
Implement UI for Module 05 — Evidence Vault.

## Rules
- No business logic in UI.
- Consume backend APIs or server actions only.
- Show loading, empty, failure, and not-found states for every screen or panel created in this slice.
- Surface current governed state honestly.
- Do not invent fields not provided by backend.

## Core rule
Manual evidence is first-class, not only file uploads.

## Acceptance criteria
- UI reflects real backend data.
- Failure and empty states exist.
- No page depends on missing schema fields.

## Required screens or panels
- evidence vault
- upload form
- manual evidence entry form
- bundle create/view screen
