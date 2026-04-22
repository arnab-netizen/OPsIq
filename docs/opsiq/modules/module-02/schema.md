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
- legalName optional
- industry optional
- size optional
- status
- website optional
- address optional
- notes optional
- version
- visibility
- createdBy optional
- createdAt
- updatedAt
- archivedAt optional

### ClientContact
- id
- clientId
- name
- email optional
- phone optional
- role optional
- isPrimary
- isActive
- notes optional
- createdAt
- updatedAt

### LeadRecord
- id
- companyName
- contactName optional
- contactEmail optional
- contactPhone optional
- source optional
- status
- notes optional
- estimatedValue optional
- convertedToClientId optional
- engagementId optional
- assignedTo optional
- createdBy optional
- version
- createdAt
- updatedAt

### Engagement
- id
- code unique
- title
- clientId
- serviceTier
- engagementMode
- status
- healthStatus
- interventionMode
- description optional
- startDate optional
- targetEndDate optional
- actualEndDate optional
- ownerId optional
- assignedConsultantId optional
- currentScopeVersionId optional
- parentEngagementId optional
- version
- visibility
- createdBy optional
- createdAt
- updatedAt

### EngagementMembership
- id
- engagementId
- userId
- role
- addedBy optional
- addedAt
- removedAt optional
- isActive

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
- notes optional
- assessedBy optional
- version
- isCurrent
- createdAt
- updatedAt

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
