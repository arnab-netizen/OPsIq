# Module 02 UI slice

## Objective
Implement or correct UI for leads, clients, and engagements using the backend already implemented.

## Required screens
- leads list
- lead detail
- lead create
- clients list
- client detail
- client create
- engagements list
- engagement detail
- engagement create

## Required engagement detail display
- engagement code
- title
- status
- health status
- intervention mode
- client link
- service tier
- latest business condition summary
- memberships
- lineage block if parent or children exist

## Rules
- No business logic in pages/components.
- Use existing backend endpoints or server actions only.
- Surface empty and failure states.
- If business condition is missing, show an honest empty state.

## Acceptance criteria
- UI reflects real backend data.
- No screen depends on missing fields.
- Empty, loading, and not-found states exist.
- Engagement detail shows condition/mode/status cleanly.
