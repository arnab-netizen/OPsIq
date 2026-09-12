# Current Status Update — Owner Proof-Risk Adjudication

- **Base:** `origin/main` @ `7ebfeb74` (Reused-Hash Proof Precheck, PR #120, merged).
- **Branch:** `claude/owner-proof-risk-adjudication-depth-pass`.
- **Classification:** `OWNER_PROOF_RISK_ADJUDICATION_REAL_AND_OWNER_VISIBLE`
  (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## Adjudication outcomes supported
`REQUIRE_FRESH_PROOF`, `ACCEPT_AS_VALID`, `DISMISS_FALSE_POSITIVE`, `CONFIRM_SUSPICIOUS_PATTERN`,
`ESCALATE_FOR_TRAINING`, `ESCALATE_FOR_OWNER_REVIEW`, `MARK_INCONCLUSIVE_NEEDS_DATA` (over sources:
`REUSED_HASH_FINDING`, `ANTI_GAMING_SIGNAL`, `CREDIBILITY_CONCERN`, `PROOF_DISPUTE`).

## Owner-callable route/service
- `POST /api/proof-risk/adjudicate` (canonical enforcement + `PROOF_REVIEW_LOW_RISK`).
- `adjudicateProofRiskFinding` / `getProofRiskAdjudications`.

## What the owner can use now
Record a fair, audited decision about a flagged reused/fake/suspicious proof finding — with a required
reason, no fraud/theft language, no hidden score, no deleted evidence, and no rewrite of proof status.
Idempotent on `(workspace, key)`: an identical resubmit is a no-op; a changed decision is a governed
update with a fresh audit. Results appear on `/api/owner/now-view` as `proofRiskAdjudications`.

## SLO / integration impact
- Now-view: a CLEARING decision (accept / dismiss / training) suppresses the reused-hash finding from
  re-surfacing (and from the anti-gaming + credibility feed) → owner noise drops and
  `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` ease when no other evidence remains.
- CONFIRM / REQUIRE_FRESH keep the finding visible (risk stays), and maintain a governed reassessment.

## What remains missing
- Now-view auto-suppression is wired for the concrete `REUSED_HASH_FINDING` source; the other three
  source types are recorded + exposed but not auto-suppressed yet.
- UI (owner adjudicates via the route today).
- Browser E2E.

## Remaining restrictions
Adjudication records a decision about the finding — never a fraud/theft verdict, payroll/termination
recommendation, or hidden staff score. Cross-workspace refs are rejected.

## Next safest implementation order
1. Extend now-view auto-suppression to ANTI_GAMING_SIGNAL / CREDIBILITY_CONCERN / PROOF_DISPUTE sources.
2. A minimal owner UI surface for the adjudication queue.
3. Then Process Intelligence over the full proof → precheck → dispute → adjudication chains.

## Out of scope (per instructions)
Process Intelligence; public SaaS / Product Hunt / billing; HR discipline tooling; hidden staff scores.
