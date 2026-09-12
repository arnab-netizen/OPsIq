# Minimal Per-Event Complaint / Rework Model + Proof Linkage — PLAN

**Branch:** `claude/complaint-rework-event-linkage-depth-pass`
**Base:** `origin/main` @ `9381efab` (Dispute → Profit/Constraint Wiring, PR #116, merged).

## Objective
Build the minimum per-event complaint/rework model + proof linkage so the business impact of bad
accepted work becomes **measurable** — closing the "no per-event complaint/rework model" gap that
kept proof→complaint NOT_MEASURABLE and financial impact qualitative. Deliberately NOT a CRM /
ticketing / refund / customer-profile / messaging module.

## Model (one minimal generic table)
`OperationalEvent` handles both COMPLAINT and REWORK via `eventType` (no ambiguity): workspaceId,
relatedProofId?, relatedActionId?, category, severity, status, source, description, occurredAt?
(user-reported, untrusted), createdAt (server-trusted), estimatedImpactAmount?, impactCurrency?,
impactConfidence (MEASURED|ESTIMATED|NEEDS_DATA). Additive, backfill-safe migration (new table).

## Categories (conservative)
Complaint: QUALITY_COMPLAINT, DELIVERY_COMPLAINT, DAMAGE_OR_LOSS, WRONG_ITEM, LATE_SERVICE,
BILLING_OR_PRICING, CUSTOMER_DISSATISFACTION, OTHER.
Rework: REWASH, REDO_PRESSING, REDELIVERY, REPAIR_OR_CORRECTION, CUSTOMER_RETURN, QUALITY_RECHECK,
OTHER. No category is inferred from vague text — the caller supplies it; invalid pairs fail closed.

## Category → business-risk
Complaint → COMPLAINT_REVENUE_RISK + (QUALITY | DELIVERY | PRICING). Rework → REWORK_REDO_COST +
(QUALITY | DELIVERY). Financial impact is carried ONLY when a real amount is supplied (else
NEEDS_DATA) — never fabricated.

## Service + API
`recordOperationalEvent`, `linkOperationalEventToProof`, `getComplaintReworkLinks` (governed,
audited, workspace-scoped, fail-closed, idempotent). Minimal route `POST /api/complaint-rework`
(`action: record | link`) behind canonical enforcement + a proof-review permission.

## Integration (no orphan path)
- **Proof-Outcome Linkage:** proof→complaint / proof→rework flip from NOT_MEASURABLE to LINKED when
  events are linked to accepted proof; folded into the integrity measurement.
- **Business-Control SLO:** `PROOF_OUTCOME_INTEGRITY` consumes linked complaint/rework.
- **Evidence Credibility:** `ACCEPTED_PROOF_WITH_COMPLAINT` / `ACCEPTED_PROOF_WITH_REWORK` fire per submitter.
- **Profit-Leak Radar:** linked complaint → COMPLAINT_REVENUE_RISK; rework → REWORK_REDO_COST; a
  supplied impact amount makes the impact MEASURED, else qualitative.
- **Constraint Engine:** linked quality complaint/rework → QUALITY.
- **Owner Now View:** the linked event surfaces via topProfitLeak / topConstraint / topCredibilityConcern
  + a `complaintReworkLinks` block; reassessment stays idempotent (via the existing dispute flow).

## Honesty
No fabricated complaint/rework rows (they are recorded by a governed service); no fabricated
financial impact (NEEDS_DATA unless a real amount is supplied); server `createdAt` is the trusted
time; workspace-scoped with isolation tested.
