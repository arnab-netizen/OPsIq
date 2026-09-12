# Multi-Actor Throughput Proof — depth pass (PASS 14)

Proves that owner, manager, staff/operator, the OpsIQ system, and an external-advisor placeholder interact
across a realistic laundry workload WITHOUT bypassing governance, corrupting workspace boundaries, flooding
the owner, or allowing fake completion. It composes the already-governed write paths end to end against real
Postgres — role boundaries and hostile cases, not just many rows.

## 1. PASS 13 merge status
Merged — PR #146 squashed to main `ad51dcd3`.

## 2. Branch
`claude/multi-actor-throughput-proof-depth-pass`

## 3. Main HEAD before
`ad51dcd3` (PASS 13 merged).

## 4. HEAD after
This PR's head.

## 5. Files changed
- `src/__tests__/execution/multi-actor-throughput-simulation.db.test.ts` (created) — 11-case multi-actor DB simulation.
- `.github/workflows/db-verification.yml` (changed) — wired the sim into LANE_B + LANE_A explicit lists.

## 6. Schema changed
None. PASS 14 composes existing governed models/services (Proof, ProofRiskAdjudication, OwnerReassessmentEvent, ExternalOpportunitySignal, OpportunityExecutionTask, OpportunityValidationOutcome) — no new tables, no migration.

## 7. Actors represented
- **Owner** — records the owner-approval task, adjudicates the disputed proof, records validation outcomes.
- **Manager** — completes the cost-data delegation with evidence; disputes the staff proof; blocked from completing owner-approval tasks.
- **Staff/operator** — submits the proof; blocked from fake-completing an evidence-required task.
- **OpsIQ (SYSTEM)** — derives execution tasks with correct action owners; surfaces the single top action.
- **External-advisor placeholder** — the derived `EXTERNAL_ADVISOR_REVIEW` task on tender compliance uncertainty (advisory only).

## 8. Flows proven
Owner submits B2B + high-cash-exposure + tender opportunities → OpsIQ derives execution tasks with the right owners → manager completes cost-data with evidence → owner completes the owner-approval task → owner records a PASSED validation outcome → portfolio reflects it. Staff→manager→owner proof integrity: manager disputes a staff proof, owner adjudicates (CONFIRM_SUSPICIOUS_PATTERN → CONFIRMED).

## 9. Hostile cases proven
1. Staff fake completion with NO evidence → task stays IN_PROGRESS (no fake completion).
2. Manager cannot complete an OWNER_APPROVAL_REVIEW task → fail closed, no write.
3. Duplicate opportunity signal → collapses at intake (one row; no cockpit flood).
4. Validation cannot PASS without evidence (fake pass rejected).
5. Workspace isolation — a clean workspace fabricates nothing across every subsystem (execution, outcomes, proofs).

## 10. Owner cockpit behavior
The cockpit surfaces exactly one top execution action (anti-overload); the serialized execution block carries no fraud/HR-discipline labels, no fabricated money/percent, no hidden score, no win-probability.

## 11. Tests added
`multi-actor-throughput-simulation.db.test.ts` — 11 cases (action-owner derivation; duplicate collapse; manager evidence completion; staff fake-completion blocked; manager-blocked owner-approval; owner completes owner-approval; staff→manager→owner proof integrity; validation→portfolio; fake-pass rejected; single top action + no prohibited labels; workspace isolation).

## 12. DB sim result
**11 passed (11)** against a throwaway local Postgres 16 (`prisma migrate deploy` + full run).

## 13. DB sim CI execution proof
Wired into the LANE_B + LANE_A explicit file lists in `db-verification.yml` (grep count 2). LANE_B runs the explicit list and prints `LANE_B_DB_VERIFIED` only when every listed file passes; the executed Test-Files count rises by one with this file present.

## 14. Commands run
`prisma validate` / `prisma generate` · `tsc --noEmit` (clean) · `governance:scan:strict` (31 frozen / 0 new) · `lint:ratchet` (PASS) · local Postgres 16 `migrate deploy` + vitest sim (11/11).

## 15. Commands failed/blocked
Two authoring fixes during local de-risk: wrong cleanup model names (`proofDispute` does not exist; reassessment is `ownerReassessmentEvent`) and a duplicate-collapse assertion that keyed on the wrong field — both fixed; re-run 11/11 green.

## 16. CI status
Pending the PR CI gate (LANE_B required).

## 17. PR/merge status
Open — pending CI gate.

## 18. Main HEAD after merge
To be recorded on merge.

## 19. Exact next safest pass
STOP after PASS 14 per the governing loop. The next safest future pass (not started here) would be a bounded **owner-notification / digest** pass surfacing the single top action across sessions — still no billing, no public SaaS, no Level 3 hostile gate.

## Classification
MULTI_ACTOR_THROUGHPUT_PROOF_REAL — all required actors are represented, role boundaries are enforced,
weak-proof/fake-completion/rubber-stamp attempts are handled, opportunity/tender/validation/portfolio flows
are included, workspace isolation holds, the owner cockpit stays anti-overload, and the DB sim runs green
(locally proven; wired for CI). No unsafe auto-approval, no auto-submit, no scale-before-validation.
