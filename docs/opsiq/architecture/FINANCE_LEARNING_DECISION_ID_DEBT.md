# Finance learning bridge — decision-id placeholder (technical debt)

`FINANCE_LEARNING_DECISION_ID_MIGRATION=DEFERRED`

## What is wrong
`src/services/owner-finance/learning-bridge.service.ts` creates the controlled-learning candidate with
`candidateRecord.ownerDecisionId = action.cycleId` — a **diagnosis cycle id**, not an owner decision. The comment in the code calls the
cycle "the owner decision". Semantically that is wrong: a diagnosis cycle is not something the owner decided.

## Why it was not fixed in Outcome Persistence v1
`ownerDecisionId` becomes `ControlledLearningCandidate.sourceOwnerDecisionId` and is part of the candidate fingerprint
(`workspace::decision::action::outcome`, `controlled-learning-candidate.service.ts`). Changing it changes candidate identity,
de-duplication, idempotency and the linkage of existing learning history. That is learning behaviour, not persistence, so Outcome
Persistence v1 persists the *real* owner decision (`owner_decision_records.id`) and makes it available, but leaves the bridge and every
existing fingerprint byte-for-byte unchanged. `src/__tests__/owner-outcome/owner-outcome-boundaries.test.ts` pins both facts.

## What a future migration must address
* **Existing candidate identity** — rows already created with `sourceOwnerDecisionId = <cycleId>`.
* **De-duplication** — the unique `(workspaceId, auditFingerprint)`; a new id would stop old and new candidates colliding.
* **Historical linkage** — signals/candidates/reviews/admissions referencing the old id.
* **Safe backfill** — which actions have a real decision record at all (legacy actions have none; they must not be given one).
* **Old-vs-new fingerprint compatibility** — a dual-read period or an explicit alias, never a silent rewrite.
* No silent migration: it needs its own reviewed PR, with a plan for the learning-governance owners.
