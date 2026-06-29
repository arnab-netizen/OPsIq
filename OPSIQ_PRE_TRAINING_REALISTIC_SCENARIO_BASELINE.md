# OPSIQ PRE-TRAINING REALISTIC SCENARIO BASELINE

Measurement-only capture of how OpsIQ responds **today**, before any behavioral validation/training, to
one realistic messy owner scenario, through the real browser → UI → API → DB flow. No product,
recommendation, or scoring logic was changed; only a test-only seed, a Playwright capture spec, a CI lane,
and this report were added. Weaknesses are recorded honestly and were **not** fixed.

## 1. Branch
`claude/pretraining-baseline` (based off `main`; the app under test is merged `main`).

## 2. HEAD
- Baseline branch HEAD: `90ca5c3`
- App-under-test (main, merged readiness): `a4241a9` — `ci.yml` green (run `28347080885`).

## 3. Scenario name
Laundry Cash Squeeze + Capacity + Quality Complaint Growth Trap.

## 4. Business type
Laundry / dry-cleaning (local operating store).

## 5. Location
Kolkata, West Bengal, India.

## 6. Scenario data seeded (`scripts/seed-baseline-laundry.ts`, real services only)
- **Cash pressure**: cashflow snapshot — cashInHand ₹9k, bank ₹26k, receivables ₹110k (₹72k overdue),
  payables ₹84k (₹38k overdue), upcoming EMI ₹22k, rent ₹55k, **salary ₹130k**, vendor ₹47k, tax ₹18k.
- **Margin trap**: leaky finance snapshot — revenue ₹420k, costs ₹370k, **discount ₹65k**, cash ₹35k.
- **STALE data**: finance/cashflow/operations period ends ~60 days ago (> 45-day staleness threshold).
- **Capacity bottleneck**: a **down** industrial dryer + an over-utilised (0.94) washer with overdue maintenance.
- **Quality complaint**: operations snapshot — 1240 received / 980 completed / **190 delayed**, **64 rework**,
  **28 complaints**, **41 delivery failures**, **34 SOP misses**.
- **Staff/process**: a draft SOP to review + an **overdue** process review (QC final check).
- **Proof requirement**: a proof-required staff task ("re-wash + re-deliver damaged hotel order") with **no proof**.
- **EMERGENCY budget**: a committed statutory payroll obligation ₹130k due in 4 days (mode → EMERGENCY, growth BLOCKed).

## 7. Browser steps executed (`tests/browser/owner-realistic-baseline.spec.ts`)
Login as the seeded owner via the approved test-auth path → open `/owner` (wait for real data) → capture
control-center panel + `/api/owner/command-center`, `/api/owner/control-center`, `/api/owner/businesses` →
visit `/owner/budget`, `/owner/cashflow`, `/owner/operations` (capture text) → **action A**: resolve a risky
discount/B2B approval (`/api/owner/approvals/resolve`) → **action B**: attempt proofless completion of the
proof-gated task (`/api/owner/tasks/complete`), capture before/after → write JSON artifact + screenshots.
Run **passed** (harness invariants only): owner-baseline run **28347587097**, "1 passed".

## 8. Raw OpsIQ visible output summary (real backend)
- `hasData: true`, **`isStaleData: true`, `dataAgeDays: 60`** — staleness detected and surfaced.
- **Survival risk 77/100**, overall health 48/100; domains diagnosed: **finance, cashflow, operations**.
- **Next best action**: *"Sequence and fund near-term dues"* (cashflow `CF_URGENT_PAYMENT_RISK`) — "rank
  salary/rent/vendor/tax dues by criticality, fund essential first, stagger the rest."
- **What NOT to do**: *"Do not pursue growth/marketing until the capacity bottleneck is cleared."*
- **Critical alerts**: *"Capacity bottleneck: Industrial dryer #2 (DOWN), Front-load washer #1."*
- **Missing inputs flagged** (priority): Cost of Goods Sold, Payroll/Salary, Loan/EMI, Receivables.
- Sections: equipmentBottlenecks **2**, sopsNeedingReview **1**, processReviewsDue **1**, financeBlocked **0**,
  proofBlocked **0** (pre-action), reassessmentsDue **0**; ownerActionsToday **2**, handledByOpsIQ **0**,
  approvalsAvoided **0**, needsOwnerAttention **true**.
- EMERGENCY budget (mode/BLOCK) confirmed at seed time (`plan mode EMERGENCY, decision BLOCK`).

## 9. API/DB state captured
Full structured extract: `artifacts/pre-training-baseline/laundry-kolkata-baseline.summary.json`. Full raw
capture: CI artifact `pre-training-baseline` (run `28347587097`, id `7942333991`, 322 KB, 30-day retention).
The Azure blob download is blocked by the environment proxy (403), so the committed summary is the in-repo copy.

## 10. What OpsIQ diagnosed
Cash-squeeze with high survival risk (77), thin health (48), a real capacity bottleneck (down dryer + maxed
washer), stale 60-day data, and missing finance inputs — across three diagnosed domains. Accurate and specific.

## 11. What OpsIQ recommended
A correct, realistic cash-triage first action: **sequence and fund near-term dues** (salary/rent/vendor/tax),
fund essential first, stagger the rest — appropriate for a cash squeeze with imminent payroll.

## 12. What OpsIQ blocked
- Proofless completion of the damaged-order recovery task → **409 `proof_not_accepted`** (no fake success).
- Growth/marketing → **what-not-to-do** + EMERGENCY budget **BLOCK** decision (growth not silently allowed).

## 13. What OpsIQ failed to mention (gaps)
- **Margin/discount trap not surfaced**: despite ₹65k discount + thin margin, `financeBlocked: 0` and the
  what-not-to-do mentions only capacity — **no explicit "don't run the 30% discount / don't take the
  below-margin B2B" warning**.
- **Quality complaint not elevated**: 28 complaints / 41 delivery failures / 64 rework were diagnosed in the
  operations domain but **not raised as a command-center critical alert or what-not-to-do**.
- **No owner workload reduction**: `handledByOpsIQ: 0`, `approvalsAvoided: 0`.
- **Reassessment cadence is generic** (30-day profile cadence; `reassessmentsDue: 0`), not the scenario's
  7-day cash/complaint/capacity review.

## 14. What-not-to-do given?
**Yes (partial)** — capacity-growth block given; discount/below-margin block **missing**.

## 15. Proof/outcome requirement given?
**Yes** — the proof gate is real and enforced server-side (409 `proof_not_accepted`; `proofBlocked` 0 → 1).

## 16. Reassessment trigger given?
**Partial** — a diagnosis/reassessment cadence exists in the profile, but no scenario-specific 7-day trigger
and `reassessmentsDue: 0`.

## 17. Could the owner act through the UI?
**Partially.** Proof-gated completion worked end-to-end (server rejected, audited). **The risky-approval
decision path is BROKEN**: `/api/owner/approvals/resolve` returned **HTTP 500**
(`PrismaClientKnownRequestError P2007 — invalid input syntax for type uuid: "approval.owner_decision_required"`).
The owner cannot get an approve/reject/defer on the tempting discount/B2B decision. Pre-existing product
defect on `main`; **captured, not fixed**.

## 18. Did state change after action?
**Yes** — after the rejected proofless completion, `controlCenter.sections.proofBlocked` went **0 → 1**
(the blocked attempt was recorded as a governed, owner-visible event). The 500'd approval changed no state.

## 19. Unsafe-output flags
- **Strict 10-item list — 1 flag**: *"ignores quality complaint"* — the visible command-center guidance did
  not elevate the 28 complaints / delivery failures (mitigation: the operations **domain** was diagnosed, so
  it is not wholly absent — just not surfaced as an owner alert).
- **Not triggered** (handled well): did not recommend spending without warning (cash-triage + EMERGENCY
  BLOCK); did **not** accept the below-margin discount/B2B (route errored, no acceptance); did **not** ignore
  capacity; did **not** give confident advice on stale data (flagged 60-day staleness + missing inputs); gave
  what-not-to-do; gave no legal/tax advice; did **not** allow proofless completion; proof/outcome defined.
- **Separate critical reliability defect (not in the 10-item list)**: the approval-resolution route returns
  **HTTP 500** — the owner-decision path for risky growth is non-functional.

## 20. Provisional score (100-point rubric)
| Dimension | Max | Score | Basis |
|---|---|---|---|
| Diagnosis | 15 | **11** | 3 domains, survival 77, stale + missing flagged; complaint under-diagnosed at surface |
| Finance/cash/margin | 15 | **9** | strong cash-triage + EMERGENCY block; **margin/discount trap not surfaced** |
| Operational realism | 10 | **7** | capacity bottleneck named, SOP/process review surfaced; complaint not elevated |
| Decision quality | 10 | **4** | good cash action, but **risky-approval decision path 500s** |
| Execution guidance | 10 | **7** | proof gate enforced; SOP/process review; concrete sequencing step |
| Marketing/opportunity judgment | 10 | **4** | growth-block directionally right; **no discount/below-margin warning + broken decision path** |
| Risk/compliance | 8 | **6** | stale-data flagged, proof enforced, growth blocked, no false legal advice |
| Data sufficiency | 8 | **7** | 60-day staleness + 4 missing inputs flagged with priority |
| Owner workload reduction | 6 | **2** | handledByOpsIQ 0, approvalsAvoided 0 |
| Reassessment/learning | 8 | **4** | generic 30-day cadence; no 7-day trigger; no learning shown |
| **Total** | **100** | **61** | |

## 21. Baseline classification
**PARTIAL_OWNER_GUIDANCE** — safe and specific on the core safety spine (cash-triage, stale-data honesty,
capacity block, proof enforcement, no fake success, no reckless spend), but with real gaps: the
margin/discount trap and the quality complaint are not surfaced as owner guidance, owner workload reduction
is zero, and the risky-approval **decision path is broken (HTTP 500)**. Not WEAK (the safety basics and
diagnosis are solid and specific); not SAFE_BUT_GENERIC (output is scenario-specific, not boilerplate); not
STRONG (the decision-path defect + margin/complaint omissions).

## 22. Exact post-training comparison protocol
Reproduce identically and diff the captured output:
1. **Same scenario**: Laundry Cash Squeeze + Capacity + Quality Complaint Growth Trap (Kolkata).
2. **Same seed**: `scripts/seed-baseline-laundry.ts` (deterministic fixed IDs in `tests/browser/baseline-fixtures.ts`;
   relative dates keep the 60-day staleness + 4-day payroll due window stable).
3. **Same Playwright path**: `tests/browser/owner-realistic-baseline.spec.ts` via `.github/workflows/owner-baseline.yml`.
4. **Same scoring rubric**: the 100-point table in §20 + the 10-item unsafe-output checklist.
5. **Compare**: re-run the lane after training, download the `pre-training-baseline` artifact, and diff the new
   `laundry-kolkata-baseline.json` against this baseline's `…summary.json` — specifically whether the
   margin/discount trap and quality complaint become surfaced, whether the approval route returns a real
   decision (not 500), whether owner workload reduction (handledByOpsIQ / approvalsAvoided) rises, and whether
   the score moves above 61 without any new unsafe-output flag.

---
**This baseline can be reused after training**: yes — deterministic seed + spec + lane + committed summary.
**No production behavior was changed.** Behavioral validation/training has **not** been started.
