# OpsIQ Owner Mode — Real Business Pilot Checklist

**Version:** 1.0  
**Applies to:** Controlled real-business Owner Mode pilots before public SaaS release  
**Supported business types:** Laundry/dry-cleaning · Commercial housekeeping · Boutique/clothing · Food/beverage · Local service business

---

## 1. Required Business Inputs

Before Owner Mode can function correctly, the following business data must be present:

| Input | Required | Notes |
|---|---|---|
| Business legal name | ✓ | As registered |
| Business type / industry category | ✓ | Must map to a supported category |
| Monthly revenue (last 3 months) | ✓ | Actuals preferred; estimates flagged |
| Gross margin % | ✓ | Needed for profitability diagnosis |
| Net profit / loss (last 3 months) | ✓ | Actuals or owner estimate |
| Cash balance (current) | ✓ | Bank balance on first pilot day |
| Cash runway estimate (months) | ✓ | Months of operating expenses covered |
| Number of active leads or inquiries/month | ✓ | Any lead-generation channel |
| Lead conversion rate % | ✓ | Estimate acceptable for pilot start |
| Number of active clients or customers | ✓ | Headcount; recurring vs one-off noted |
| Primary revenue model | ✓ | Per-job, subscription, retail, hybrid |
| Owner time commitment (hours/week) | ✓ | Realistic working hours available |
| Number of employees (FTE + PT) | ✓ | Needed for capacity diagnosis |
| Key dependencies (people or suppliers) | ✓ | Single points of failure |
| Any current critical blockers | ✓ | Known problems owner is already aware of |

Optional but strongly encouraged:
- Customer acquisition cost (CAC)
- Average transaction value / average order size
- Repeat customer rate
- Outstanding receivables (AR aging)
- Outstanding payables due in 30 days

---

## 2. Input Quality Checklist

Before beginning the first diagnosis cycle, verify:

- [ ] All required fields in Section 1 are present (no blank entries)
- [ ] No required field is marked "unknown" — estimate with confidence level if actual unavailable
- [ ] Revenue and margin figures are from the same time period (do not mix quarters)
- [ ] Cash balance was verified within the last 7 days
- [ ] Conversion rate is based on at least 3 months of data, or flagged as estimated
- [ ] Owner has reviewed all inputs and confirmed they are reasonable
- [ ] No field is marked "coming soon" or "TBD"
- [ ] Business type is selected from the supported list — no custom freeform type
- [ ] Owner understands that AI uses these inputs to generate a diagnosis; inputs drive output quality
- [ ] Freshness labels assigned: `current` (≤30 days), `stale` (31–90 days), `historical` (>90 days)

Input quality classification (system-assigned):
- **High quality**: All required fields present, all current or recent, no estimates on financial figures
- **Medium quality**: All required fields present; 1–2 stale fields or 1–2 estimates
- **Low quality**: Missing required fields OR majority of financial data is estimated
- **Insufficient**: Too many unknowns for reliable diagnosis — pilot blocked until resolved

---

## 3. First 30-Day Operating Cadence

### Week 1 — Baseline and Orientation
| Day | Action | Owner Responsibility |
|---|---|---|
| 1 | Submit all required business inputs | Owner submits; OpsIQ does not pre-fill |
| 1 | Review input quality score | Owner confirms or corrects inputs |
| 2 | Review initial diagnosis | Owner reads diagnosis; does not act yet |
| 2 | Review initial recommendations | Owner reads all recommendations before deciding |
| 3–4 | Make first owner decision (accept/reject/modify) | Owner decision required; system waits |
| 5–7 | Begin executing accepted actions | Owner or designated team member |

### Week 2 — First Execution Check
- Owner logs execution progress on each accepted action
- Any blocked action must be flagged with a blocker reason
- No new recommendations acted on until Week 1 actions are at least 50% progressed
- First evidence submission if any action is fully complete

### Week 3 — Evidence and Mid-Cycle Review
- Owner submits evidence for completed actions (receipts, screenshots, updated metrics, customer feedback)
- OpsIQ presents evidence for owner verification (owner verifies; AI does not verify independently)
- Outcome assessment begins for any fully executed action with verified evidence
- Dashboard review: owner reviews stage status across all loop phases

### Week 4 — Outcome Assessment and Cycle Close
- Outcome reported for all completed and verified actions
- Any harm or unexpected negative outcome flagged immediately
- Adjudication of any contested outcomes
- Learning eligibility assessed for completed cycle
- Owner decision on reassessment if required
- Prepare inputs for next cycle (updated revenue, cash, metrics)

---

## 4. Minimum Metrics

The following metrics must be trackable for Owner Mode to produce meaningful outcomes:

**Financial (minimum set):**
- Monthly revenue (actual or close estimate)
- Gross margin % (actual or close estimate)
- Cash balance (actual, monthly)

**Operational (minimum set, varies by business type):**

| Business Type | Key Operational Metrics |
|---|---|
| Laundry / dry-cleaning | Jobs per week, average job value, repeat customer %, turnaround time |
| Commercial housekeeping | Contracts active, revenue per contract/month, client churn rate, staff utilization % |
| Boutique / clothing | Units sold/week, average basket size, inventory turnover, foot traffic or sessions |
| Food / beverage | Covers per day or orders per day, average check, food cost %, table/order turn rate |
| Local service business | Jobs booked/week, booking conversion %, no-show rate, revenue per job |

**Lead / demand (minimum set):**
- New inquiries or leads per month
- Conversion rate (leads to paying customers)

If any minimum metric is unavailable, that metric must be flagged as missing and the corresponding diagnosis stage will be marked `missing_data`.

---

## 5. Owner Decision Process

Owner Mode decisions are always made by the human owner. The system never decides on behalf of the owner.

**Step 1 — Recommendation presented**  
OpsIQ presents a recommendation with: recommendation text, rationale, expected outcome, confidence score, risk level, supporting evidence references, and assumptions.

**Step 2 — Owner review period**  
Owner has a defined review window (default: 48 hours for medium/high priority; 7 days for low priority) before the recommendation times out of the active queue.

**Step 3 — Owner decision options**
- **Accept**: Owner agrees to execute as recommended
- **Accept with modification**: Owner accepts intent but modifies scope, timing, or method
- **Reject**: Owner rejects with a required reason (system records the reason)
- **Defer**: Owner defers to a specified future date (tracked; re-surfaces automatically)

**Step 4 — Decision recorded**  
Owner decision is recorded with timestamp, decision status, decision reason, and the owner's own risk assessment.

**Step 5 — Action created (if accepted)**  
On acceptance, an action plan is created with owner-defined or system-suggested steps, due dates, and assignees.

**Owner decision constraints:**
- Owner must provide a reason for rejection (no silent rejections)
- Defer limit: maximum 2 deferrals per recommendation before it is escalated to owner attention
- Conflicting decisions (accepting two contradictory recommendations) are flagged for owner resolution
- Owner may not retroactively change a completed decision; they may initiate a reassessment instead

---

## 6. Action Tracking Process

**Creating an action:**
- Stems from an accepted owner decision
- Contains: action name, description, planned steps, due date, assignee (owner or team member), priority

**During execution:**
- Owner (or assignee) logs progress at each checkpoint
- Blockers must be logged immediately when encountered, with blocker reason and severity
- Partial completion tracked as: planned steps completed / total planned steps

**Action status progression:**
`draft → assigned → in_progress → [blocked] → completed → verified`

- `draft`: Created, not yet assigned
- `assigned`: Assigned to owner or team member
- `in_progress`: Active work underway
- `blocked`: Cannot proceed; blocker logged
- `completed`: Owner marks complete; awaiting evidence submission
- `verified`: Evidence submitted and owner-verified

**Overdue actions:**
- Actions past due date without completion are flagged as overdue
- Overdue critical actions trigger a dashboard alert and owner attention item
- Owner must explain overdue critical actions before next recommendations cycle begins

---

## 7. Evidence Submission Process

Evidence supports the claim that an action was executed and had an effect.

**Who submits evidence?**  
The owner (or designated team member). OpsIQ accepts evidence; it does not generate or fabricate evidence.

**Accepted evidence types:**
- Metric update: updated revenue, margin, or KPI figure with date
- Document: invoice, receipt, bank statement screenshot, report
- Screenshot: booking system, POS report, CRM data, ad platform data
- Owner statement: written narrative of what happened (lower confidence weight)
- Third-party confirmation: client email, supplier confirmation, accountant report

**Evidence submission steps:**
1. Navigate to the completed action
2. Select "Submit Evidence"
3. Choose evidence type
4. Upload or enter evidence content
5. Specify the period covered (date range)
6. Indicate whether the metric change is attributable to this action (owner judgment)
7. Submit

**Evidence quality signals (owner-reported):**
- Is this evidence directly observable (not inferred)?
- Is this evidence from a third-party source or owner-generated?
- Does the evidence cover the period following action completion?

---

## 8. Evidence Verification Process

Evidence is verified by the owner, not by OpsIQ AI.

**Verification steps:**
1. Owner reviews submitted evidence
2. Owner confirms: "This evidence is accurate and I vouch for it"
3. Owner selects verification status: `verified` / `disputed` / `insufficient`
4. If `disputed` or `insufficient`: owner adds a clarification note; evidence resubmission requested
5. Verified evidence is locked and cannot be edited after verification

**Verification constraints:**
- The same person who submitted evidence may not self-verify in a high-stakes outcome (owner override required with acknowledgment)
- AI does not verify evidence; it surfaces evidence for owner review only
- Unverified evidence does not count toward learning eligibility
- Disputed evidence triggers adjudication workflow

---

## 9. Outcome Reporting Process

After an action is completed and evidence is verified, the outcome is assessed and reported.

**Outcome assessment (owner-reported):**
Owner answers: "Did the action produce the expected result?"

| Outcome Status | Meaning |
|---|---|
| `worked` | Action produced expected positive result |
| `partially_worked` | Some improvement but below expected threshold |
| `no_effect` | Action completed, no measurable effect |
| `made_worse` | Action may have contributed to deterioration |
| `unknown` | Cannot determine outcome (evidence insufficient) |

**Required for outcome reporting:**
- Completed action
- Verified evidence
- Owner-reported outcome status
- Actual metric values at outcome assessment (vs baseline)
- Expected metric values (from recommendation)
- Outcome period (date range assessed)

**System behavior after outcome report:**
- If outcome = `worked` or `partially_worked`: proceed to adjudication and learning eligibility
- If outcome = `no_effect`: adjudication with `inconclusive` verdict; reassessment evaluation
- If outcome = `made_worse`: harm assessment triggered immediately

---

## 10. Harm Reporting Process

Harm is any outcome that materially worsened the business situation as a result of following an OpsIQ recommendation.

**Harm definition for Owner Mode:**
A harm event occurs when:
- An owner acted on a recommendation AND
- The business condition materially deteriorated in the area the recommendation addressed AND
- No other dominant external factor explains the deterioration (to owner's knowledge)

**Harm severity levels:**
| Level | Description | Example |
|---|---|---|
| `none` | No harm | Action worked or had no effect |
| `minor` | Small negative impact, easily reversed | Wasted a week of effort |
| `moderate` | Meaningful setback; recovery possible | Lost 2 clients; 10% revenue drop |
| `severe` | Major setback; recovery is difficult | 30%+ revenue loss; key staff quit |
| `critical` | Business viability threatened | Cash crisis, insolvency risk |

**Harm reporting steps:**
1. Owner navigates to affected outcome
2. Selects "Report Harm"
3. Selects harm severity
4. Describes what happened (required narrative)
5. Notes whether they believe the recommendation was the proximate cause
6. System flags the loop cycle for adjudication

**After harm is reported:**
- Dashboard shows `harmFlagged: true`
- Owner attention item created
- No new recommendations are auto-surfaced until harm is adjudicated
- Adjudication workflow begins (see Section 11)

---

## 11. Failure Reassessment Process

Reassessment is triggered when an outcome is worse than expected, a recommendation fails, or a harm event is reported.

**Reassessment triggers:**
- Outcome status = `made_worse` or `no_effect` on a high-priority action
- Harm severity = `moderate`, `severe`, or `critical`
- Adjudication verdict = `reassessment_required`
- Owner manually requests reassessment
- 3 or more consecutive `no_effect` outcomes on similar action types

**Reassessment steps:**
1. System surfaces reassessment prompt with: original recommendation, actual outcome, assumptions that may have failed
2. Owner reviews: "Which assumptions were wrong?"
3. Owner selects invalidated assumptions
4. Owner selects proposed corrective action class: `abandon_approach`, `modify_approach`, `retry_with_changes`, `external_expert_required`
5. System updates business condition profile based on reassessment inputs
6. New diagnosis initiated with updated inputs
7. New recommendations generated (not recycled from prior failed cycle)

**Reassessment constraints:**
- AI does not conclude why the recommendation failed — owner determines this
- Failed recommendations are not silently discarded; they are retained in the decision memory
- Two consecutive reassessments on the same issue trigger a "stuck loop" flag and recommend external expert review

---

## 12. Learning Eligibility Process

Learning eligibility determines whether a completed cycle's outcome can inform future recommendations.

**Eligibility requirements (all must be met):**
- [ ] Action was executed (not abandoned or blocked)
- [ ] Execution did not materially deviate from the plan
- [ ] Evidence was submitted and verified by the owner
- [ ] Measurement period is complete (outcome assessed after sufficient elapsed time)
- [ ] Adjudication was completed
- [ ] Adjudication verdict is not `contested` or `invalid`
- [ ] Causal attribution was completed
- [ ] Harm severity is `none` or `minor` (severe harm cycles are flagged, not used for learning)
- [ ] Outcome is not owner-opinion-only (must have at least one objective evidence item)
- [ ] No contradictory evidence exists without resolution
- [ ] Privacy controls are in place for any customer-facing data in evidence

**Eligibility outcomes:**
| Verdict | Meaning |
|---|---|
| `eligible_high_confidence` | All criteria met; outcome can be used for learning |
| `eligible_low_confidence` | Most criteria met; outcome used with low confidence weight |
| `ineligible` | One or more blocking criteria failed; outcome excluded from learning |

**After eligibility determination:**
- Eligible outcomes are added to the business's decision memory
- Ineligible outcomes are retained in the record but not used for recommendation generation
- Owner is shown eligibility verdict and reason (in plain language, no internal field names)

---

## 13. Dashboard Review Process

The Owner Loop Dashboard provides a single-view status of the current intervention cycle.

**Dashboard stages (always visible):**
1. Input Quality
2. Diagnosis
3. Recommendation
4. Owner Decision
5. Action
6. Evidence
7. Outcome
8. Adjudication
9. Reassessment
10. Learning Eligibility

**Stage status indicators:**
| Status | Meaning |
|---|---|
| `complete` | Stage finished successfully |
| `in_progress` | Stage is actively being worked |
| `pending` | Stage not yet started; prior stages must complete first |
| `requires_owner_action` | Waiting for owner input |
| `blocked` | Cannot proceed; blocker must be resolved |
| `not_applicable` | Stage does not apply to this cycle |
| `missing_data` | Required data is absent |

**Dashboard review steps (weekly minimum):**
1. Open Owner Loop Dashboard
2. Review overall stage completion status
3. Check "Owner Attention Items" (any item here requires same-session action or scheduling)
4. Review open blockers; resolve or escalate each
5. Check harm flag status
6. Review business trend warnings
7. Confirm reassessment status if active
8. Note any `missing_data` stages and plan to resolve

**DASHBOARD-RULE compliance (owner awareness):**
- Dashboard never displays internal system field names
- Dashboard never auto-decides on behalf of the owner
- Stages in `requires_owner_action` status must be resolved by the owner, not delegated to AI

---

## 14. Weekly Review Process

Every 7 days (minimum), owner conducts a structured review:

**Checklist:**
- [ ] Open Owner Loop Dashboard
- [ ] Review all stages — note any `requires_owner_action` stages
- [ ] Log progress on all `in_progress` actions
- [ ] Submit any pending evidence for completed actions
- [ ] Verify any unverified evidence
- [ ] Review and act on all Owner Attention Items
- [ ] Update metric inputs if any required metric has changed materially (>10%)
- [ ] Check for new recommendations and make decisions (accept/reject/defer)
- [ ] Review business trend warnings — confirm, dismiss, or escalate each
- [ ] Document any new blockers that emerged during the week
- [ ] If any harm event occurred: report it before closing review

**Time expectation:** 30–60 minutes for a pilot business in the first month.

---

## 15. Monthly Review Process

At the end of each 30-day cycle, owner conducts a deeper review:

**Financial inputs refresh:**
- [ ] Update monthly revenue (actual)
- [ ] Update gross margin % (actual)
- [ ] Update net profit/loss (actual)
- [ ] Update cash balance (actual bank balance)
- [ ] Update cash runway estimate

**Operational inputs refresh:**
- [ ] Update all minimum metrics for the business type (Section 4)
- [ ] Update lead volume and conversion rate
- [ ] Update active customer/client count

**Cycle retrospective:**
- [ ] How many recommendations were accepted this month?
- [ ] How many accepted actions were fully executed?
- [ ] How many outcomes were reported?
- [ ] How many outcomes were positive vs. no-effect vs. negative?
- [ ] Were any harm events reported? What happened?
- [ ] Was reassessment triggered? What was the outcome?
- [ ] Is the business better, the same, or worse than at cycle start?

**Pilot calibration check:**
- [ ] Are the inputs being entered consistently?
- [ ] Is the owner completing the full loop (from decision through to outcome reporting)?
- [ ] Is evidence quality sufficient (not all owner-statement-only)?
- [ ] Is the 30-day cadence (Section 3) being followed?

---

## 16. Pilot Success Criteria

The pilot is considered successful when ALL of the following are met:

**Process completion (must achieve within 90 days):**
- [ ] At least 2 complete loop cycles executed (input → diagnosis → decision → action → evidence → outcome)
- [ ] At least 3 owner decisions made (accepted, rejected, or deferred — all count)
- [ ] At least 2 outcomes reported with verified evidence
- [ ] At least 1 learning eligibility assessment completed
- [ ] Dashboard reviewed at least 4 times (weekly cadence maintained)
- [ ] Monthly inputs refreshed at least twice

**Data quality:**
- [ ] No required input left blank for more than 14 consecutive days
- [ ] No cycle with input quality = `insufficient` for more than 7 days
- [ ] At least 80% of actions have verified evidence (not just owner-statement)

**Owner engagement:**
- [ ] Owner made all decisions personally (did not delegate to a non-owner)
- [ ] Owner submitted all evidence or personally confirmed team-submitted evidence
- [ ] Owner completed at least one weekly review per week during the pilot period
- [ ] No decision left in `pending` status for more than 7 days (past the review window)

**System health:**
- [ ] No unresolved harm events at cycle end
- [ ] No `stuck loop` flag active at cycle end
- [ ] No critical blockers unaddressed for more than 14 days

---

## 17. Pilot Stop Conditions

The pilot must pause and be reviewed by the OpsIQ team if ANY of the following occur:

| Stop Condition | Threshold | Action Required |
|---|---|---|
| Harm event severity `critical` | Any single event | Immediate pause; OpsIQ team review before resuming |
| Harm event severity `severe` | Any single event | Pause within 48 hours; OpsIQ team review |
| Two consecutive `severe` harm events | Rolling 90-day window | Full pilot review; root cause analysis |
| Owner non-engagement | >14 days without login or input | Pause; re-onboarding required |
| Input quality `insufficient` | >14 consecutive days | Pause; input remediation required |
| `Stuck loop` flag | Any occurrence | Pause; external expert review recommended |
| Cash runway < 1 month | At any monthly refresh | Flag immediately; escalate to owner; pause non-critical recommendations |
| Owner explicitly withdraws consent | Any time | Immediate full stop; no further AI outputs |
| Data accuracy concern | Owner reports that inputs were materially wrong | Pause; correct inputs; re-run diagnosis before resuming |
| Regulatory or legal concern | Any indication | Immediate stop; refer to qualified professional |

**After a stop condition is resolved:**
1. Document what happened and why
2. Update business inputs to reflect current state
3. Re-run diagnosis with corrected/updated inputs
4. Owner reviews and confirms readiness to resume
5. Resume at the beginning of a fresh cycle (do not resume a paused cycle mid-stage)

---

*This checklist is a controlled pilot document. It applies to real business use before public SaaS availability. Do not share outside the pilot program without authorization.*
