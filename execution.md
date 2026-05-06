# OPSIQ EXECUTION ROADMAP
# Reality-Based Growth + Survival Operating System

## STRICT EXECUTION MODE

Rules:
- Read repo before changes
- Reuse existing implementation
- Upgrade existing implementation if partial
- Do not duplicate concepts/files/models/services
- Build backbone-first
- Deterministic + fail-closed only
- No generic advice systems
- No public/owner leakage
- Run tests after every phase
- Never proceed with failing state

Maintain:
.claude/execution_state.json

Schema:
{
  "current_phase": "",
  "completed_phases": [],
  "completed_steps": [],
  "failed_steps": [],
  "existing_reused": [],
  "existing_upgraded": [],
  "new_files_created": [],
  "duplicates_avoided": [],
  "invariants_verified": [],
  "last_green_command": "",
  "next_step": ""
}

Update after every step.

---

# SYSTEM NORTH STAR

OPSIQ optimizes for:

MINIMUM OPERATOR ENTROPY

The user must leave with:
- fewer decisions
- clearer priorities
- safer execution
- measurable next steps
- lower ambiguity

Reject any feature that does not improve:
- survival
- revenue
- margin
- cashflow
- execution reliability
- decision quality
- scalability
- operator clarity

---

# GLOBAL RECOMMENDATION RULES

Every recommendation MUST include:
- action
- reason
- evidence_refs
- constraints_considered
- expected_impact
- cost
- time_required
- difficulty
- risk
- rollback_cost
- rollback_time
- reversibility
- confidence_state
- confidence_reason
- first_step
- stop_condition
- review_date

Required confidence states:
- HIGH_CONFIDENCE
- MEDIUM_CONFIDENCE
- LOW_CONFIDENCE
- NEED_MORE_DATA
- CANNOT_DETERMINE
- DANGER_DO_NOT_ACT

Fail recommendation generation if:
- evidence insufficient
- contradictions unresolved
- rollback missing for high-risk action
- recommendation generic
- constraints ignored

---

# MASTER LAYERS

## Layer 0 — Reality Integrity Layer
- Evidence Reliability Engine
- Evidence Sufficiency Engine
- Contradiction Engine
- Data Quality Scoring
- Confidence Gating
- Benchmark Calibration
- Fail-Closed Logic

## Layer 1 — Reality Backbone
- Business Profile
- Hybrid Business Model
- Business Maturity State
- Owner Constraint Profile
- Financial Constraint Profile
- Customer Profile
- Local Market Profile
- Capacity Profile
- Compliance Flags
- Constraint Registry

## Layer 2 — Event + Temporal Memory Fabric
- Canonical Event Store
- Event Replay
- Snapshot Engine
- Projection Engine
- KPI History
- Intervention History
- Decision History
- Outcome History

## Layer 3 — Survival Intelligence
- Cash Runway Engine
- Burn Pressure Engine
- Debt Pressure Engine
- Margin Risk Engine
- Revenue Concentration Engine
- Survival Priority Engine
- Financial Health Gate

## Layer 4 — Growth Operating Engines
- Revenue Growth Engine
- Customer Acquisition Engine
- Sales Pipeline Engine
- Offer Strength Engine
- Pricing Engine
- Unit Economics Engine
- Retention Engine
- Customer Segment Profitability Engine

## Layer 5 — Execution Reality Layer
- Financial Feasibility Engine
- Time Constraint Engine
- Staff Constraint Engine
- Skill Constraint Engine
- Local Feasibility Engine
- Dependency Graph
- Execution Friction Engine
- Rollback Accounting Engine

## Layer 6 — Experimentation + Validation
- Reversible Experiment Engine
- Proof-of-Impact Engine
- Attribution Confidence
- Success Thresholds
- Failure Thresholds
- Rollback Planning

## Layer 7 — Decision + Priority System
- Financial Normalization
- Business Impact Engine
- Decision Confidence Engine
- Priority Engine
- Decision Compression Engine
- Escalation Engine
- Dangerous Action Detection

## Layer 8 — Guided Operating System
- Daily Action Queue
- Weekly Operating Plan
- Review System
- Follow-Up System
- KPI Review
- Execution Tracking

## Layer 9 — Adaptive Learning
- Expected vs Actual
- Failed Action Memory
- Local Pattern Learning
- Recommendation Adjustment
- Constraint Drift Detection
- Strategic Debt Detection

---

# GUARDRAILS

## Avoid over-complexity
Every engine must answer:
“What operator decision becomes simpler?”

Never show:
- >1 primary action
- >3 supporting actions
- >1 warning

## Avoid fake localization
Every local assumption requires:
- source
- confidence
- timestamp
- validation_status
- expiry

## Avoid causal graph explosion
Allowed domains only:
- revenue
- cashflow
- margin
- conversion
- churn
- lead flow
- delivery
- capacity
- customer complaints

Max causal depth: 5.

## Avoid pseudo-strategic AI
No strategic recommendation without:
- evidence
- financial basis
- execution feasibility
- rollback analysis
- confidence state

System must support:
“Do not expand yet.”

## Avoid operator trust erosion
Forbidden:
- morale scoring
- personality scoring
- emotional assumptions

Allowed:
- execution latency
- missed deadlines
- response delay
- blocker frequency

## Avoid computational explosion

HOT:
current operational state

WARM:
recent projections

COLD:
immutable historical events

Tier 0 synchronous:
- auth
- permission
- workspace isolation
- entitlement
- quota
- contradiction fail-closed

Tier 1 near-real-time:
- priorities
- KPI drift
- confidence updates

Tier 2 background:
- causal recalculation
- strategic analysis
- pattern mining

---

# PHASE ORDER

## PHASE 0 — System Truth Contract
Create enforceable system laws.
Add tests for:
- generic advice rejection
- missing confidence rejection
- missing evidence rejection
- rollback enforcement

## PHASE 1 — Reality Integrity Layer
Implement:
- evidence reliability
- contradiction fail-closed
- confidence gating
- data quality score

## PHASE 2 — Reality Backbone
Implement:
- hybrid business models
- maturity states
- constraint profiles
- customer profiles
- local market profiles

## PHASE 3 — Event + Temporal Fabric
Implement:
- append-only canonical event store
- replay
- snapshots
- projections

## PHASE 4 — Survival Intelligence
Implement:
- runway
- burn
- debt pressure
- concentration risk
- financial health gate

Block growth if survival thresholds fail.

## PHASE 5 — Growth Operating Engines
Implement:
- revenue growth
- customer acquisition
- sales pipeline
- pricing
- offer strength
- retention
- unit economics

## PHASE 6 — Execution Reality
Implement:
- feasibility
- dependency graph
- execution friction
- rollback accounting

## PHASE 7 — Experimentation + Validation
Implement:
- reversible experiments
- proof-of-impact
- attribution confidence
- rollback plans

## PHASE 8 — Decision + Priority System
Implement:
- business impact
- financial normalization
- priority engine
- decision compression
- escalation rules

## PHASE 9 — Guided Operating System
Implement:
- daily action queue
- weekly operating plan
- review loops
- follow-up tracking

## PHASE 10 — Adaptive Learning
Implement:
- recommendation adjustment
- failed-action memory
- constraint drift
- strategic debt

## PHASE 11 — Owner Mode Full OS
Implement:
- portfolio intelligence
- advanced reports
- strategic planning
- owner admin systems

## PHASE 12 — Public SMB Shell
Implement:
- Problem → Best Action → Track Result
- onboarding
- simplified UI
- DTO isolation

## PHASE 13 — Enterprise Hardening
Implement:
- CI gates
- monitoring
- backups
- security
- DTO leakage tests
- tenant isolation tests

---

# REQUIRED CI GATES

Every phase must pass:
- build
- typecheck
- lint
- tests
- prisma validate
- migration replay
- tenant isolation tests
- permission matrix tests
- DTO leakage tests
- audit event tests

---

# STRICT FAIL CONDITIONS

Fail implementation if:
- duplicate engines created
- unscoped workspace query exists
- public DTO leaks owner/internal fields
- recommendation generic
- contradiction allows false high confidence
- growth allowed during survival critical state
- high-risk action lacks rollback fields
- AI mutates final state directly
- learning updates from unverified outcomes

---

# REQUIRED END-OF-PHASE REPORT

Only report:
1. Phase completed
2. Files reused
3. Files upgraded
4. Files created
5. Duplicates avoided
6. Tests added/updated
7. Commands run
8. Result
9. Remaining blockers
10. Next phase
