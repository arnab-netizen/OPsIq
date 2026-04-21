# Module 02 Schema

## Implemented Entities

### ClientAccount
- id (uuid, PK)
- name (string)
- legalName (string, optional)
- industry (string, optional)
- size (string, optional: micro|small|medium|large)
- status (string: active|inactive|archived)
- website (string, optional)
- address (string, optional)
- notes (string, optional)
- version (int)
- visibility (string: internal|client_visible)
- createdBy (uuid, optional)
- createdAt (datetime)
- updatedAt (datetime)
- archivedAt (datetime, optional)
- Relations: contacts[], engagements[], leads[]
- Indexes: status

### ClientContact
- id (uuid, PK)
- clientId (uuid, FK→ClientAccount)
- name (string)
- email (string, optional)
- phone (string, optional)
- role (string, optional: e.g. owner|cfo|operations_manager)
- isPrimary (boolean)
- isActive (boolean)
- notes (string, optional)
- visibility (string: internal|client_visible)
- createdAt (datetime)
- updatedAt (datetime)
- Relations: client (ClientAccount)
- Indexes: clientId+isActive

### LeadRecord
- id (uuid, PK)
- companyName (string)
- contactName (string, optional)
- contactEmail (string, optional)
- contactPhone (string, optional)
- source (string, optional: e.g. referral|website|outbound)
- status (string: new|qualifying|qualified|converted|lost)
- notes (string, optional)
- estimatedValue (float, optional)
- convertedToClientId (uuid, optional, FK→ClientAccount)
- engagementId (uuid, optional, FK→Engagement)
- assignedTo (uuid, optional)
- visibility (string: internal|client_visible)
- createdBy (uuid, optional)
- createdAt (datetime)
- updatedAt (datetime)
- Relations: client (ClientAccount), engagement (Engagement)
- Indexes: status, assignedTo, convertedToClientId

### Engagement
- id (uuid, PK)
- code (string, unique)
- title (string)
- clientId (uuid, FK→ClientAccount)
- serviceTier (string: standard|premium|enterprise)
- engagementMode (string: beginner|expert)
- status (string: draft|active|paused|completed|cancelled|archived)
- healthStatus (string: healthy|at_risk|critical|unknown)
- interventionMode (string: recovery|stabilization|growth|shock_response|mixed)
- description (string, optional)
- startDate (datetime, optional)
- targetEndDate (datetime, optional)
- actualEndDate (datetime, optional)
- ownerId (uuid, optional)
- assignedConsultantId (uuid, optional)
- currentScopeVersionId (uuid, optional)
- parentEngagementId (uuid, optional, FK→Engagement)
- version (int)
- visibility (string: internal|client_visible)
- createdBy (uuid, optional)
- createdAt (datetime)
- updatedAt (datetime)
- Relations: client (ClientAccount), parent (Engagement), children[] (Engagement), conditionProfiles[], memberships[], leads[]
- Indexes: clientId, status, ownerId, parentEngagementId

### EngagementMembership
- id (uuid, PK)
- userId (uuid, FK→User)
- engagementId (uuid, FK→Engagement)
- role (string)
- addedBy (uuid, optional)
- addedAt (datetime)
- removedAt (datetime, optional)
- isActive (boolean)
- Relations: user (User), engagement (Engagement)
- Unique: userId+engagementId+role
- Indexes: engagementId+isActive, userId+isActive

### BusinessConditionProfile
- id (uuid, PK)
- engagementId (uuid, FK→Engagement)
- businessStatus (string: critical|distressed|challenged|stable|improving|strong)
- severityScore (int: 1-10)
- urgencyLevel (string: low|medium|high|critical)
- cashPressureLevel (string: low|medium|high|critical)
- marginPressureLevel (string: low|medium|high|critical)
- clientConcentrationRisk (string: low|medium|high|critical)
- ownerDependencyRisk (string: low|medium|high|critical)
- keyPersonDependencyRisk (string: low|medium|high|critical)
- processMaturityLevel (string: low|medium|high)
- managementMaturityLevel (string: low|medium|high)
- executionCapacityLevel (string: low|medium|high)
- moraleFragilityLevel (string: low|medium|high|critical)
- resilienceLevel (string: low|medium|high)
- growthReadinessLevel (string: low|medium|high)
- notes (string, optional)
- assessedBy (uuid, optional)
- version (int)
- isCurrent (boolean)
- createdAt (datetime)
- updatedAt (datetime)
- Relations: engagement (Engagement)
- Indexes: engagementId+isCurrent, engagementId

## Status Enums

All enum values defined in src/domain/constants/statuses.ts:
- ENGAGEMENT_STATUSES: draft|active|paused|completed|cancelled|archived
- LEAD_STATUSES: new|qualifying|qualified|converted|lost
- CLIENT_ACCOUNT_STATUSES: active|inactive|archived
- HEALTH_STATUSES: healthy|at_risk|critical|unknown
- INTERVENTION_MODES: recovery|stabilization|growth|shock_response|mixed
- BUSINESS_CONDITION_RATINGS: critical|distressed|challenged|stable|improving|strong
- PRESSURE_LEVELS: low|medium|high|critical
- MATURITY_LEVELS: low|medium|high
- SERVICE_TIERS: standard|premium|enterprise
- ENGAGEMENT_MODES: beginner|expert
- VISIBILITY_LEVELS: internal|client_visible

## Cross-Cutting Fields

All entities include:
- Unique IDs (uuid)
- createdAt / updatedAt timestamps
- visibility classification (internal or client_visible)
- Audit support via eventName/entityType/entityId tracking

Lifecycle entities include:
- version (optimistic locking)
- createdBy (actor accountability)
- Soft-delete support (isActive flags where applicable)
- Temporal tracking (addedAt/removedAt, startDate/targetEndDate/actualEndDate)
