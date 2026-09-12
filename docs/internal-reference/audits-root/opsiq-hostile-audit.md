OPSIQ HOSTILE AUDIT
1. CURRENT SPEC

Domain Purpose:
  Governed business intervention and consulting operating system. Must model four dimensions
  at all times: consulting lifecycle stage, business condition, intervention mode/phase,
  human execution reality.

Current Application:
  Backend API service layer for complete intervention workflow from shock detection through
  KPI tracking. Full schema, service layer, API endpoints, and audit event infrastructure.
  No UI for intervention workflow. No end-to-end testing of API layer.

Major Entities:
  User, Session, Role, EngagementMembership
  Lead, ClientAccount, ClientContact
  Engagement, BusinessConditionProfile
  InterventionState, ShockEvent
  EvidenceItem, Finding, FindingEvidenceLink
  Recommendation, Action, KPI, KPIEvent
  AuditEvent, IdempotencyRecord, ScheduledTask

Workflow Supported:
  Engagement creation → BusinessCondition profiling → InterventionState initialization
  → ShockEvent recording → EvidenceItem collection → Finding creation → Recommendation
  generation → Action creation → Action ownership assignment → Action deadline/priority
  setting → KPI baseline/target definition → KPI value changes recorded with attribution
  to actions. InterventionState phase transitions gated at each step. Phase CLOSED blocks
  all writes.

User Roles/Capabilities Present:
  System admin, user mgmt, role assignment
  Client account CRUD
  Lead CRUD
  Engagement CRUD with member management
  Evidence submission/validation (EVIDENCE_VIEW, EVIDENCE_SUBMIT)
  Finding creation/view (FINDING_VIEW, FINDING_CREATE)
  Recommendation creation/approve (RECOMMENDATION_VIEW, RECOMMENDATION_CREATE, RECOMMENDATION_APPROVE)
  Action creation/manage (INTERVENTION_MANAGE, INTERVENTION_VIEW for most; INTERVENTION_PHASES for state)
  KPI creation/update (INTERVENTION_MANAGE, INTERVENTION_VIEW)
  BusinessCondition assessment/view
  InterventionState transition control

UI Pages Present:
  /login, /, /dashboard
  /clients, /clients/[id], /clients/new
  /engagements, /engagements/[id], /engagements/new
  /leads, /leads/[id], /leads/new
  /users, /settings
  Total: 14 pages
  Missing: All intervention workflow pages (shock, evidence, findings, recommendations, actions, KPIs)

APIs Present:
  22 endpoints under /engagements/[engagementId]/:
    /shock-events (POST, GET), /shock-events/[id] (GET)
    /evidence-items (POST, GET), /evidence-items/[id] (GET)
    /findings (POST, GET), /findings/[id] (GET)
    /recommendations (POST, GET), /recommendations/[id] (GET)
    /actions (POST, GET), /actions/[id] (GET), /actions/[id]/status (PUT), /actions/[id]/assign (POST),
             /actions/[id]/due-date (POST), /actions/[id]/priority (POST)
    /kpis (POST, GET), /kpis/[id] (GET), /kpis/[id]/value (POST), /kpis/[id]/record (POST)
    /intervention-state (GET, PUT)
    /condition (GET, POST)
    / (GET, PATCH)
  HTTP methods: GET, POST, PUT only. No DELETE in intervention modules.
  All endpoints require auth + capability check + UUID validation.

Services Present:
  18 services implementing business logic:
    action (createAction, listActions, getActionById, updateActionStatus, assignOwner,
            setDueDate, setPriority)
    kpi (createKPI, listKPIs, getKPIById, updateKPIValue)
    kpi-event (recordKPIChange with delta calculation, status re-derivation)
    intervention-state (initializeInterventionState, transitionPhase, getInterventionState,
                        getPhaseAllowedTransitions)
    shock-event, evidence-item, finding, recommendation (analogous CRUD + list + get operations)
    re-evaluation (triggerReEvaluation stub - emits audit, specifies targets, no implementation)
    Plus: auth, engagement, client-account, lead, user, role-assignment, business-condition, etc.

Audit/Control Behavior Present:
  81 audit events defined (ACTION, KPI, FINDING, RECOMMENDATION, EVIDENCE, SHOCK, INTERVENTION, etc.)
  All mutations emit audit events with actor, entity type, entity ID, payload, visibility (internal/client).
  Audit event payload includes relevant previous/new values for state transitions.
  Phase CLOSED blocks all writes to action, evidence, finding, recommendation, KPI.
  Version-based optimistic locking on Action updates.
  Cross-engagement ownership validation (recommendation belongs to engagement, action belongs to
  engagement, evidence belongs to engagement, etc.).
  Idempotency model exists (IdempotencyRecord) but not integrated with services/routes.
  Capability enforcement via withAuth middleware on all write endpoints.

2. IMPLEMENTED

Module 01: User & Auth
  Status: PASS
  Exists: User model, Session model, UserRoleAssignment model, auth service, login/logout, role assignment
  Tests: 6 service tests
  API: POST /login, POST /logout, user CRUD endpoints
  Missing: Session revocation verification, 2FA, password reset, token refresh

Module 02: ClientAccount, Lead, Engagement, BusinessCondition
  Status: PASS
  Exists: ClientAccount model, Lead model, Engagement model, BusinessConditionProfile model
  Tests: Service layer tests present
  API: Client CRUD, Lead CRUD, Engagement CRUD with stage transitions
  Missing: Engagement archive/cancel workflows, condition scoring algorithm detail

Module 03: InterventionState
  Status: PASS
  Exists: InterventionState model (one-to-one with Engagement), phase transition logic (assessment→planning→execution→review→handover→closed)
  Tests: 21 service tests including transition validation, phase blocking
  API: GET, PUT /engagements/[id]/intervention-state with capability INTERVENTION_MANAGE
  Validated: Phase transition rules enforced, CLOSED phase blocks writes
  Missing: Trigger for auto-transition, timeout handling, phase history audit detail

Module 04: ShockEvent
  Status: PASS
  Exists: ShockEvent model, severity/eventType enums, linked to Engagement and EvidenceItem
  Tests: 21 service tests
  API: POST/GET /engagements/[id]/shock-events with SHOCK_EVENT_RECORDED/RESOLVED events
  Validated: Cross-engagement validation, audit events, phase gating
  Missing: Shock resolution workflow, escalation logic, notification triggers

Module 05: EvidenceItem
  Status: PASS
  Exists: EvidenceItem model with category/sourceType, optional shockEventId, visibility classification
  Tests: 16 service tests
  API: POST/GET /engagements/[id]/evidence-items with EVIDENCE_VIEW/EVIDENCE_SUBMIT capabilities
  Validated: Engagement ownership, category enums, visibility levels
  Missing: Evidence validation status transitions, batch linking to findings, search

Module 06: Finding + FindingEvidenceLink
  Status: PASS
  Exists: Finding model (severity, status, rationale), FindingEvidenceLink join table with unique constraint
  Tests: 17 service tests
  API: POST/GET /engagements/[id]/findings with FINDING_VIEW/FINDING_CREATE capabilities
  Validated: Evidence linking, cross-engagement validation, audit events
  Missing: Finding status state machine (draft→validated→closed), evidence un-link, batch operations

Module 07: Recommendation
  Status: PASS
  Exists: Recommendation model with priority/status, linked to Finding or ShockEvent
  Tests: 16 service tests
  API: POST/GET /engagements/[id]/recommendations with RECOMMENDATION_* capabilities
  Validated: Cross-engagement validation, phase gating, audit events
  Missing: Recommendation approval workflow, supersession logic, priority re-ranking

Module 08: Action (core + hardening)
  Status: PASS
  Exists: Action model with recommendationId @unique FK, status (open/in_progress/completed), version for optimistic locking
  Tests: 23 service tests including status transitions, phase gating, cross-engagement validation
  API: POST/GET /actions, GET /actions/[id], PUT /actions/[id]/status with version check
  Validated: Status transition rules (open→in_progress|completed, in_progress→open|completed, completed→terminal),
             phase CLOSED blocks writes, recommendationId FK RESTRICT, audit event ACTION_CREATED/STATUS_UPDATED
  Constraint: @unique on recommendationId means only 1 action per recommendation (tested, enforced)

Module 09: Action Ownership
  Status: PASS
  Exists: Action.ownerId FK to User (RESTRICT), Action.assignedAt timestamp
  Tests: Tests in action.test.ts for assignOwner function
  API: POST /actions/[id]/assign with ownerId payload, INTERVENTION_MANAGE required
  Validated: User existence check, cross-engagement validation, phase gating, audit ACTION_ASSIGNED
  Missing: Owner capability/skill validation, owner workload limits, reassignment audit

Module 10: Action Execution (due date + priority)
  Status: PASS
  Exists: Action.dueAt (required DateTime), Action.priority (low/medium/high, default medium)
  Tests: Tests for setDueDate and setPriority functions
  API: POST /actions/[id]/due-date with dueAt ISO datetime, POST /actions/[id]/priority with enum
  Validated: Due date must be future (rejects past), priority enum validation, phase gating, audit ACTION_DUE_SET/PRIORITY_SET
  Missing: Overdue detection and ACTION_OVERDUE event emission, priority re-ranking on condition change

Module 11: KPI
  Status: PASS
  Exists: KPI model with baselineValue, currentValue, targetValue, status (derived: improving/stagnant/worsening/target_met)
  Tests: 13 service tests including status derivation logic
  API: POST/GET /engagements/[id]/kpis, GET /kpis/[id], POST /kpis/[id]/value for value updates
  Validated: Status derived deterministically (target_met if current>=target, improving if current>baseline, etc.),
             phase gating blocks creation/update, engagement ownership, audit KPI_CREATED/UPDATED
  Missing: KPI trending, baseline re-calibration, threshold alerts

Module 12: KPIEvent / Attribution Timeline
  Status: PASS
  Exists: KPIEvent model with kpiId, optional actionId, previousValue, newValue, delta (calculated), createdAt
  Tests: 8 service tests including delta computation, status re-derivation, action linkage
  API: POST /kpis/[id]/record with newValue and optional actionId
  Validated: Delta computed (newValue - previousValue), KPI status re-derived on value change, action existence check,
             cross-engagement validation (action belongs to same engagement as KPI), phase gating, audit KPI_CHANGE_RECORDED
  Missing: Timeline queries (KPI changes over time), impact analysis (which actions moved KPI)

Test Coverage Overall:
  Service layer: 135 total test cases across 11 test files
  API routes: 0 tests (all 22 endpoints untested at API layer)
  Integration: 0 tests
  E2E: 0 tests

Audit Events Implemented:
  81 events defined in audit-events.ts
  ACTION: CREATED, UPDATED, STATUS_UPDATED, ASSIGNED, DUE_SET, PRIORITY_SET, COMPLETED, OVERDUE (8 total, OVERDUE never emitted)
  KPI: CREATED, UPDATED, CHANGE_RECORDED, DEFINED, SNAPSHOT_RECORDED, DETERIORATED (6 total, DETERIORATED never emitted)
  EVIDENCE: SUBMITTED, VALIDATED, REJECTED (defined, coverage unclear)
  FINDING: CREATED, UPDATED, LINKED, EVIDENCE_LINK_BATCH (defined, LINKED never emitted)
  RECOMMENDATION: CREATED, APPROVED, SUPERSEDED (3 defined)
  SHOCK: SHOCK_EVENT_RECORDED, SHOCK_EVENT_RESOLVED (2 defined)
  INTERVENTION: MODE_CHANGED, PHASE_CHANGED (2 defined)
  All mutations emit audit events. Payloads include actor, entity type, entity ID, visibility (internal/client_visible).

Constraints Enforced:
  recommendationId @unique on Action (only 1 action per recommendation)
  findingId + evidenceItemId @unique on FindingEvidenceLink (prevent duplicate links)
  engagementId @unique on InterventionState (one state per engagement)
  version-based optimistic locking on Action updates
  Phase CLOSED blocks: action create, action status update, action assign, action due date, action priority,
                       evidence create, finding create, recommendation create, KPI create, KPI value update
  Cross-engagement validation enforced in all services (recommendation→engagement, action→engagement, etc.)

3. MISSING

Critical Missing: CLAUDE.md Mandatory Adaptive Rule
  Requirement: Every significant change must route into governed re-evaluation of BusinessCondition,
               InterventionMode, InterventionPhase, recommendation/action priority, review cadence, health.
  Current State: re-evaluation service exists (src/services/re-evaluation.ts) but is stub only.
                 Triggers no actual re-evaluation logic. Service comment says "Domain modules will subscribe"
                 but no subscriptions implemented.
  Where NOT called: shock-event.ts (0 calls), evidence-item.ts (0 calls), finding.ts (0 calls),
                    recommendation.ts (0 calls), action.ts (0 calls), kpi.ts (0 calls),
                    kpi-event.ts (0 calls), intervention-state.ts (0 calls).
  Where called: business-condition.ts, engagement-membership.ts, engagement.ts, role-assignment.ts
                (non-intervention modules only).
  Risk: Business logic correctness requirement completely unimplemented for intervention workflow.

UI Layer
  Missing: All intervention workflow pages:
    - /engagements/[id]/shock-events (list, detail, create)
    - /engagements/[id]/evidence (list, detail, create)
    - /engagements/[id]/findings (list, detail, create, link evidence)
    - /engagements/[id]/recommendations (list, detail, create)
    - /engagements/[id]/actions (list, detail, create, assign, set due date, set priority, change status)
    - /engagements/[id]/kpis (list, detail, create, record change)
    - /engagements/[id]/intervention (state detail, phase transition UI)
  Impact: No end-to-end workflow usable from UI. All testing must be API-only.

API Route Tests
  Missing: 0 API route tests exist (0 of 22 intervention endpoints tested at API layer).
  Missing coverage:
    - Request validation (invalid UUIDs, missing required fields, enum validation)
    - Authentication enforcement (withAuth actually called and capability checked)
    - Response format (correct status codes, payload structure)
    - Error handling (NotFoundError, ValidationError returned as HTTP 404/400)
    - Engagement ownership enforcement (cross-engagement access rejected)
    - Phase gating (writes rejected when phase CLOSED)
    - Audit event emission (correct events emitted with correct payloads)
  Tests exist for: Services only (135 tests). No API integration tests.

DELETE Operations
  Missing: No DELETE endpoints for any intervention entities (shock, evidence, finding, recommendation, action, KPI).
  Workaround: None. Cannot delete. Orphan/duplicate/correction scenarios have no resolution path.
  Only DELETE endpoints: /users/[id]/roles, /users/[id]/memberships (non-intervention).
  Risk: Invalid data persists forever. Cannot remove duplicate actions/findings/recommendations.

State Machines
  Missing: No formal state machine for Finding status transitions.
  Defined states: draft, under_review, validated, superseded, closed (in FINDING_STATUSES).
  Missing: No service enforcing valid transitions. Example: can transition from validated directly
           to draft? Unknown (probably invalid but not enforced).
  Missing: No FINDING_VALIDATED/FINDING_SUPERSEDED audit event emission in services.
  Missing: No Finding.status update endpoint or service function.

Batch/Bulk Operations
  Missing: No batch endpoints.
    - No bulk link evidence to finding (must call link endpoint for each evidence)
    - No bulk create findings
    - No bulk assign actions
    - No bulk update KPI values
  Impact: Slow for multi-item workflows.

Audit Event Emission Gaps
  Defined but Never Emitted:
    - ACTION_OVERDUE (defined in audit-events.ts, no code checks overdue or emits)
    - KPI_DETERIORATED (defined, no code checks deterioration or emits)
    - EVIDENCE_SUBMITTED (defined, no POST evidence endpoint emits it; only VALIDATED/REJECTED)
    - FINDING_LINKED (defined in constants but never emitted; FindingEvidenceLink created without event)
    - FINDING_VALIDATED, FINDING_SUPERSEDED (defined but no service function calls them)
    - RECOMMENDATION_REJECTED (defined but no reject endpoint exists)
  Impact: Audit trail incomplete. Cannot reconstruct true sequence of events.

Visibility/Filtering Gaps
  Missing: No read-side visibility filtering for client_visible vs internal audit events.
  Missing: No filtering of intervention state/phase from client UI (if UI existed).
  Missing: No client-visible dashboard of their own KPIs/recommendations/actions.
  Missing: No audit event query endpoints (cannot list audit by entity, date, actor, etc.).

Soft Deletes
  Missing: All deletes are hard (if DELETE existed). No soft delete for governed records.
  Schema: No deleted_at timestamp on entities.
  Impact: Cannot restore deleted shock events, findings, etc. Audit trail of deletion unclear.

Concurrency / Conflict Detection
  Missing: No detection of concurrent assignments (two users assigning action owner simultaneously).
  Missing: No locking for finding while linking evidence (concurrent link/unlink).
  Missing: No conflict resolution for simultaneous KPI value updates.
  Only protection: Version field on Action for optimistic locking. Not on other entities.

Idempotency Integration
  Missing: IdempotencyRecord model exists but never used.
  Missing: No service function checks idempotency key or stores result.
  Missing: API routes do not require idempotency key header.
  Risk: POST /actions, POST /shock-events, etc. not idempotent. Duplicate submissions create duplicates.
