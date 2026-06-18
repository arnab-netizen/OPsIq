OpsIQ Final Hostile-Audited Owner Mode Reality Loop Contract

## CONTROLLING PURPOSE

This file is the strict execution contract for building OpsIQ into a **dynamic long-term business partner** for Owner Mode.

The purpose is not to create a nicer report generator.

The purpose is to make OpsIQ capable of this loop:

```text
input quality
→ diagnosis
→ recommendation
→ owner decision
→ action
→ execution evidence
→ evidence verification
→ expected benefit/outcome
→ outcome measurement
→ harm tracking
→ failure adjudication
→ causal attribution
→ reassessment
→ corrective action
→ learning eligibility
→ decision memory
→ business timeline
→ dashboard proof
→ repeat
```

OpsIQ must move from:

```text
Input
→ Diagnosis
→ Recommendation
→ End
```

to:

```text
Input
→ Diagnosis
→ Recommendation
→ Owner Decision
→ Action
→ Evidence
→ Verification
→ Outcome
→ Reassessment
→ Corrected Recommendation
→ Verified Learning Eligibility
→ Future Better Recommendation
```

If the above loop is not implemented and proven, OpsIQ is still a one-shot advisor, not a long-term business partner.

---

# SINGLE LOOP COMMAND

The user may instruct Claude with:

```text
/continue-owner-mode-reality-loop
```

This command means exactly:

```text
1. Read this execution.md completely.
2. Do not ask questions.
3. Inspect current repo state.
4. Run a hostile audit of current implementation against this file.
5. Confirm exact current status and next incomplete slice.
6. Run pre-slice breakage checks.
7. If anything is already broken, document whether it is pre-existing.
8. If the next slice can be safely implemented, implement only the next incomplete slice.
9. Do not skip dependency order.
10. Do not implement public SaaS, billing, Product Hunt, external intelligence, ML, cohort priors, forecasting, or Decision Intelligence UI.
11. Run post-slice tests/proofs.
12. If anything broke, stop and fix it before continuing.
13. If DB-backed, obtain LANE_B real PostgreSQL proof before COMPLETE_VERIFIED.
14. Write/update closeout report.
15. Commit only the slice changes if committing is available.
16. Stop after the slice unless explicitly instructed to continue.
```

One loop command must perform:

```text
hostile audit
→ status confirmation
→ baseline proof
→ next-slice implementation
→ regression check
→ fix if broken
→ closeout
```

No silent continuation. No broad implementation. No false completion.

---

# ABSOLUTE NON-NEGOTIABLE RULES

## Rule 1 — Owner Mode only

This work is for Owner Mode only.

Do not modify or build:

```text
public SaaS flows
Product Hunt launch flows
billing
Lemon Squeezy
Stripe
public onboarding
external lead intelligence
CRM/accounting integrations
browser automation
ML forecasting
cohort priors
Decision Intelligence UI
public marketing pages
```

unless a later instruction explicitly changes scope.

## Rule 2 — Deterministic reality loop before advanced intelligence

Do not build:

```text
advanced simulation
ML learning
cross-business learning
privacy-safe aggregation
external market intelligence
forecasting
cohort priors
agentic automation
```

until the deterministic Owner Mode reality loop is COMPLETE_VERIFIED.

The deterministic loop is:

```text
input quality
→ diagnosis evidence
→ recommendation
→ owner decision
→ action
→ evidence
→ evidence verification
→ validation criteria
→ outcome
→ harm tracking
→ adjudication
→ causal attribution
→ reassessment
→ learning eligibility
→ dashboard proof
```

## Rule 3 — No raw feedback learning

Wrong:

```text
User says recommendation failed
→ store learning that recommendation was wrong
```

Correct:

```text
User reports result
→ execution checked
→ evidence verified
→ outcome measured
→ harm tracked
→ failure adjudicated
→ causal attribution classified
→ reassessment created
→ learning eligibility admitted/rejected
```

## Rule 4 — No public learning hints

Public users must not see or infer hidden learning machinery.

Prohibited:

```text
public UI mentioning hidden learning
public routes exposing learning internals
marketing copy saying user data improves hidden system
public dashboard showing controlled learning internals
cross-tenant learning without explicit future consent architecture
```

## Rule 5 — Fail closed

If evidence is weak, data is missing, execution deviated, measurement is invalid, or causation is unclear, OpsIQ must classify the output as limited.

Allowed limited statuses include:

```text
data_limited
critical_missing
insufficient_evidence
invalid_test
too_early_to_judge
correlation_only
confounded
external_event_dominant
learning_rejected
human_review_required
```

Do not output high-confidence advice from weak data.

## Rule 6 — No false COMPLETE

A slice may end only with one of these statuses:

```text
COMPLETE_VERIFIED
IMPLEMENTED_STATIC_ONLY
IMPLEMENTED_DB_UNVERIFIED
BLOCKED_BY_PRE_EXISTING_FAILURE
FAILED_NEEDS_FIX
```

Definitions:

```text
COMPLETE_VERIFIED:
  All required build/test/type/db/runtime/tenant checks passed.
  If DB-backed, LANE_B real PostgreSQL proof passed.

IMPLEMENTED_STATIC_ONLY:
  Code exists and static/build tests pass.
  Runtime/DB proof is not applicable or not run.

IMPLEMENTED_DB_UNVERIFIED:
  DB code/migration exists, but real PostgreSQL/LANE_B proof has not passed.

BLOCKED_BY_PRE_EXISTING_FAILURE:
  Baseline was already failing before the slice.
  Exact pre-existing failure is documented.

FAILED_NEEDS_FIX:
  Slice introduced or exposed a failure.
  Must be fixed before proceeding.
```

If DB is touched and LANE_B did not pass, status cannot be COMPLETE_VERIFIED.

## Rule 7 — LANE_B DB proof is mandatory for DB-backed work

A slice is DB-backed if it touches:

```text
database schema
Prisma models
migrations
repository methods
persistence
tenant isolation
owner history
recommendations
actions
evidence
outcomes
adjudications
learning eligibility
decision memory
business timeline
dashboard persisted queries
audit logs
```

DB-backed slices require:

```text
real PostgreSQL-backed tests through LANE_B GitHub PostgreSQL service or equivalent CI PostgreSQL service
migration applies cleanly
migration non-destructive risk assessed
tenant isolation tested against real persisted records
```

SQLite, mocks, TypeScript build, and `prisma validate` are not enough.

## Rule 8 — Before every slice, prove nothing is already broken

Run discovered equivalents of:

```bash
git status --short
git branch --show-current
git log -1 --oneline
npm run build
npm test
npx prisma validate
```

If the repo uses `pnpm`, `yarn`, or different scripts, use the discovered equivalents.

If a command fails because environment variables are unavailable, document:

```text
command attempted
exact error
whether failure existed before slice
safer substitute command
impact on completion status
```

## Rule 9 — After every slice, prove nothing was broken

Run all relevant checks:

```bash
npm run build
npm test
npm run lint
npm run typecheck
npm run test:db
npm run test:integration
npx prisma validate
```

Use available equivalents.

If the slice touched DB, run LANE_B/equivalent real PostgreSQL proof.

## Rule 10 — If anything breaks, fix before continuing

Claude must not proceed if:

```text
build fails
tests fail
typecheck fails
lint fails
Prisma validation fails
migration fails
DB tests fail
tenant isolation fails
owner/public separation fails
dashboard proof fails
learning gate is bypassable
evidence verification is bypassable
existing proven Owner Mode behavior regresses
```

The immediate next step must be fixing the breakage.

## Rule 11 — No rebuilding proven work

Before adding any new model, route, service, component, or test, search for existing equivalents.

Required search concepts:

```text
owner recommendation
owner action
owner decision
input quality
evidence
verification
validation criteria
outcome
harm
adjudication
causal attribution
reassessment
learning eligibility
decision memory
business timeline
dashboard proof
AI use case
risk register
autonomy
incident
observability
benefits realization
model version
prompt version
ruleset version
```

Extend existing safe code instead of duplicating.

## Rule 12 — No destructive overwrites

Never overwrite historical business records.

Preserve audit trail for:

```text
input
diagnosis
recommendation
verification
owner decision
action
evidence
outcome
harm
adjudication
causal attribution
reassessment
corrective action
learning eligibility
dashboard proof
incident
model/ruleset version
```

Supersede records with status changes. Do not erase original reasoning.

## Rule 13 — Human review for sensitive decisions

Human/owner review is required when:

```text
harm severity is medium/high/severe
legal/compliance/safety risk exists
recommendation is high-impact
recommendation changes price/staff/debt/legal/customer policy
learning affects future recommendation priority
evidence is contradictory
case creates do-not-repeat rule
cross-business aggregation is proposed
```

## Rule 14 — Autonomy is restricted

OpsIQ may:

```text
observe
diagnose
recommend
draft action
assign internal action for tracking
request owner approval
track execution
measure outcome
reassess
```

OpsIQ must not:

```text
execute business actions autonomously
send customer messages autonomously
spend money
change pricing
hire/fire staff
commit legal/compliance actions
modify external systems
publish public content
train on private data
share business data across tenants
```

without explicit future scope and controls.

---

# FINAL IMPLEMENTATION ORDER

Implement in this exact order unless repo inspection proves a slice is already COMPLETE_VERIFIED.

```text
0. Repository inspection and baseline proof
1. Roadmap/scope lockdown
2. AI use-case inventory and risk register
3. Autonomy/access-level classification
4. Security threat model for input, memory, evidence, and tools
5. Input quality gate + data provenance
6. Diagnosis evidence contract
7. Structured recommendation tracking
8. Recommendation verification + anti-overreliance gate
9. Owner decision capture + decision-rights model
10. Benefits realization register
11. Action and execution tracking
12. Evidence capture
13. Evidence verification
14. Expected outcome and validation criteria
15. Outcome tracking
16. Harm tracking
17. Failure adjudication
18. Causal attribution classification
19. Reassessment and corrective action
20. Learning eligibility gate with human review statuses
21. Decision memory
22. Business state timeline
23. AI observability trace layer
24. Incident response and circuit breakers
25. Model/prompt/ruleset versioning and change control
26. Owner dashboard proof
27. Full-loop validation suite
28. Owner pilot checklist
```

Later only, after phases 0–28 are COMPLETE_VERIFIED:

```text
29. Controlled learning/reliability candidate store
30. Privacy, consent, retention, minimization controls
31. Human review workflow for broader reliability
32. Regression gate suite for reliability changes
33. Staged rollout and rollback framework
34. Privacy-safe aggregation design, only if explicitly approved
35. Reliability monitoring and rollback drills
```

Do not jump to Phase 29 before Phases 0–28 are COMPLETE_VERIFIED.

---

# PHASE 0 — REPOSITORY INSPECTION AND BASELINE PROOF

## Objective

Know exactly what exists before changing anything.

## Required commands

Run discovered equivalents of:

```bash
git status --short
git branch --show-current
git log -1 --oneline
ls
find . -maxdepth 4 -type f \( -name "package.json" -o -name "pnpm-lock.yaml" -o -name "yarn.lock" -o -name "package-lock.json" -o -name "schema.prisma" -o -name "CURRENT_WORKFLOW_STATE.md" -o -name "OWNER_MODE_STATUS_REPORT.md" -o -name "execution.md" \) | sort
npm run build
npm test
npx prisma validate
```

## Required repo search

Search for:

```text
Owner Mode
owner recommendation
owner action
owner decision
input quality
evidence verification
outcome
adjudication
reassessment
learning
decision memory
business timeline
dashboard
risk register
autonomy
incident response
observability
benefits realization
```

## Required output file

Create/update:

```text
OWNER_MODE_REALITY_BASELINE_REPORT.md
```

Must include:

```text
branch
latest commit
working tree status
package manager
test commands
build commands
database tooling
existing Owner Mode models
existing Owner Mode routes
existing Owner Mode services
existing Owner Mode UI
existing tests
baseline build result
baseline test result
baseline DB/prisma result
known pre-existing failures
confirmed gaps
selected next slice
```

## Acceptance gate

No code implementation may begin before the baseline report exists.

---

# PHASE 1 — ROADMAP/SCOPE LOCKDOWN

## Objective

Prevent drift into premature public/SaaS/shiny work.

## Required update

Create/update current workflow/status file, preferably:

```text
CURRENT_WORKFLOW_STATE.md
```

Required statement:

```text
Owner Mode is not complete until the deterministic reality loop is COMPLETE_VERIFIED:
input quality → diagnosis → recommendation → owner decision → action → evidence → verification → outcome → harm/adjudication/causality → reassessment → learning eligibility → dashboard proof.
```

Required freeze:

```text
Public SaaS, Product Hunt, billing, external intelligence, ML, forecasting, cohort priors, Decision Intelligence UI, and integrations remain frozen until deterministic Owner Mode phases 0–28 are COMPLETE_VERIFIED.
```

## Acceptance gate

Roadmap clearly prevents scope drift.

---

# PHASE 2 — AI USE-CASE INVENTORY AND RISK REGISTER

## Objective

Govern OpsIQ as an AI decision-support system, not just app features.

## Required structures

Create/extend:

```text
owner_ai_use_case_inventory
owner_ai_risk_register
```

If DB-backed implementation is too early, create a typed internal config plus tests first, but DB-backed eventual state remains required.

## Required fields

```text
id
use_case_name
business_purpose
owner_facing_or_internal
autonomy_level
risk_level
data_used
reads_data
writes_data
human_approval_required
failure_modes
controls_required
monitoring_required
rollback_path
last_reviewed_at
status
created_at
updated_at
```

## Required use cases to register

```text
input quality assessment
diagnosis
recommendation generation
recommendation verification
owner decision capture
action tracking
evidence verification
outcome tracking
failure adjudication
causal attribution
reassessment
learning eligibility
decision memory
business timeline
dashboard summarization
```

## Required tests

```text
all required use cases exist
each use case has autonomy level
each use case has risk level
high-risk use cases require human approval flag
rollback path exists for non-read-only use cases
```

---

# PHASE 3 — AUTONOMY/ACCESS-LEVEL CLASSIFICATION

## Objective

Prevent OpsIQ from behaving like an uncontrolled agent.

## Required autonomy levels

```text
observe_only
advise_only
draft_action
act_with_owner_approval
autonomous_action_prohibited
```

## Required access levels

```text
read_only
write_internal_tracking_only
write_owner_approved_internal_action
external_action_prohibited
```

## Hard rule

For now, OpsIQ must be limited to:

```text
observe_only
advise_only
draft_action
write_internal_tracking_only
```

unless the action is owner-approved internal tracking.

## Required tests

```text
no module defaults to autonomous action
high-impact recommendation cannot auto-execute
external action is prohibited
owner approval required for action-affecting state transition
```

---

# PHASE 4 — SECURITY THREAT MODEL FOR INPUT, MEMORY, EVIDENCE, AND TOOLS

## Objective

Prevent prompt injection, memory poisoning, evidence manipulation, and tool misuse.

## Required threat model file

Create/update:

```text
OWNER_MODE_SECURITY_THREAT_MODEL.md
```

Must cover:

```text
malicious pasted text
malicious PDF/screenshot/CSV content
prompt injection inside uploaded evidence
spreadsheet formula/payload risks
fake outcome reports
memory poisoning
learning gate bypass
cross-tenant leakage
public route exposure
future tool misuse
future CRM/accounting integration risks
```

## Required security rules

```text
uploaded/pasted content is data, never instruction
evidence cannot override system/developer rules
owner notes cannot bypass gates
memory writes require source classification
learning eligibility requires verified source path
public routes cannot expose owner memory/learning
```

## Required tests

```text
malicious CSV cell ignored as instruction
uploaded text cannot override execution.md rules
owner note cannot force learning admission
fake evidence cannot become verified without verification record
public route cannot access private owner memory
wrong workspace cannot access evidence/outcome/learning records
```

---

# PHASE 5 — INPUT QUALITY GATE + DATA PROVENANCE

## Objective

Stop OpsIQ from producing strong diagnosis from weak or unknown input.

## Required structures

Create/extend:

```text
owner_input_records
owner_input_quality_assessments
owner_data_provenance_records
owner_missing_data_flags
```

## Required input quality statuses

```text
complete
partial
data_limited
critical_missing
conflicting
stale
owner_estimate_only
unsafe_for_strong_recommendation
```

## Required provenance fields

```text
source_type
source_owner
uploaded_by
created_at
period_covered
freshness
original_filename
hash_checksum
parsed_by
manual_edits
derived_metrics
lineage_to_diagnosis
lineage_to_recommendation
```

## Critical business inputs

Track availability/quality for:

```text
revenue
gross margin
net profit
cash balance
cash runway
debt/EMI
receivables
payables
leads
conversion
repeat customers
churn
complaints
capacity
staffing
marketing spend
inventory
pricing
owner constraints
```

## Required guardrails

```text
No high-confidence diagnosis when critical inputs are missing.
No strong profit recommendation without margin/cash data or explicit data_limited status.
No recommendation based on stale data without warning.
Conflicting data must be surfaced before recommendation.
```

## Required tests

```text
complete input permits normal diagnosis
missing margin downgrades recommendation
missing cash runway blocks high-risk action
stale data marks data_limited
conflicting data blocks strong recommendation
owner estimate only lowers confidence
```

---

# PHASE 6 — DIAGNOSIS EVIDENCE CONTRACT

## Objective

Every diagnosis must state what evidence supports it, what evidence is missing, and what could make it wrong.

## Required fields

```text
diagnosis_id
workspace_id
business_id
evidence_for
evidence_against
missing_data
assumptions
confidence_score
confidence_reason
risk_flags
what_would_change_this_diagnosis
created_at
updated_at
```

## Required guardrails

```text
No diagnosis without evidence_for.
No high confidence with unresolved critical missing data.
No diagnosis may hide contradictory evidence.
No diagnosis may proceed to recommendation without confidence_reason.
```

## Required tests

```text
diagnosis stores evidence
diagnosis stores assumptions
contradictory evidence is visible
missing data lowers confidence
no evidence blocks strong diagnosis
```

---

# PHASE 7 — STRUCTURED RECOMMENDATION TRACKING

## Objective

Recommendations must become accountable records, not loose text.

## Required structures

Create/extend:

```text
owner_recommendations
owner_recommendation_evidence
owner_recommendation_assumptions
owner_recommendation_constraints
```

## Required fields

```text
id
workspace_id
business_id
owner_user_id
diagnosis_id
recommendation_text
recommendation_type
priority_rank
expected_outcome_summary
target_metric_name
baseline_value
target_value
target_direction
measurement_window_days
deadline_at
confidence_score
confidence_reason
risk_level
status
created_at
updated_at
```

## Required statuses

```text
draft
recommended
verification_required
verified_enough
provisional
data_limited
owner_decision_pending
accepted
rejected
modified
deferred
converted_to_action
in_progress
outcome_pending
outcome_reported
reassessment_required
superseded
validated_success
validated_failure
learning_review_pending
closed
```

## Required tests

```text
create recommendation
link recommendation to diagnosis
recommendation stores evidence/assumptions/constraints
recommendation status transition works
wrong workspace forbidden
public access forbidden
```

---

# PHASE 8 — RECOMMENDATION VERIFICATION + ANTI-OVERRELIANCE GATE

## Objective

OpsIQ must challenge its own recommendation before the owner accepts it.

## Required structures

Create/extend:

```text
owner_recommendation_verifications
owner_assumption_checks
owner_evidence_checks
owner_contradiction_checks
owner_overreliance_acknowledgements
```

## Required verification questions

Every important recommendation must answer:

```text
What evidence supports this?
What evidence contradicts this?
What data is missing?
What assumptions are being made?
What would make this wrong?
What would a rival consultant argue?
Has this action failed before?
Does this violate owner constraints?
Does this fit cash runway?
Is there a safer test?
What is the downside if wrong?
What is the stop-loss?
```

## Required verification statuses

```text
verified_enough
provisional
data_limited
high_risk_requires_owner_approval
unsafe_to_recommend
reassessment_required
```

## Anti-overreliance rule

For medium/high-impact recommendations, owner must acknowledge:

```text
key assumption
main downside risk
stop condition
evidence limitation
owner remains decision-maker
```

before accepting.

## Required tests

```text
missing data downgrades recommendation
constraint violation blocks recommendation
past failed action requires explanation
cash-risk action requires owner acknowledgement
medium/high risk requires anti-overreliance acknowledgement
unsafe recommendation cannot be accepted
```

---

# PHASE 9 — OWNER DECISION CAPTURE + DECISION-RIGHTS MODEL

## Objective

Recommendations do not become actions until owner decision is captured.

## Required structures

Create/extend:

```text
owner_decisions
owner_decision_rights
```

## Required owner decision statuses

```text
accepted
rejected
modified
deferred
needs_more_data
needs_human_review
```

## Required decision-rights fields

```text
decision_owner
execution_owner
review_owner
benefit_owner
risk_owner
approval_required_by
approved_by
approved_at
decision_reason
created_at
updated_at
```

## Required guardrails

```text
No action without accepted or modified owner decision.
Rejected recommendation cannot become action.
Deferred recommendation cannot become action.
High-risk recommendation requires approval fields.
Owner remains accountable decision-maker.
```

## Required tests

```text
accept recommendation
reject recommendation
modify recommendation
defer recommendation
needs more data
high-risk requires approval
rejected cannot convert to action
```

---

# PHASE 10 — BENEFITS REALIZATION REGISTER

## Objective

Track business benefit, not only task completion.

## Required structures

Create/extend:

```text
owner_benefits
owner_benefit_reviews
```

## Required fields

```text
benefit_id
workspace_id
business_id
recommendation_id
action_id
expected_business_benefit
benefit_type
baseline
target
benefit_owner
realization_date
review_cadence
actual_benefit
benefit_status
reason_not_realized
created_at
updated_at
```

## Benefit types

```text
revenue
profit
cash
margin
retention
conversion
productivity
risk_reduction
cost_reduction
quality_improvement
```

## Required tests

```text
benefit created from recommendation
benefit linked to owner/action
benefit has baseline and target
benefit review updates actual value
unrealized benefit requires reason
```

---

# PHASE 11 — ACTION AND EXECUTION TRACKING

## Objective

Know whether the owner/team actually executed the accepted action.

## Required structures

Create/extend:

```text
owner_actions
owner_action_execution_logs
owner_action_execution_evidence
owner_execution_deviations
owner_blockers
```

## Required action fields

```text
id
workspace_id
business_id
recommendation_id
owner_decision_id
assigned_to_role
assigned_to_user_id
action_title
action_steps
due_at
status
created_at
updated_at
```

## Required execution fields

```text
id
workspace_id
business_id
action_id
executed_by_role
executed_by_user_id
started_at
completed_at
actual_steps_taken
planned_steps_completed_count
planned_steps_total_count
sample_size_actual
deadline_met
proof_text
proof_attachment_url
deviation_summary
deviation_severity
blocker_reason
execution_compliance_score
created_at
updated_at
```

## Execution compliance values

```text
not_executed
materially_deviated
partially_executed
mostly_executed
fully_executed
over_executed
```

## Required guardrails

```text
Not-executed action cannot be judged as failed recommendation.
Material deviation blocks high-confidence learning.
Late execution must be visible to adjudication.
Small sample size must downgrade outcome confidence.
```

## Required tests

```text
fully executed
partially executed
materially deviated
not executed
blocked
late
sample below minimum
wrong workspace forbidden
```

---

# PHASE 12 — EVIDENCE CAPTURE

## Objective

Capture evidence as raw submitted material without pretending it is verified.

## Required structures

Create/extend:

```text
owner_evidence_records
```

## Required fields

```text
id
workspace_id
business_id
related_entity_type
related_entity_id
submitted_by
source_type
evidence_text
attachment_url
original_filename
hash_checksum
period_covered
submitted_at
status
created_at
updated_at
```

## Evidence statuses

```text
submitted
pending_verification
verified
rejected
conflicting
stale
insufficient
```

## Required tests

```text
submit text evidence
submit attachment evidence metadata
evidence starts unverified
wrong workspace forbidden
public access forbidden
```

---

# PHASE 13 — EVIDENCE VERIFICATION

## Objective

Uploaded/submitted evidence is not true until verified.

## Required structures

Create/extend:

```text
owner_evidence_verifications
```

## Required fields

```text
id
workspace_id
business_id
evidence_id
verification_status
verification_method
verifier_type
verified_at
verification_reason
source_type
confidence_level
conflict_notes
created_at
updated_at
```

## Verifier types

```text
owner
system
admin
external_record
test_fixture
```

## Verification statuses

```text
verified
rejected
insufficient
conflicting
stale
needs_more_evidence
```

## Required guardrails

```text
No evidence is verified without verification record.
Owner statement alone is owner_opinion unless supported by source.
Verified evidence must keep provenance.
Conflicting evidence blocks high confidence.
```

## Required tests

```text
verify evidence
reject evidence
mark conflicting
mark stale
owner opinion not treated as verified record
learning cannot use unverified evidence
```

---

# PHASE 14 — EXPECTED OUTCOME AND VALIDATION CRITERIA

## Objective

Define how success/failure will be judged before outcome is reported.

## Required structures

Create/extend:

```text
owner_validation_criteria
owner_action_success_thresholds
owner_action_failure_thresholds
owner_stop_loss_rules
owner_escalation_rules
```

## Required fields

```text
id
workspace_id
business_id
recommendation_id
action_id
metric_name
baseline_value
target_value
minimum_sample_size
measurement_start_at
measurement_end_at
success_condition
partial_success_condition
failure_condition
stop_condition
escalation_condition
review_at
created_at
updated_at
```

## Required guardrails

```text
No accepted recommendation without validation criteria unless explicitly provisional/data_limited.
No high-risk action without stop-loss.
No outcome validation without criteria.
```

## Required tests

```text
create validation criteria
block accepted strong recommendation without criteria
high-risk requires stop-loss
criteria linked to action/recommendation
```

---

# PHASE 15 — OUTCOME TRACKING

## Objective

Record what happened after action.

## Required structures

Create/extend:

```text
owner_action_outcomes
owner_outcome_metrics
owner_outcome_evidence
owner_external_events
```

## Required fields

```text
id
workspace_id
business_id
recommendation_id
action_id
outcome_status
owner_reported_result
actual_metric_name
before_value
after_value
absolute_change
percentage_change
measurement_period_start
measurement_period_end
evidence_quality
external_event_flag
external_event_description
created_at
updated_at
```

## Outcome statuses

```text
worked
partially_worked
did_not_work
made_worse
not_measurable
too_early_to_judge
invalid_test
executed_differently
external_event_interference
```

## Required tests

```text
worked outcome
partial outcome
failed outcome
made worse outcome
too early
invalid test
external event
missing metric
wrong workspace forbidden
```

---

# PHASE 16 — HARM TRACKING

## Objective

Track adverse impact from recommendations/actions.

## Required structures

Create/extend:

```text
owner_harm_events
```

## Harm categories

```text
none
cash_loss
margin_damage
customer_loss
churn_increase
revenue_loss
compliance_risk
legal_risk
reputation_damage
operational_disruption
staff_overload
service_quality_damage
opportunity_cost
unknown_harm
```

## Required fields

```text
id
workspace_id
business_id
recommendation_id
action_id
outcome_id
harm_category
harm_severity
harm_amount_estimate
harm_metric
harm_description
reversibility
requires_human_review
created_at
updated_at
```

## Harm severity

```text
none
low
medium
high
severe
```

## Required guardrails

```text
Medium/high/severe harm requires human review.
High/severe harm blocks automatic learning admission.
Legal/compliance harm triggers incident review.
```

## Required tests

```text
record no harm
record cash loss
record churn increase
medium harm requires review
severe harm blocks learning
legal risk triggers incident path
```

---

# PHASE 17 — FAILURE ADJUDICATION

## Objective

Classify why outcome succeeded, failed, or cannot be judged.

## Required structures

Create/extend:

```text
owner_failure_adjudications
owner_failure_reasons
owner_adjudication_evidence
```

## Failure classes

```text
wrong_diagnosis
wrong_priority
wrong_action
wrong_timing
wrong_segment
wrong_assumption
constraint_ignored
bad_execution
partial_execution
not_executed
missing_data
bad_measurement
too_early_to_judge
external_event
insufficient_evidence
owner_preference_conflict
safety_or_compliance_risk
valid_recommendation_but_unproven
```

## Deterministic rules

```text
if action not_executed → invalid_test / not_executed
if execution materially_deviated → bad_execution
if no verified evidence → insufficient_evidence
if measurement period incomplete → too_early_to_judge
if external event flag true → external_event
if owner constraint violated → constraint_ignored
if execution valid + metric worsened → reassessment_required
if execution valid + success threshold passed → validated_success
```

## Required guardrails

```text
No learning before adjudication.
No reassessment without adjudication.
No validated failure if execution invalid.
No validated success if evidence insufficient.
```

## Required tests

```text
good recommendation badly executed
bad recommendation properly executed
missing metric
too early
external event
constraint ignored
made worse
not executed but reported failed
```

---

# PHASE 18 — CAUSAL ATTRIBUTION CLASSIFICATION

## Objective

Prevent false learning from mere correlation.

## Required structures

Create/extend:

```text
owner_causal_attribution_reviews
```

## Attribution classes

```text
not_assessed
correlation_only
plausible_contributor
likely_caused
confounded
external_event_dominant
insufficient_evidence
```

## Required guardrails

```text
Learning cannot claim action effectiveness if attribution is correlation_only.
High-confidence learning requires likely_caused or multiple verified supporting cases later.
External_event_dominant blocks action-effectiveness learning.
Confounded requires human review before any learning admission.
```

## Required tests

```text
correlation only blocks learning
plausible contributor allows low/medium eligibility
likely caused allows high eligibility if other gates pass
external event dominant blocks learning
confounded requires human review
```

---

# PHASE 19 — REASSESSMENT AND CORRECTIVE ACTION

## Objective

When a recommendation fails or is disputed, OpsIQ must reopen diagnosis and produce corrected action.

## Required structures

Create/extend:

```text
owner_reassessment_events
owner_corrective_diagnoses
owner_corrective_actions
owner_hypothesis_revisions
```

## Required reassessment flow

```text
failed/disputed outcome
→ evidence verification
→ harm tracking
→ failure adjudication
→ causal attribution
→ original diagnosis reopened
→ assumptions checked
→ new evidence added
→ hypotheses re-ranked
→ corrected diagnosis
→ corrective action
→ new validation criteria
```

## Required tests

```text
price increase partially failed
execution invalid customer reactivation
missing margin caused flawed recommendation
external event invalidates outcome
harmful action triggers human review
```

---

# PHASE 20 — LEARNING ELIGIBILITY GATE WITH HUMAN REVIEW STATUSES

## Objective

Decide whether a case is eligible to become business-specific learning.

## Required structures

Create/extend:

```text
owner_learning_eligibility_reviews
owner_learning_admission_decisions
owner_learning_rejection_reasons
```

## Eligibility statuses

```text
not_reviewed
rejected
eligible_low_confidence
eligible_medium_confidence
eligible_high_confidence
needs_more_cases
quarantined
human_review_pending
human_approved
human_rejected
```

## Rejection reasons

```text
opinion_only
not_executed
material_execution_deviation
missing_metric
unverified_evidence
invalid_measurement_window
external_event_contamination
single_weak_case
case_too_unique
insufficient_evidence
contradictory_evidence
causation_not_supported
harm_review_required
privacy_controls_missing
```

## Required guardrails

```text
No learning from opinion-only feedback.
No learning from unexecuted actions.
No learning from materially deviated execution.
No learning from unverified evidence.
No learning without adjudication.
No learning without causal attribution.
No high-confidence learning without human review if impact is broad or harm exists.
```

## Required tests

```text
reject opinion only
reject not executed
reject material deviation
reject unverified evidence
reject correlation only
human review required for harm
admit eligible valid local learning
quarantine contradictory case
```

---

# PHASE 21 — DECISION MEMORY

## Objective

Remember business-specific history with evidence links.

## Required structures

Create/extend:

```text
owner_decision_memory
owner_business_decision_history
owner_recommendation_history
owner_do_not_repeat_rules
owner_preference_constraints
```

## Memory categories

```text
owner_goal
owner_constraint
accepted_recommendation
rejected_recommendation
successful_action
failed_action
invalid_test
corrected_diagnosis
repeated_execution_issue
do_not_repeat
owner_preference
business_specific_rule
```

## Required guardrail

Do not repeat previously failed advice unless explaining:

```text
why situation changed
what changed
how execution differs
why prior failure does not invalidate new action
```

## Required tests

```text
stores accepted/rejected/success/failed actions
do-not-repeat blocks repeat
repeat allowed only with changed context explanation
wrong workspace forbidden
```

---

# PHASE 22 — BUSINESS STATE TIMELINE

## Objective

Shift from snapshot diagnosis to trend-based support.

## Required structures

Create/extend:

```text
owner_business_state_snapshots
owner_business_metrics_timeline
owner_metric_events
owner_trend_detections
```

## Required metrics

```text
revenue
gross_profit
net_profit
cash_balance
cash_runway_days
debt
emi_burden
receivables
payables
leads
conversion_rate
repeat_customer_rate
churn
average_order_value
customer_count
marketing_spend
cost_per_lead
cost_per_acquisition
inventory
staff_count
staff_productivity
capacity_utilization
complaints
refunds
rework_rate
delivery_delay_rate
```

## Required trend detections

```text
revenue rising but profit falling
cash falling despite sales rising
leads rising but conversion falling
new customers rising but repeat rate falling
marketing spend rising but CAC worsening
staff count rising but productivity falling
complaints rising before churn rises
debt burden increasing faster than cash generation
```

## Required tests

```text
create monthly snapshot
compare month vs previous
compare month vs 3-month average
detect revenue up/profit down
detect cash runway worsening
detect leads up/conversion down
```

---

# PHASE 23 — AI OBSERVABILITY TRACE LAYER

## Objective

Trace every advisory cycle end-to-end.

## Required structures

Create/extend:

```text
owner_ai_traces
owner_ai_trace_events
```

## Required trace fields

```text
trace_id
workspace_id
business_id
user_id
module
event_type
timestamp
inputs_used
decision_made
confidence_score
risk_flags
blocked_gates
latency_ms
error_code
model_provider
model_name
model_version
prompt_template_version
ruleset_version
retrieval_context_version
created_at
```

## Required traced events

```text
input_received
input_quality_assessed
diagnosis_generated
recommendation_generated
recommendation_verified
owner_decision_recorded
action_created
evidence_submitted
evidence_verified
outcome_reported
harm_recorded
adjudication_completed
causal_attribution_completed
reassessment_created
learning_eligibility_decided
dashboard_updated
```

## Required tests

```text
trace created for full loop
blocked gate appears in trace
model/ruleset version recorded when applicable
wrong workspace forbidden
trace does not expose public learning data
```

---

# PHASE 24 — INCIDENT RESPONSE AND CIRCUIT BREAKERS

## Objective

Define what happens when OpsIQ harms, leaks, or misleads.

## Required structures/files

Create/update:

```text
OWNER_MODE_INCIDENT_RESPONSE.md
owner_incident_events
owner_circuit_breakers
```

## Required incident classes

```text
harmful_recommendation
privacy_leak
cross_tenant_exposure
learning_gate_bypass
wrong_high_confidence_advice
dashboard_misreporting
evidence_verification_bypass
db_migration_data_loss
prompt_injection_success
security_gate_failure
```

## Required fields

```text
incident_id
severity
trigger
detected_at
affected_workspace_id
affected_business_id
containment_step
feature_flag_shutdown
rollback_step
owner_notification_required
post_incident_review_required
status
created_at
updated_at
```

## Circuit breaker triggers

```text
high/severe harm
learning gate bypass
tenant isolation failure
prompt injection success
evidence verification bypass
dashboard wrong outcome status
DB migration data loss risk
```

## Required tests

```text
learning bypass triggers incident
tenant isolation failure path exists
severe harm triggers circuit breaker
evidence bypass triggers incident
rollback path documented
```

---

# PHASE 25 — MODEL/PROMPT/RULESET VERSIONING AND CHANGE CONTROL

## Objective

Prevent invisible changes from degrading advice.

## Required structures

Create/extend:

```text
owner_model_change_log
owner_prompt_template_versions
owner_ruleset_versions
owner_evaluation_versions
```

## Required fields

```text
id
version_type
version_name
previous_version
new_version
change_reason
risk_level
regression_required
regression_result
feature_flag
rollback_plan
approved_by
created_at
```

## Required behavior

Before changing model/provider/prompt/ruleset:

```text
run regression suite
compare outputs
check genericness
check safety overrides
check owner constraints
check tenant isolation
feature-flag rollout
define rollback plan
```

## Required tests

```text
version change recorded
high-risk change requires regression
rollback plan required
output trace records version
```

---

# PHASE 26 — OWNER DASHBOARD PROOF

## Objective

If the owner cannot see/use the loop, it does not exist.

## Required dashboard display

Owner dashboard must show:

```text
input quality status
critical missing data
diagnosis status
recommendations
verification status
owner decision status
actions
execution status
evidence status
outcome status
benefit status
harm flag if any
adjudication status
reassessment queue
learning eligibility status
business trend warnings
incidents requiring owner attention
```

## Required guardrails

```text
Do not expose hidden controlled learning internals.
Do not expose public learning hints.
Show owner-useful statuses, not internal machinery.
Wrong workspace forbidden.
```

## Required tests

```text
dashboard loads
shows active recommendation
shows missing data
shows action status
shows evidence verification
shows outcome
shows reassessment required
does not expose hidden learning internals publicly
```

---

# PHASE 27 — FULL-LOOP VALIDATION SUITE

## Objective

Prove the full loop, not only first-pass diagnosis.

## Required full-loop test

At minimum:

```text
input record
→ input quality
→ diagnosis
→ recommendation
→ recommendation verification
→ owner decision
→ benefit record
→ action
→ execution
→ evidence
→ evidence verification
→ validation criteria
→ outcome
→ harm tracking
→ adjudication
→ causal attribution
→ reassessment
→ learning eligibility
→ decision memory
→ business timeline
→ observability trace
→ dashboard proof
```

## Required scenario cases

```text
cash crisis
high revenue / low profit
high leads / low conversion
repeat customer decline
bad marketing ROI
staff productivity failure
pricing action failure
inventory/cash lockup
debt pressure
partial execution
external market shock
missing data
owner constraint conflict
harmful recommendation
prompt injection attempt
unverified evidence attempt
```

## Required tests

```text
root-cause accuracy
first-action usefulness
constraint awareness
missing-data abstention
execution feasibility
outcome tracking
harm tracking
failure adjudication
causal attribution
corrective diagnosis
learning rejection
learning eligibility
trend detection
dashboard proof
tenant isolation
LANE_B DB proof
```

---

# PHASE 28 — OWNER PILOT CHECKLIST

## Objective

Prepare controlled real-business Owner Mode use before public SaaS.

## Required file

Create/update:

```text
OWNER_MODE_REAL_BUSINESS_PILOT_CHECKLIST.md
```

## Required sections

```text
required business inputs
input quality checklist
first 30-day operating cadence
minimum metrics
owner decision process
action tracking process
evidence submission process
evidence verification process
outcome reporting process
harm reporting process
failure reassessment process
learning eligibility process
dashboard review process
weekly review process
monthly review process
pilot success criteria
pilot stop conditions
```

## Candidate business types to support

Do not hardcode, but support:

```text
laundry/dry-cleaning
commercial housekeeping
boutique/clothing
food/beverage
local service business
```

---

# LATER-USE PRIVATE CONTROLLED LEARNING & RELIABILITY SYSTEM

Do not implement this until Phases 0–28 are COMPLETE_VERIFIED.

## Later hard gates

```text
verified outcomes only
no public learning hints
no unverified feedback ingestion
tenant isolation
privacy-safe aggregation
consent/retention controls
causal attribution
harm tracking
human review
regression gates
staged rollout
rollback
LANE_B DB verification
no false COMPLETE
```

## Later structures

```text
controlled_learning_candidates
controlled_learning_reviews
controlled_learning_admissions
controlled_learning_rejections
controlled_learning_harm_events
controlled_learning_attribution_reviews
controlled_learning_privacy_controls
controlled_learning_consent_records
controlled_learning_retention_policies
controlled_learning_rollout_flags
controlled_learning_regression_results
controlled_learning_rollback_events
```

## Later pipeline

```text
verified owner outcome
→ evidence verification
→ execution verification
→ adjudication
→ harm classification
→ causal attribution
→ privacy/consent/retention check
→ human review when required
→ regression test candidate
→ staged rollout
→ monitor
→ admit / quarantine / rollback
```

## Later prohibitions

```text
No unverified feedback ingestion.
No model training from raw owner comments.
No cross-tenant data use without explicit consent and anonymization.
No public UI hints of hidden learning.
No high-impact learning without human review.
No reliability rollout without rollback plan.
No DB-backed reliability slice without LANE_B proof.
No COMPLETE without proof.
```

---

# CROSS-CUTTING TEST REQUIREMENTS

Every relevant slice must include tests for:

```text
authenticated owner can access own records
wrong workspace forbidden
unauthenticated user rejected
public route cannot access owner records
tenant isolation preserved
audit trail preserved
invalid status transition blocked
DB persistence works if DB-backed
dashboard query does not leak hidden internals
```

Status transition tests must block:

```text
recommendation → learning without adjudication
not_executed action → validated failure
opinion-only evidence → verified outcome
unverified evidence → learning eligibility
correlation_only attribution → high confidence learning
medium/high/severe harm → automatic learning admission
rejected owner decision → action creation
public user → owner memory access
```

---

# REQUIRED CLOSEOUT AFTER EVERY SLICE

Create/update:

```text
OWNER_MODE_REALITY_LOOP_CLOSEOUT.md
```

Append:

```text
slice_name
status
branch
commit_before
commit_after
files_changed
models_added_or_changed
routes_added_or_changed
services_added_or_changed
ui_added_or_changed
tests_added_or_changed
commands_run
command_results
LANE_B_status_if_DB_backed
known_limitations
regressions_found
regressions_fixed
security_findings
tenant_isolation_findings
dashboard_proof_status
next_required_slice
```

No closeout, no completion.

---

# REQUIRED COMMIT RULE

After each verified slice:

```bash
git status --short
git add <only files changed for this slice>
git commit -m "<clear slice message>"
```

If committing is unavailable, document:

```text
commit not made
reason
exact files changed
diff summary
```

---

# HARD STOP CONDITIONS

Claude must stop and report immediately if:

```text
current repo state cannot be inspected
baseline cannot be established
scope requires public/SaaS/billing/Product Hunt changes
DB-backed slice lacks LANE_B proof but is being called COMPLETE_VERIFIED
database migration risk is unclear
Prisma schema conflicts are unresolved
auth/tenant isolation cannot be verified
public route exposes owner data
input can override instructions
evidence verification can be bypassed
learning eligibility can be bypassed
owner decision can be skipped
action can be created from rejected recommendation
not-executed action can validate recommendation failure
harm is observed but not recorded
medium/high/severe harm bypasses human review
causal attribution is missing before learning eligibility
cross-business learning is attempted
privacy/consent/retention controls are required but missing
rollout lacks feature flag or rollback plan
model/prompt/ruleset change lacks regression gate
build/test/typecheck fails and cannot be fixed safely
existing proven Owner Mode behavior regresses
```

---

# FINAL COMPLETION STANDARD

Owner Mode can be called COMPLETE_VERIFIED only when all below are true:

```text
1. Repository baseline was inspected and documented.
2. Roadmap freezes premature public/SaaS/billing/Product Hunt/external intelligence work.
3. AI use-case inventory and risk register exist.
4. Autonomy/access classifications exist and block autonomous business action.
5. Security threat model covers input, memory, evidence, and tools.
6. Input quality and provenance gate exists.
7. Diagnosis evidence contract exists.
8. Recommendations are structured and tracked.
9. Recommendations are verified before owner decision.
10. Anti-overreliance acknowledgement exists for medium/high-impact recommendations.
11. Owner decision and decision-rights are captured.
12. Benefits realization register exists.
13. Actions and execution are tracked.
14. Evidence is captured separately from verification.
15. Evidence verification records verifier metadata.
16. Validation criteria and stop/escalation rules exist.
17. Outcomes are tracked.
18. Harm events are tracked.
19. Failure adjudication exists.
20. Causal attribution classification exists.
21. Reassessment and corrective action exist.
22. Learning eligibility gate exists and cannot be bypassed.
23. Decision memory exists.
24. Business state timeline exists.
25. AI observability trace layer exists.
26. Incident response and circuit breakers exist.
27. Model/prompt/ruleset versioning and change control exist.
28. Owner dashboard proves the loop without exposing hidden learning internals.
29. Full-loop validation suite passes.
30. Owner pilot checklist exists.
31. Owner/public separation is proven.
32. Tenant isolation is proven.
33. DB-backed slices have LANE_B real PostgreSQL proof.
34. No false COMPLETE has been claimed.
```

Anything less is not complete.

---

# FINAL INSTRUCTION TO CLAUDE

Implement only the next incomplete slice.

Before implementation:

```text
inspect repo
hostile audit current state
confirm exact status
run baseline checks
```

During implementation:

```text
make smallest safe change
preserve proven work
avoid unrelated scope
write tests
protect tenant boundaries
preserve audit trail
```

After implementation:

```text
run all relevant checks
run LANE_B if DB-backed
fix breakage immediately
write closeout
commit if available
stop
```

Do not claim completion without proof.

Do not proceed if broken.

Do not skip the loop.