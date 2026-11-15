# Owner Outcome Timeline v1 — "Results"

Status: implemented on branch `claude/owner-outcome-timeline-v1` (base `652f9b1e`, the PR #596 merge). **No database migration.** No change to diagnosis, ranking, confidence, recommendation election, learning, the #594 finance attribution or the #595 canonical growth/scale gate.

`NO_PRODUCTION_MIGRATION_EXPECTED` · `PR596_AUTHENTICATED_SMOKE=DEFERRED_NO_COMPUTER` (see §8)

## 1. What this is

The owner-facing follow-through layer over Outcome Persistence v1 Core. It lets an owner go from an OpsIQ recommendation to a trackable outcome and read the persisted result back, without a parallel decision or outcome system:

Recommendation → owner decision → commitment → execution → observation → measurement → target attainment → newer diagnosis / issue resolution → attribution → learning status.

It displays what is persisted. It does not invent, infer or recompute any stage.

## 2. Architecture boundary

| | |
| --- | --- |
| `NEW_OUTCOME_ENGINE` | NO — `assessOwnerOutcome()` stays the only semantic authority |
| `NEW_DECISION_ENGINE` | NO — decisions go through the existing `POST …/decisions` / `POST …/outcome-contracts` |
| `NEW_VERIFICATION_ENGINE` | NO — "Check outcome" calls the existing `POST …/outcome-chain` with a reference only |
| `NEW_DATABASE_MIGRATION` | NO |

Persistence is `owner_decision_records` + `owner_outcome_assessments` (append-only). System A / System B source rows stay authoritative.

## 3. Surface

- Route: `/owner/outcomes`. Navigation: **Results**, in the owner sidebar's *Actions* section (OWNER_VIEW). Home, Priorities and the Command Center are untouched.
- `src/components/owner-outcomes/` — `OwnerOutcomesView` (page body), `OutcomeTimeline` (one chain), `OutcomeCommitmentForm` (decide / amend), `outcome-api` (transport).
- `src/domain/owner-spine/owner-outcome-presentation.ts` — the single presentation mapping (status wording, stages, trackability, contract display, form→request shape, submit-attempt keys, history order).
- One read-only addition: `GET /api/owner/businesses/[businessId]/outcome-chains` (OWNER_VIEW) → `listOwnerOutcomeChains()`. It returns every decision-backed chain (decisions + all assessment versions) in two scoped queries plus a candidate index, built by the **same** `assembleOwnerOutcomeChain()` the single-chain read now uses. No persistence, no conclusion computed, no client-supplied identifiers. Capped at 100 chains with an explicit `truncated` flag.

## 4. Candidate identity and trackable coverage

The canonical owner decision already carries a deterministic persisted id per target (`OwnerDecisionTarget.candidateId`). Trackability is decided from that id only, with the same parser the server enforces (`parseOwnerCandidateId`) — never from titles, copy, metric names or time.

| Candidate id class (emitted by the owner-decision builders) | Trackable | Why |
| --- | --- | --- |
| `domain_action:<domain>:<uuid>` — recovery, finance, cashflow, sales, operations, sop, marketing, strategy | **Yes** | persisted System A action |
| `compliance_item:<uuid>` | **Yes** | persisted, business-attributable item |
| `business_risk:<uuid>` | No | risk entries are workspace-scoped, not tied to one business |
| `survival_reading:<domain>:<code>` | No | a measurement, not an action to commit to |
| `evidence_refresh:<domain>` | No | a request for data, no outcome to measure |
| `safety_gate:<key>` | No | a rule, not an action |

Untrackable recommendations are still listed, with "Outcome tracking is not available for this recommendation yet." A test fails if a builder starts emitting a candidate-id class that is not classified here.

## 5. Truth safeguards

- Unknown ≠ zero: blank is sent as `null`, a typed `0` stays `0`; "no target" is shown as "No target set", never 0; direction is sent as chosen and never inferred; non-numeric text is passed through so the server rejects it (never coerced to `null`).
- Causation: `IMPROVED` → "Improved" plus a visible caveat; `REACHED` → "Target reached" plus "does not by itself mean the original problem is resolved"; only the persisted `RESOLVED` reads "Resolved in a newer diagnosis"; `PLAUSIBLE` → "Possible contribution" ("cannot show that your action was the reason"); `NOT_ASSESSED` is never "no relationship". A test forbids *caused / proven / worked / solved / fixed* in any label or caveat.
- MODIFIED: the original recommendation and the owner's own action are shown side by side with a notice that results relate to the owner's action. REJECTED / DEFERRED show no execution or outcome stages.
- Staleness: an assessment recorded under an earlier decision record than the current one is **historical only**. The current stages fail closed to "Needs a new check for your current commitment" and carry none of its codes, labels, caveats, next action or learning blockers; it stays inspectable under History (labelled "checked under decision #n … earlier commitment"), the out-of-date notice stays visible, and "Check outcome" stays available to a manager. Nothing is recalculated client-side.
- Verification: owner-entered / self checks are never shown as independent ("Not independently verified").
- History: decisions and assessment versions are append-only and listed newest first.
- Caveats are visible text, not hover-only; status is conveyed in words, not colour alone.

## 6. Permissions, idempotency, isolation

- Read: `OWNER_VIEW`. Decide / amend / check: `OWNER_MANAGE` — controls are hidden without it, and the existing routes enforce it server-side regardless.
- Each submit carries a client idempotency key: the same key for a retry of the same payload, a new key when the payload changes. An in-flight guard stops double taps. Duplicate suppression itself stays on the server (unique keys and request fingerprints).
- Every read and write is scoped by the verified workspace and the path business. The page holds an active-business lease (a ref kept in step with the business context): a read commits, or starts, only while its business still holds it, and rendered data carries the business it was read for and is shown only while that business is active — so no render, not even a transition frame, pairs one business's chains, recommendations or forms with another active business.
- A write that began under Business A may commit server-side after the owner moved to Business B. It is never cancelled or rolled back, but its follow-up read is refused (it neither reloads A nor advances the request generation), so B's page is untouched.

## 7. Not in scope (carried forward, unchanged)

- Finance learning decision-id migration: `FINANCE_LEARNING_DECISION_ID_MIGRATION=DEFERRED`.
- Manual measurement ("tell us whether this worked"): not offered — an owner's opinion is not independent verification. With no after-evidence the stage reads "Needs follow-up data" or the exact state Core produced.
- Undecided legacy process-task chains (`process_task:<id>`) are not owner decisions and are not listed here. The process-task link endpoint is not exposed in this UI.
- Autonomous learning, ranking and recommendation changes: none.

## 8. Release evidence debt

`PR596_AUTHENTICATED_SMOKE=DEFERRED_NO_COMPUTER` — the owner currently has no computer/browser session, so the authenticated production smoke for PR #596 has not been run. It is neither passed nor failed, and nothing here marks `PR596_RELEASE_GATE` as PASS. The release plan for Timeline v1 must account for it before this change is merged or deployed.
