# Module 02 backend slice

## Objective
Implement backend for clients, contacts, leads, engagements, memberships, and business condition.

## Required backend outputs
- validation schemas
- repository or data-access layer if used in the repo
- service layer
- API routes or server actions
- centralized audit event emission
- permission checks
- duplicate/conflict protection where relevant

## Required operations

### Clients
- create client
- list clients
- get client detail

### Contacts
- create contact for client
- list contacts for client

### Leads
- create lead
- list leads
- get lead detail
- update lead basic fields
- optionally link lead to client and/or engagement

### Engagements
- create engagement
- list engagements
- get engagement detail with:
  - client
  - memberships
  - latest business condition profile
  - parent and child lineage where present

### Business condition
- create condition profile version
- fetch latest active/latest version for engagement

## Rules
- Do not implement mutation routes without validation.
- Do not skip audit events on create/update/link actions.
- Do not skip authorization checks.
- Do not overwrite an older business condition record in place; create a new record/version entry.

## Acceptance criteria
- API or server actions work for required operations.
- Validation exists on all write paths.
- Audit events are emitted.
- Business condition is append-preserved.
