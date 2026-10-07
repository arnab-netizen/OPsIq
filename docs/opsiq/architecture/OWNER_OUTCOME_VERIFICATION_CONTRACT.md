# Owner Outcome Verification Contract

Status: semantics + read-only normalisation (§1–7). Persistence of the owner decision and of versioned assessment snapshots is
described in §8 (Outcome Persistence v1 Core). No score, threshold, ranking, confidence or Finance-learning change in either.
Code of record: `src/domain/owner-spine/owner-outcome-policy.ts` (pure contract),
`owner-outcome-adapters.ts` (read-only normalisation of the two existing loops),
`src/__tests__/owner-spine/owner-outcome-policy.test.ts`.

> Observed improvement after an OpsIQ recommendation is not by itself proof that the recommendation caused the improvement.

## 1. Core invariant

These are seven different facts. No field, label or sentence may stand in for another:

| # | Fact | Contract field |
|---|---|---|
| 1 | The action was completed | `executionStatus` |
| 2 | An outcome could be observed | `observationStatus` |
| 3 | The metric moved | `measurementResult` |
| 4 | The target was reached | `targetAttainment` (`REACHED` only when `verifyOutcome().reachedTarget`) |
| 5 | The problem is resolved | `issueResolution` (only from a **newer diagnosis** on current evidence) |
| 6 | The action caused the result | `causalAttribution` (default `NOT_ASSESSED`; never stronger than `PLAUSIBLE`) |
| 7 | The recommendation is proven effective | `learningEligibility` (only what existing governance already says) |

## 2. Current-state flow (audited at `a59aad7e`)

```
SYSTEM A  (Recovery, Finance, Cashflow, Sales, Operations, Marketing, SOP, Strategy)
  finding -> *Action (proposed..completed) -> POST /verify  [OWNER_MANAGE]
        owner types afterValue (+ optional dispute flag); baseline MEASURED|OWNER_REPORTED (server resolves)
        -> verifyOutcome() -> *Verification row (verified_improved|verified_not_improved|inconclusive|disputed)
        -> if reachedTarget only: best-effort re-diagnosis (runCycle / run<Domain>Diagnosis) + audit
        -> owner-decision-candidates.exclusionFor(): reached-target AND recorded >= evidenceAsOf => action leaves
           the election (verified_complete); survival cash/finance findings re-raise a survival_reading instead
        -> ACTION_VERIFIED whatChanged line
        -> Finance only: learning-bridge -> OwnerFinanceOutcomeSignal + ControlledLearningCandidate (human gate)

SYSTEM B  (OwnerActionOutcome + ProcessExecutionTask)
  task COMPLETED -> RECORD_OUTCOME -> OwnerActionOutcome -> VERIFY_OUTCOME
        classifyOutcomeVerification() (8 classes) + separation of duty (solo-operator exception, selfVerified)
        -> post-commit: reassessment event (+ reopensDiagnosis for FAILURE/NEGATIVE_IMPACT) + learning gate
```

The two systems share no table and no vocabulary. They are **separate workflows** (different persistence, different
verifier rules) that this contract **adapts**, not merges: `domainActionToOutcomeInput` (A) and
`processOutcomeToOutcomeInput` (B) both produce `OwnerOutcomeInput`; `assessOwnerOutcome` yields one
`OwnerOutcomeAssessment`. Nothing is persisted.

## 3. Loop inventory

| Domain | Loop | Verifier recorded | After-value source | Window enforced | Re-diagnosis | Learning |
|---|---|---|---|---|---|---|
| Recovery | PARTIAL | `verifiedBy` id (not independence) | owner-typed | no (`verificationWindowDays` stored) | only on `reachedTarget` | none |
| Finance | FULL (owner as verifier) | none (audit actor only) | owner-typed | no | only on `reachedTarget` | bridge → human-gated candidate; ±0.10 modifier, never critical |
| Cashflow / Sales / Operations / Marketing / SOP | PARTIAL | none | owner-typed | no | only on `reachedTarget` | none |
| Strategy | PARTIAL (+ separate startup `FundedInitiativeOutcome` budget loop) | none | owner-typed | no | only on `reachedTarget` | none on the action path |
| Customer | NO_VERIFICATION_LOOP | — | — | — | — | — |
| Process-execution (B) | **PARTIAL_LOOP** (was reported FULL; corrected) | `verifiedByActorId`, `selfVerified` | recorder-typed | code present, **no production writer** | reassessment event on every terminal class | **none reachable**: the gate needs six facts none of which is persisted, so no candidate is created (fails closed) |

## 4. Rules the contract enforces

* **Completion ≠ verification.** A completed action with no after-data is `READY_TO_MEASURE`, `unverified`/`inconclusive`.
* **Movement ≠ target.** `IMPROVED` with `NOT_REACHED` stays "Improved but target missed". No target → `NO_TARGET`.
* **Resolution only from a newer diagnosis** (`evidenceAsOf` later than the action's completion/measurement) on current
  evidence. Missing, stale or older diagnoses are `NOT_YET_REASSESSED`/`INCONCLUSIVE`, never "resolved". A newer
  diagnosis that still raises the issue is `STILL_OPEN` whatever the action's own result.
* **Baseline provenance** `MEASURED | OWNER_REPORTED | EXTERNAL_SOURCE | UNKNOWN`. `UNKNOWN`/null is no baseline →
  `inconclusive`. Nothing is fabricated.
* **After-value provenance** `AUTHORITATIVE_SNAPSHOT | SYSTEM_MEASUREMENT | EXTERNAL_RECORD | OWNER_ENTERED | NARRATIVE_ONLY | NONE`.
  Every System A after-value is `OWNER_ENTERED` (evidence quality `weak`); narrative-only is not a measurement.
* **Verifier.** `independentlyVerified` only for an independent verifier; solo-operator self-verification is
  `selfVerified`; System A records no independence so it is never claimed. `AI_IS_NOT_A_VERIFIER` is enforced
  (`assertOutcomeVerifierIsNotAI`).
* **Observation window.** `TOO_EARLY_TO_JUDGE` is `WINDOW_OPEN`/`WAITING_TO_MEASURE` and is not a failure. Window
  names differ by source (`expectedTimeframeDays`, process-task `verificationWindowDays`, outcome
  `observationWindowDays`) and are anchored differently; the adapter anchors at completion and takes the first
  recorded value. There is no universal replacement.
* **External event / dispute.** Both force `inconclusive`, block attribution and block learning, and are never read as
  success or failure. An external event is *not* "no measurable impact": a before/after change may be measurable while
  attribution is lost. Process outcomes persist it as the class `EXTERNAL_EVENT_INTERFERENCE` (gate status
  `ATTRIBUTION_UNCLEAR`), shown to the owner as "External event interfered" with a warning (never green) badge.
* **Causation.** Never inferred from before/after. An existing causal adjudication is mapped, never stronger than
  `PLAUSIBLE`; otherwise `NOT_ASSESSED`.
* **Direction is never defaulted.** `direction = up | down | unknown`. `unknown` is the result of any missing or
  unrecognised value (adapters, process classifier). With `unknown`: no `IMPROVED`/`WORSENED` (a changed value is
  `CHANGED_DIRECTION_UNKNOWN`), target attainment is `UNKNOWN` (only exact equality with the target is
  direction-independent), status is `inconclusive`, learning is `NOT_ELIGIBLE`, and the owner is told: *OpsIQ has the
  before and after values, but the intended direction for this metric was not recorded, so target attainment cannot be
  verified.* Metric names are not used to guess direction (`verification-direction.ts` is a form default, not proof).
* **Learning eligibility is not asserted by a pure assessment.** States: `ELIGIBLE_CONFIRMED_BY_GATE` (only when an
  actual `determineLearningEligibility` result is passed in and says eligible), `PENDING_GOVERNANCE` ("potentially
  eligible for learning review" — the gate has not run), `NOT_ELIGIBLE`, `NO_LEARNING_LOOP`. Hard blockers (dispute,
  external event, unknown direction, no baseline, open window, no conclusive comparison) always win over a gate "yes".
  `MIN_SAMPLE`, priors, `MAX_MODIFIER`, scoring and candidate promotion are untouched.

## 5. Owner-facing loop states

Done · Not done yet · Waiting to measure · Needs after-data · Improved but target missed · Target reached ·
No measurable improvement · Made worse · Disputed · External event interfered · New diagnosis confirms resolved ·
Still open. Each carries a plain reading and a concrete next step; only "New diagnosis confirms resolved" is terminal.
"Target reached" reads: *the action reached its verification target; confirm with new business evidence.*

## 6. Changes made

* New pure contract + adapters + tests.
* `ACTION_VERIFIED` line: `Verified: "X" reached its target.` → `"X" reached its verification target; confirm with new business evidence.`
* `classifyOutcomeVerification` (PR #585 amendment):
  * Rule 2b: a recorded `externalEventFlag` **or** outcome status `external_event_interference` → new class
    `EXTERNAL_EVENT_INTERFERENCE` (previously the flag was ignored, and the status was folded into
    `NO_MEASURABLE_IMPACT`). Terminal, reassessment still fires, never learning-eligible.
  * Rules 6b/7/9 are direction-aware via optional `task.targetDirection`; with no direction a numeric target judgment
    fails closed to `INCONCLUSIVE` and the old higher-is-better assumption is gone.
* `determineAndCreateLearningCandidate` no longer invents `ACCEPTED` proof, `ACCEPTABLE` quality, `LIKELY`
  attribution, `NOT_REQUIRED` approval, `NONE` AI-mutation or `ESTIMATED_FROM_OWNER_INPUT` profit. It builds the gate
  input only from supplied facts (`process-learning-gate-inputs.ts`) and returns without a write when any is unproven.
  `determineLearningEligibility` itself is unchanged.
* Wording: cockpit/Now View label the new class "External event interfered"; cockpit no longer prefixes
  failure/inconclusive with "Verified:"; disputed process outcomes are not green on Priorities/Tasks.
* CI classifier: the four DB-backed outcome/reassessment services are now `DB_RUNTIME` (named, not a directory rule), so
  a change to them can no longer skip DB verification.
* Canonical ranking and `exclusionFor` are unchanged.

### Process-execution learning-gate fact sources

| Gate input | Source today |
|---|---|
| proof status / proofRequired | NONE (task holds free-text `evidenceRefs` only) |
| implementation quality | NONE (not persisted against a task) |
| attribution status | NONE (causal-attribution unwired; `causalAttributionId` never populated) |
| profit impact (required, confidence) | NONE |
| owner learning approval | NONE (lives on a candidate this path never creates) |
| AI mutation status | NONE |

Every `NONE` fails closed. Process-execution outcomes therefore cannot become learning candidates until a governed
source exists for each fact.

### Direction persistence

`ProcessExecutionTask` and `OwnerActionOutcome` persist no target direction (only `targetMetricName`/`targetValue`).
`DIRECTION_PERSISTENCE_REQUIRED=YES` for a complete long-term fix; no migration is made here and the safe behaviour
above applies until then. Per-domain verification rows already persist `targetDirection`.

## 7. Known limitations (reported, not changed — each needs persistence or a policy decision)

1. System A `afterValue` is owner-typed and uncorroborated; observation windows are stored but not enforced there.
2. Seven of eight System A verification tables record no verifier identity; no domain records independence.
3. A failed/inconclusive/disputed System A verification triggers no re-diagnosis (only `reachedTarget` does).
4. Only Finance has a learning loop; the other domains have no outcome signal.
5. If gate facts ever become available, `determineAndCreateLearningCandidate` still records `learningCandidateId` as
   the outcome id (no `ControlledLearningCandidate` row) — to be replaced when real sources exist;
   `observationWindowDays`/`verificationWindowDays` have no production writer; causal-attribution, failure-adjudication,
   evidence-verification and reassessment domain modules are unwired. Changing these alters learning behaviour and is out
   of scope for this contract.
6. Owner Home "Last verified improvement" accepts any `verified_improved` row (including no-target improvement); its
   label is kept (tested) but the value is owner-entered.
7. Customer has no outcome loop.
8. Owner-facing consumers still read raw status; routing every surface through `ownerOutcomeLoopState` is follow-up work.


## 8. Persistence layer (Outcome Persistence v1 — Core)

This section describes what is now stored. The semantic contract above is unchanged: `assessOwnerOutcome()` is still the only
place a conclusion is derived, and the seven facts stay distinct.

> Observed improvement after an OpsIQ recommendation is not proof that the recommendation caused the improvement.

### 8.1 What stays authoritative
* **System A** (per-domain `*Action` + `*Verification`, eight domains) and **System B** (`ProcessExecutionTask` + `OwnerActionOutcome`) remain
  the source records. Nothing in the new layer writes to them, replaces them or turns `OwnerActionOutcome` into a universal outcome model.
* Legacy rows are **not** backfilled and are **not** given an owner decision. A legacy System A action is assessed under its own
  canonical candidate id with `decisionLinkState = UNLINKED_NO_DECISION`; a legacy process task under `process_task:<taskId>`.

### 8.2 Owner decision record — `owner_decision_records`
The owner's response to a canonical, persisted candidate: `ACCEPTED | REJECTED | DEFERRED | MODIFIED` (exactly these).
* Candidate identity is deterministic: `domain_action:<domain>:<actionId>` (recovery, finance, cashflow, sales, operations, sop,
  marketing, strategy) or `compliance_item:<id>`. Display text is never an identity. Synthesized candidates (`survival_reading`,
  `safety_gate`, `evidence_refresh`) and workspace-level `business_risk` (no business attribution) are not decidable in v1.
* The server resolves the candidate inside the caller's workspace **and** business and builds an immutable `recommendationSnapshot`
  from the persisted row. A later diagnosis or edit never rewrites what the owner saw.
* **Outcome contract** (ACCEPTED/MODIFIED only): commitment description, verification metric, baseline value + provenance, target value,
  **target direction** (`up | down | unknown`), observation window, intended completion, expected measurement source.
  `null` = unknown/not supplied; an explicit `0` is a known zero; no target is not target 0; direction is never defaulted or
  inferred from a metric name; a baseline value must state its provenance (`UNKNOWN` is an allowed answer).
* **MODIFIED** keeps the original recommendation (snapshot) and the owner's own commitment side by side; every assessment of that
  chain carries `commitmentFidelity = MODIFIED_BY_OWNER`, so a result is never presented as the execution of the recommended action.
  **REJECTED / DEFERRED** record intent only — no contract, no execution, no outcome.
* Append-only (DB trigger). A later decision (or an amended contract) is the next `sequence`, `supersedesId` → previous.
* **Serialization and idempotency** are enforced by the database. Every writer of a candidate's history (a new decision *and* an
  outcome-contract amendment) takes ONE transaction-scoped advisory lock keyed by workspace + business + candidate, re-reads the
  latest decision *under that lock*, applies its own precondition, and only then appends. So an amendment can append only if the
  latest decision is still ACCEPTED/MODIFIED at its commit point: when a concurrent REJECTED/DEFERRED committed first the
  amendment fails and never resurrects the commitment; when the amendment commits first the history is
  ACCEPTED → amended → REJECTED/DEFERRED and the final state is the rejection. `UNIQUE(workspace, business, candidate, sequence)`
  and the optional `UNIQUE(workspace, idempotencyKey)` remain as backstops. A duplicate request returns the identical event.

### 8.2a Tenant integrity enforced by the database
Foreign keys alone do not prove a referenced row belongs to the same workspace, so the new tables use composite, tenant-aware
keys (the pair `owner_businesses(id, workspace_id)` is unique and is the FK target):
* `(business_id, workspace_id)` → `owner_businesses(id, workspace_id)` on both tables;
* `supersedes_id` → a decision of the same workspace, business **and candidate**;
* `owner_decision_id` → a decision of the same workspace, business **and chain** (`chain_key = candidate_id`);
* `previous_assessment_id` → an assessment of the same workspace, business **and chain**;
* an insert-time trigger requires a `supersedes`/`previous` link to be exactly the preceding sequence/version.
Direct-SQL tests (`owner-outcome-tenant-integrity.db.test.ts`) prove each malformed combination is refused. **Soft references:**
the source-row ids stored on an assessment (`system_a_action_id`, `system_a_verification_id`, `process_task_id`, `owner_action_outcome_id`,
`reassessment_event_id`, `newer_diagnosis_cycle_id`) are deliberately NOT foreign keys — like every other cross-system id in these
domains they point at tables this layer must not constrain (and several lack a tenant-composite key). Every read re-scopes by
workspace **and** business and ignores a row outside them (tested), so a forged id can never surface another tenant's data; the
residual exposure is a dangling/forged *reference value* on a row only a direct-SQL writer could create (P3).

### 8.3 Canonical outcome spine — `owner_outcome_assessments`
A linkage + provenance record and a **versioned, immutable** snapshot of what OpsIQ could legitimately conclude at that time.
* One chain per commitment: chain key = the canonical candidate id (a legacy undecided process task has its own `process_task:<id>` chain).
  `UNIQUE(workspace, chain, version)`; the current assessment is the highest version; `previousAssessmentId` links the history.
  Version 1 `WAITING_TO_MEASURE` → version 2 `MEASURED/IMPROVED/NOT_REACHED` → version 3 `STILL_OPEN` is evidence evolving, not contradiction.
  An identical re-assessment (same links, facts and conclusions) is not a new version.
* Each row stores the seven outputs (`executionStatus`, `observationStatus`, `measurementResult`, `targetAttainment`, `issueResolution`,
  `causalAttribution`, `learningEligibility`), evidence quality, verifier kind/status, dispute and external-interference flags,
  learning blockers, the next verification action, the exact `OwnerOutcomeInput` facts (`inputSnapshot`) and the explicit source links.
* **Server-derived only.** Clients submit references; the server builds an `OwnerOutcomeInput` from persisted sources through the
  existing adapters (`domainActionToOutcomeInput`, `processOutcomeToOutcomeInput`) and persists `assessOwnerOutcome()`'s output. No API
  accepts a conclusion.
* **Input domain is the chain's real domain.** `OwnerOutcomeInput.domain` also admits `compliance` (a compliance commitment) and
  `process_execution` (an undecided process task), so a persisted `inputSnapshot` never carries a placeholder domain; the
  candidate, the row and the input always agree.
* **Linking** is by persisted primary key or stable task key only — never text, metric name, description or timestamp. A System A
  action carries its own execution/verification (no process task can be attached to it); a compliance commitment may be linked to
  one process task by explicit reference (workspace + business validated; one task ↔ one commitment; business-less tasks are never
  linkable). A commitment with no execution source is stored as `NO_EXECUTION_SOURCE_LINKED`, not guessed.
* **Direction persistence (System B):** `ProcessExecutionTask`/`OwnerActionOutcome` still have no direction column. The durable source
  for a *new* commitment is the linked decision's `targetDirection`; it is applied only when the commitment's metric does not conflict
  with the task's. Historical rows stay `unknown` (no backfill).
* **Issue resolution** is `RESOLVED` only from a newer-diagnosis fact: the business's current cycle in the action's own domain,
  from a different cycle, with evidence period **and** generation strictly after the completion/measurement anchor, a non-amended
  snapshot, no known evidence gap and within the freshness window. The cycle id, domain and evidence date are persisted and a DB
  CHECK forbids `RESOLVED` without a cycle id. Domains/chains with no deterministic cycle reference (Recovery, process tasks) stay
  `NOT_YET_REASSESSED`.
* **Attribution** defaults to `NOT_ASSESSED`; the maximum positive value is `PLAUSIBLE` (a DB CHECK has no stronger value).
* **Learning** is persisted as the policy states it. Core never runs or fabricates the learning gate: `ELIGIBLE_CONFIRMED_BY_GATE`
  requires a real gate result supplied by a server-side caller (no API accepts one) and blockers still win.
* Every decision, link and assessment write emits an audit event (ids, states and provenance only — no metric values).

### 8.4 Known limitations of Core
1. Verified-by independence for System B is read from the verify audit event; if absent the verifier is `UNKNOWN`, never `INDEPENDENT`.
2. Recovery verification rows persist no baseline provenance, so with a verification row the existing adapter reports an unknown baseline
   (`NOT_MEASURABLE`) — unchanged by this layer.
3. A newer-diagnosis reference is resolved for the seven uniform System A domains; Recovery and process tasks have none.
4. No owner-facing UI or timeline (next PR); decisions are recorded through the API only.
5. Assessments are written on request (API/service); nothing schedules them yet.
6. **Finance learning decision id — `FINANCE_LEARNING_DECISION_ID_MIGRATION=DEFERRED`.** See `FINANCE_LEARNING_DECISION_ID_DEBT.md`.
