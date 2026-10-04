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
| Process-execution (B) | FULL for task flow | `verifiedByActorId`, `selfVerified` | recorder-typed | code present, **no production writer** | reassessment event on every terminal class | gate (inputs hard-coded favourable — reported) |

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
  success or failure.
* **Causation.** Never inferred from before/after. An existing causal adjudication is mapped, never stronger than
  `PLAUSIBLE`; otherwise `NOT_ASSESSED`.
* **Learning firewall.** `learningEligibility` is reported only; it states `ELIGIBLE_PER_EXISTING_GOVERNANCE` only
  where a loop exists (Finance bridge, process-execution gate) and nothing blocks. `MIN_SAMPLE`, priors,
  `MAX_MODIFIER`, scoring and candidate promotion are untouched.

## 5. Owner-facing loop states

Done · Not done yet · Waiting to measure · Needs after-data · Improved but target missed · Target reached ·
No measurable improvement · Made worse · Disputed · External event interfered · New diagnosis confirms resolved ·
Still open. Each carries a plain reading and a concrete next step; only "New diagnosis confirms resolved" is terminal.
"Target reached" reads: *the action reached its verification target; confirm with new business evidence.*

## 6. Changes made

* New pure contract + adapters + tests (above).
* `ACTION_VERIFIED` line: `Verified: "X" reached its target.` → `"X" reached its verification target; confirm with new business evidence.`
  The event is still emitted only when the owner-entered after-value meets a numeric target; the old wording read as
  independent proof.
* `classifyOutcomeVerification` Rule 2b: a recorded `externalEventFlag` now yields `NO_MEASURABLE_IMPACT`
  (previously the flag was stored but never consulted, so a flagged "worked" became `SUCCESS`). This only
  *reduces* learning/"verified success" outcomes.
* Wording: cockpit classification labels no longer prefix FAILURE/NEGATIVE/INCONCLUSIVE with "Verified:"; Owner Now
  "marked done and verified" → "done and its result is measured against fresh figures"; a disputed process outcome is no
  longer shown with the green success badge on Priorities/Tasks.
* Canonical ranking and `exclusionFor` are unchanged: completed-unverified actions already leave the election while
  survival issues re-raise `survival_reading`.

## 7. Known limitations (reported, not changed — each needs persistence or a policy decision)

1. System A `afterValue` is owner-typed and uncorroborated; observation windows are stored but not enforced there.
2. Seven of eight System A verification tables record no verifier identity; no domain records independence.
3. A failed/inconclusive/disputed System A verification triggers no re-diagnosis (only `reachedTarget` does).
4. Only Finance has a learning loop; the other domains have no outcome signal.
5. `determineAndCreateLearningCandidate` passes hard-coded favourable proof/quality/attribution inputs and sets
   `learningCandidateId` to the outcome id (no `ControlledLearningCandidate` row); `Rule 9` ignores metric direction;
   `observationWindowDays`/`verificationWindowDays` have no production writer; causal-attribution, failure-adjudication,
   evidence-verification and reassessment domain modules are unwired. Changing these alters learning behaviour and is out
   of scope for this contract.
6. Owner Home "Last verified improvement" accepts any `verified_improved` row (including no-target improvement); its
   label is kept (tested) but the value is owner-entered.
7. Customer has no outcome loop.
8. Owner-facing consumers still read raw status; routing every surface through `ownerOutcomeLoopState` is follow-up work.
