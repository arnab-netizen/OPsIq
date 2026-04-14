# Module 02 recovery slice

## Objective
Reconcile the existing partial Module 02 work already created in Claude before adding more code.

## Required work
- Inspect the current Prisma schema, APIs, services, and UI related to leads, clients, and engagements.
- Identify mismatches between current implementation and the required model.
- Identify any UI-first shortcuts, direct fetches, missing services, missing validation, missing audit events, and missing business condition support.
- Produce fixes, not just a report.

## Required entity shape
- ClientAccount
- ClientContact
- LeadRecord
- Engagement
- EngagementMembership
- BusinessConditionProfile

## Required Engagement fields
- id
- code
- title
- status
- serviceTier
- clientId
- healthStatus
- interventionMode
- createdAt
- updatedAt

## Required BusinessConditionProfile fields
- engagementId
- businessStatus
- severityScore
- urgencyLevel
- cashPressureLevel
- marginPressureLevel
- clientConcentrationRisk
- ownerDependencyRisk
- keyPersonDependencyRisk
- processMaturityLevel
- managementMaturityLevel
- executionCapacityLevel
- moraleFragilityLevel
- resilienceLevel
- growthReadinessLevel
- createdAt

## Rules
- Do not continue feature expansion until this recovery slice is complete.
- If current UI assumes fields that do not exist yet, fix the mismatch.
- If pages fetch data directly in ways that bypass service patterns, fix that or clearly route to the correct backend path.
- Add or fix audit event emissions for Module 02 write paths.
- Add or fix validation on Module 02 write paths.

## Acceptance criteria
- Current partial Module 02 work is aligned with the required entity model.
- Existing UI does not depend on invented fields that lack backend support.
- Missing validation and audit gaps are fixed.
- A clear base exists for schema, backend, and UI slices to continue cleanly.
