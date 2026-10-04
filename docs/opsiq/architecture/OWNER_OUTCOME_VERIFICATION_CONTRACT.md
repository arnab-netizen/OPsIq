# Owner Outcome Verification Contract

Status: semantics + read-only normalisation. No migration, no new persistence, no score, threshold, ranking,
confidence or Finance-learning change.
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
