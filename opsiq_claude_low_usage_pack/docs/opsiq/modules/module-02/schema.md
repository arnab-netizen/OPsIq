# Module 02 schema slice

## Objective
Add or correct schema for clients, contacts, leads, engagements, memberships, and business condition.

## Entities
- ClientAccount
- ClientContact
- LeadRecord
- Engagement
- EngagementMembership
- BusinessConditionProfile

## Required fields

### ClientAccount
- id
- name
- industry
- website optional
- createdAt
- updatedAt

### ClientContact
- id
- clientId
- name
- email optional
- phone optional
- title optional
- createdAt
- updatedAt

### LeadRecord
- id
- name
- contactName optional
- email optional
- phone optional
- source optional
- status
- notes optional
- linkedClientId optional
- linkedEngagementId optional
- createdAt
- updatedAt

### Engagement
- id
- code unique
- title
- status
- serviceTier
- clientId
- healthStatus
- interventionMode
- parentEngagementId optional
- createdAt
- updatedAt

### EngagementMembership
- id
- engagementId
- userId
- role
- createdAt

### BusinessConditionProfile
- id
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

## Enums
Add typed enums where appropriate for:
- lead status
- engagement status
- engagement health status
- intervention mode
- business status
- urgency level

## Rules
- Preserve one-to-many relationships correctly.
- Prepare parent/child lineage on Engagement.
- Do not add future-module entities here.
- Add indexes and uniqueness where obviously needed.

## Acceptance criteria
- Prisma schema compiles.
- Migration is coherent.
- Relations are correct.
- No required field from this slice is missing.
