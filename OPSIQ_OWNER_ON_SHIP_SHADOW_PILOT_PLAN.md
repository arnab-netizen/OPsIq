# OpsIQ Owner-on-Ship Shadow-Pilot Plan

> "Owner on ship" = the owner is remote, time-poor, and the business runs on staff + partial data. This plan prepares
> a SHADOW pilot (OpsIQ observes + recommends; the owner/staff act) for a laundry / dry-cleaning / local-service
> operation. It is preparation only — **no live-outcome claim**. OpsIQ must reduce owner workload and must not create
> a heavy data-entry burden. All gating below is the already-proven owner runtime (action-status policy + arbitration
> + SupervisorSummary), not new logic.

## Operating assumptions
1. Owner is remote. 2. Owner has limited time. 3. Business data is partial. 4. Staff information is imperfect.
5. OpsIQ must reduce owner workload. 6. OpsIQ must not create a heavy data-entry burden.

## What OpsIQ can decide / must owner-gate / must block (shadow = recommend only)
| OpsIQ CAN decide (recommend "proceed") | Must OWNER-GATE (owner_decision_required) | Must BLOCK (route out) |
|---|---|---|
| Routine, reversible, SOP-covered steps: confirm standard orders, in-policy reorders, small within-policy courtesies, routine reconciliation, on-time delivery scheduling | Material spend/pricing changes, hiring/headcount, supplier switches, B2B contract terms, capex, discount-policy resets, drawing cash buffer, layoffs | Insolvency-line moves, withheld-tax diversion, wage-law breach, unsafe/irreversible actions, legal/compliance boundaries, confirmed fraud/gamed proof |
Even a "proceed" is a *recommendation* in shadow mode — staff/owner execute; OpsIQ records expected vs actual.

## Phase 1 — First 7 days (baseline + trust)
- **Data requested first (Tier A intake):** 3–6 mo revenue, fixed costs, receivables/payables, cash obligations +
  safety threshold, owner standing instructions, owner availability. Plus Tier B daily order counts + complaints.
- **Staff can upload:** daily order counts, service mix, complaints, rework/refund, delivery logs, attendance, proof photos.
- **Owner must approve:** standing instructions, the min-cash safety threshold, any owner-gated recommendation.
- **What OpsIQ does:** builds the financial + workload + complaint baseline; produces a daily SupervisorSummary
  (one screen); flags missing Tier-A data as `need_more_data`; owner-gates every material item.
- **Proof required:** each recommended routine action carries a proof requirement (photo/receipt/log); no action is
  "done" without it.
- **Expected outcomes tracked:** each recommendation stores its expected decision + expected impact (expected-only).
- **Actual outcomes recorded:** staff mark done + upload proof; owner confirms owner-gated items.
- **Reassessment:** end-of-day + end-of-week trigger re-runs the plan as new figures arrive.
- **Success:** baseline exists; owner touches only material calls; ≤ a few minutes/day of owner time.
- **Failure:** OpsIQ over-escalates routine items, or asks for data staff can't give → tune SOP/standing instructions.

## Phase 2 — First 14 days (trend + owner-workload reduction)
- Add Tier B/C: consumables, vendor bills, machine list, discounts, repeat data, review samples.
- OpsIQ detects early **slow-leakage** signals (margin/complaint/cash drift) — surfaces `need_more_data` first, then
  `owner_decision` once a trend is confirmed (never reacts to noise).
- Owner-workload metric tracked: share of items OpsIQ handled as routine vs escalated; goal is fewer owner touches
  per week than week 1.
- **Success:** confirmed trends escalate correctly; routine load stays off the owner. **Failure:** trend confirmed
  late or noise escalated → adjust thresholds via governed reassessment, not by weakening gates.

## Phase 3 — First 30 days (full loop + expected-vs-actual)
- Full expected-vs-actual loop per recommendation: expected decision/impact vs recorded actual (still expected-only
  at the corpus level; the pilot records real actions but does NOT yet constitute a proven live *profit* result).
- Weekly review cadence: OpsIQ produces the weekly plan; owner reviews material calls in one sitting.
- **Success:** OpsIQ's per-step decisions match what a good operator would do; owner time stays low; no unsafe action
  reached "proceed"; blocked/owner-gated items were correctly routed.
- **Failure / stop-or-reset triggers:** repeated wrong escalations, staff unable to sustain proof capture, owner
  unable to keep min-cash data current, or any unsafe action nearly slipping through → pause, reset baseline, fix
  intake/SOP, resume. Never respond by loosening a gate.

## Data-burden guardrails
- Staff upload is photo/log-first (no typing-heavy forms); owner input is a short one-time standing-instruction set +
  periodic approvals. Missing optional data degrades depth, never blocks the whole plan.

## Explicit non-claims
This plan does **not** claim a live outcome or profit result, does **not** make OpsIQ autonomous (every material call
is owner-gated; unsafe calls block), and does **not** unblock public SaaS. It is shadow-pilot preparation only.
