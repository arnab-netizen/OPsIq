# Owner Proof-Risk Adjudication — REPORT

**Classification:** `OWNER_PROOF_RISK_ADJUDICATION_REAL_AND_OWNER_VISIBLE`
(+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## A. Files created
- `src/domain/execution/proof-risk-adjudication.ts` — pure outcomes + validation + effect map.
- `src/services/execution/proof-risk-adjudication.service.ts` — governed service + read.
- `src/app/api/proof-risk/adjudicate/route.ts` — `POST /api/proof-risk/adjudicate`.
- `prisma/migrations/20260705160000_proof_risk_adjudication/migration.sql` — new table.
- `src/__tests__/execution/proof-risk-adjudication.test.ts` — 10 unit tests.
- `src/__tests__/execution/proof-risk-adjudication-simulation.db.test.ts` — 4 DB simulation tests.
- Docs under `docs/remediation/owner-proof-risk-adjudication-depth-pass/`.

## B. Files changed
- `prisma/schema.prisma` — `ProofRiskAdjudication` model.
- `src/domain/constants/audit-events.ts` — `PROOF_RISK_ADJUDICATED`.
- `src/services/owner-guidance/owner-now-view.service.ts` — adjudication dep; suppress cleared
  reused-hash findings from surfacing + from the anti-gaming/credibility feed; expose
  `proofRiskAdjudications` block.

## C. Schema changes
New `proof_risk_adjudications` table (additive, backfill-safe, non-destructive) with a UNIQUE
`(workspace_id, idempotency_key)`. No change to existing tables.

## D. Backend logic
Pure validation + effect map → governed service (authz + workspace + proofIds membership + atomic
audit + idempotent upsert + reassessment for keep-risk outcomes) → route → now-view suppression/exposure.

## E. Frontend logic
None (owner-callable route + now-view payload; no UI this pass).

## F. Adjudication outcomes supported
All 7: REQUIRE_FRESH_PROOF, ACCEPT_AS_VALID, DISMISS_FALSE_POSITIVE, CONFIRM_SUSPICIOUS_PATTERN,
ESCALATE_FOR_TRAINING, ESCALATE_FOR_OWNER_REVIEW, MARK_INCONCLUSIVE_NEEDS_DATA.

## G. Acceptance criteria
- Owner-callable service + API; ≥ the 4 core outcomes (all 7 supported). ✓
- Workspace + authorization checks; reason + outcome required (fail closed). ✓
- proofIds verified in-workspace; no cross-workspace refs. ✓
- Atomic audit (`proof_risk.adjudicated`); idempotent on the key (identical no-op, changed update). ✓
- Now-view reflects adjudication status; cleared findings stop re-surfacing; confirmed stay visible. ✓
- No fraud/theft label (rejected in the reason too); no hidden score; no evidence deleted. ✓

## H. Known limitations
- Now-view suppression is implemented for the concrete per-proof `REUSED_HASH_FINDING` source; the
  other three source types are recorded + exposed but not auto-suppressed (they are re-derived each read
  and remain visible until their underlying evidence clears).
- No UI; owner adjudicates via the route.
- Reassessment uses the existing `evidence_retraction` trigger (idempotent, keyed to the source proof).

## I. Trigger map
reused-hash NEEDS_REVIEW → now-view surfaces it → `POST /api/proof-risk/adjudicate` →
record + `proof_risk.adjudicated` audit → REQUIRE_FRESH/CONFIRM keep the risk visible (+ reassessment);
ACCEPT/DISMISS/TRAINING clear it → now-view suppresses re-surfacing.

## J. Failure modes covered
Missing outcome / reason / sourceRef (fail closed); fraud-word reason (rejected); cross-workspace proof
(fail closed); repeated submit (idempotent no-op); changed outcome (governed update + audit); clean
workspace (no adjudication).

## K. Events emitted
`proof_risk.adjudicated` (payload: sourceType, sourceRef, idempotencyKey, outcome, status, proofIds,
actorIds, adjudicatedByRole, ownerActionRequired, updated).

## L. Automated tests
14 new (4 domain + 6 service + 4 DB simulation). Changed-area suites green.
