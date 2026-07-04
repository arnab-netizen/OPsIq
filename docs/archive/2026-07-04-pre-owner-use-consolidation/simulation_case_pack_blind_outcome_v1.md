# Blind-Outcome Simulation Case Pack v1 for OpsIQ Benchmark

**Status:** BLIND_OUTCOME_CASE_PACK_READY
**Created:** 2026-06-16
**Total Cases:** 5 (BLND-001 … BLND-005)

---

## Purpose

Maximum-leakage-resistance cases. Each is a purely **forward-looking** owner decision: the visible prompt is the "before" state only, with **no outcome residue** — nothing in the visible input telegraphs how it resolved. The correct answer is a **sealed expert judgment** grounded in sound business logic and the provided numbers, so it is scorable, but it cannot be reverse-engineered from the prompt.

These cases test what the real-world cases cannot fully isolate: whether OpsIQ reasons correctly when there is genuinely **no recallable answer**, calibrates confidence appropriately, and flags what it cannot know. The expert judgment is held blind and revealed only after OpsIQ's output is frozen.

---

## Usage Rules

1. OpsIQ sees only `CASE_INPUT_VISIBLE_TO_OPSIQ`.
2. The `SEALED_EXPERT_JUDGMENT` (hidden) is opened only after OpsIQ's output is frozen.
3. Scoring rewards correct reasoning + appropriate confidence + naming the key unknown — not matching a "famous outcome" (there is none visible).

## Leakage Prevention Rules

- The visible prompt contains forward-looking decision inputs only: current numbers, constraints, options. **No "what happened next", no resolution, no hindsight framing.**
- Each case is abstracted/anonymized so it cannot be matched to a known company outcome.
- `leakage_resistance_score` ≥ 9 required for every case.

## Case Quality Thresholds

- leakage_resistance_score ≥ 9
- business_relevance_score ≥ 8
- expected_answer_quality_score ≥ 8
- total_case_quality_score ≥ 7.5

---

## Index of Cases

| Case ID | Decision | Industry | Sealed Answer Hinges On | Leakage Resistance |
|---------|----------|----------|-------------------------|--------------------|
| BLND-001 | Raise membership price or not | Local gym | Contribution vs. churn-elasticity unknown → conditional test | 10/10 |
| BLND-002 | Build a big customer's requested enterprise feature | B2B SaaS | Concentration risk + opportunity cost | 9/10 |
| BLND-003 | Add third-party delivery apps | Restaurant | Incremental contribution after commission | 9/10 |
| BLND-004 | Take a large low-margin anchor client | Professional services | Capacity displacement + margin | 9/10 |
| BLND-005 | Open a second location now | Retail | First-unit stability + runway | 10/10 |

**average_leakage_resistance:** 9.4/10
**average_case_quality:** 8.4/10

---

# CASES

---

## CASE BLND-001: Gym Membership Price Decision

**case_id:** BLND-001
**case_name:** Single-Location Gym — Raise Price Into Slowing Growth?
**case_type:** BLIND_OUTCOME_CASE
**industry:** Local Service / Fitness
**business_model:** Monthly membership
**business_stage:** Mature single location
**geography:** Synthetic / illustrative (anonymized)
**leakage_resistance_score:** 10/10
**business_relevance_score:** 9/10
**why_blind:** A forward-looking pricing decision with no outcome residue; resolution depends on price elasticity that is not provided, so no answer can be recalled or inferred.
**why_case_is_not_too_easy:** Tempts a confident "raise prices, margins are thin" or "don't, you'll lose members" — both are overconfident given missing elasticity.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**owner_context:** Owner of one established gym.
**stated_problem:** "Membership growth has flattened. Costs (rent, staff) are rising. I'm considering a 15% membership price increase but I'm worried about losing members. Should I raise prices?"
**visible_financial_data:** 1,000 active members at $40/mo = $40,000/mo revenue. Fixed costs $28,000/mo. Variable cost per member ≈ $4/mo. Contribution per member ≈ $36/mo. Net ≈ $8,000/mo.
**visible_sales_data:** Net member growth ~0% for 6 months; some churn offset by new joins.
**visible_operations_data:** Near capacity at peak hours; off-peak underused.
**visible_marketing_data:** Minimal; mostly referral.
**visible_customer_data:** Mixed tenure; no segmented price-sensitivity data.
**visible_constraints:** Rent renewal raises fixed costs ~$3,000/mo next quarter.
**known_limitations:** No price-elasticity data; no competitor pricing; no member-segment willingness-to-pay.
**exact_prompt_to_opsiq:** "Should I implement the 15% price increase? What is the first priority action, and what would you need to know to decide with confidence?"

### SEALED_EXPERT_JUDGMENT_HIDDEN_FROM_OPSIQ
**sealed_answer:** The decision cannot be made with confidence on the data given — it hinges on price elasticity, which is unknown. The correct first move is a **bounded test**, not a blanket 15% hike: estimate the break-even churn tolerance and run a controlled test before a full rollout.
**supporting_logic:** At $40 with $36 contribution, a 15% increase = $6 → new price $46, new contribution ~$42. Break-even on member loss: the price rise is justified if member attrition stays below the point where 1,000×$36 ≤ (new members)×$42 → tolerable loss ≈ 1 − (36/42) ≈ 14.3%. So if fewer than ~14% of members would quit at the higher price, revenue/contribution rises. Whether attrition stays under ~14% is exactly the unknown.
**expected_first_priority_action:** Quantify the break-even attrition tolerance (~14%), then test the increase on a cohort / new members / off-peak tier before a blanket rollout; gather elasticity evidence.
**known_bad_actions:** Blanket 15% hike with no test; refusing any increase despite rising fixed costs; deep discounting to "grow."
**appropriate_confidence:** MODERATE/conditional — must name elasticity as the deciding unknown.
**scoring_notes:** Full credit = compute/served the break-even attrition tolerance AND recommend a bounded test rather than a confident yes/no. Overconfident yes or no = false-confidence penalty.

### CASE_SCORING_GUIDE
**root_cause_full_credit:** Frames it as a price-elasticity decision with a computable break-even attrition tolerance (~14%), explicitly unknown.
**root_cause_partial_credit:** Recognizes the increase could work but flags member-loss risk as the key uncertainty.
**first_priority_action_full_credit:** Compute break-even attrition + run a bounded test before full rollout.
**first_priority_action_partial_credit:** Recommends a test/pilot rather than a blanket change.
**automatic_fail_conditions:** Confident "yes raise 15%" or "no don't" with no test and no elasticity caveat; inventing elasticity numbers.
**dangerous_recommendations:** Blanket hike risking a churn spike with no test; or paralysis while fixed costs rise.
**false_confidence_traps:** Claiming certainty about member reaction without elasticity data.
**missing_data_that_should_be_flagged:** Price elasticity / willingness-to-pay by segment; competitor pricing; churn sensitivity.
**evidence_that_should_be_used:** Contribution $36/member, 1,000 members, rising fixed costs, flat growth.
**evidence_that_should_not_be_invented:** A specific churn-at-higher-price figure.

---

## CASE BLND-002: SaaS Enterprise-Feature Request

**case_id:** BLND-002
**case_name:** B2B SaaS — Build a Big Customer's Custom Feature?
**case_type:** BLIND_OUTCOME_CASE
**industry:** SaaS
**business_model:** B2B subscription
**business_stage:** Early growth
**geography:** Synthetic / illustrative (anonymized)
**leakage_resistance_score:** 9/10
**business_relevance_score:** 9/10
**why_blind:** Forward-looking roadmap decision; outcome depends on whether the feature generalizes — not provided, not inferable.
**why_case_is_not_too_easy:** Tempts "the big customer pays, so build it" (revenue concentration trap) or "never customize" (dogma).
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**owner_context:** Founder of an early-growth B2B SaaS.
**stated_problem:** "Our largest customer (28% of ARR) demands a custom feature within the quarter or threatens to leave. Building it would consume most of our engineering capacity this quarter and delay our roadmap. Should we build it?"
**visible_financial_data:** ARR $2.0M; largest customer = $560k (28%). Engineering = 4 of the team; the build ≈ one quarter of their capacity.
**visible_sales_data:** Healthy pipeline of smaller mid-market deals aligned to the existing roadmap.
**visible_operations_data:** Roadmap features serve many prospects; the custom feature's general applicability is unclear.
**visible_marketing_data:** Positioned for mid-market, not bespoke enterprise.
**visible_customer_data:** No data on how many other customers/prospects want this exact feature.
**visible_constraints:** One quarter of engineering capacity; roadmap delay if diverted.
**known_limitations:** Unknown whether the feature generalizes; unknown true churn probability of the big customer; no contract renewal terms shown.
**exact_prompt_to_opsiq:** "Should we build the custom feature for our largest customer? What is the first priority action, and what is the key risk?"

### SEALED_EXPERT_JUDGMENT_HIDDEN_FROM_OPSIQ
**sealed_answer:** Do not reflexively build it for one account, and do not reflexively refuse. The deciding question is **whether the feature generalizes** to other customers/prospects and the **real churn probability** vs. contract terms. First action: assess generalizability and concentration risk; if it serves the broader roadmap, build a generalized version; if purely bespoke, negotiate (paid custom work, longer contract, or managed offboarding) rather than derailing the roadmap for 28% concentration.
**supporting_logic:** 28% revenue concentration is itself a structural risk; capitulating fully increases dependence. But losing 28% of ARR abruptly is material. The resolution depends on generalizability and renewal terms, which are unknown.
**expected_first_priority_action:** Determine feature generalizability + quantify concentration/churn risk + renewal terms before committing engineering; pursue a generalized build or a commercial negotiation.
**known_bad_actions:** Building bespoke immediately because "they pay the most"; flat refusal ignoring 28% exposure; promising a timeline without scoping generalizability.
**appropriate_confidence:** MODERATE/conditional.
**scoring_notes:** Full credit = names generalizability + concentration risk as the deciding factors and proposes a conditional path, not a flat yes/no.

### CASE_SCORING_GUIDE
**root_cause_full_credit:** Frames decision around feature generalizability + 28% concentration risk + renewal terms, all partly unknown.
**root_cause_partial_credit:** Flags concentration risk OR roadmap opportunity cost.
**first_priority_action_full_credit:** Assess generalizability + concentration/churn + terms; then generalized build or commercial negotiation.
**first_priority_action_partial_credit:** Recommends scoping generalizability before committing.
**automatic_fail_conditions:** "Build it, they pay the most" with no generalizability/risk analysis; flat refusal ignoring exposure; inventing how many others want it.
**dangerous_recommendations:** Derailing the entire roadmap for one account; or losing 28% ARR with no mitigation.
**false_confidence_traps:** Assuming the big customer will/won't churn without contract data.
**missing_data_that_should_be_flagged:** Generalizability/demand for the feature; churn probability; renewal terms.
**evidence_that_should_be_used:** 28% concentration; one quarter of engineering; roadmap-aligned pipeline.
**evidence_that_should_not_be_invented:** Other customers' demand for the feature.

---

## CASE BLND-003: Restaurant Third-Party Delivery Decision

**case_id:** BLND-003
**case_name:** Restaurant — Join Third-Party Delivery Apps?
**case_type:** BLIND_OUTCOME_CASE
**industry:** Restaurant / Food Service
**business_model:** Single full-service restaurant
**business_stage:** Stable, margin-pressured
**geography:** Synthetic / illustrative (anonymized)
**leakage_resistance_score:** 9/10
**business_relevance_score:** 9/10
**why_blind:** Forward-looking channel decision; resolution depends on incremental vs. cannibalized demand, which is unknown.
**why_case_is_not_too_easy:** Tempts "yes, more orders = more revenue" while a 30% commission can make orders contribution-negative.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**owner_context:** Owner of one full-service restaurant.
**stated_problem:** "Delivery apps want us on their platform. They charge ~30% commission per order. I'd get exposure and more orders. Should I join?"
**visible_financial_data:** Average order $40. Food + variable cost ≈ $24 (60%). Dine-in contribution ≈ $16/order. App commission = 30% of $40 = $12/order.
**visible_sales_data:** Dine-in steady; some takeout demand exists.
**visible_operations_data:** Kitchen has slack mid-week; packaging/labor for delivery adds ~$2/order.
**visible_marketing_data:** Limited; apps promise visibility.
**visible_customer_data:** Unknown how many delivery orders would be NEW vs. customers who would have dined in anyway.
**visible_constraints:** Kitchen capacity is fine off-peak, tight at weekend peak.
**known_limitations:** Incremental-vs-cannibalized split unknown; no data on delivery order frequency.
**exact_prompt_to_opsiq:** "Should I join the delivery apps at ~30% commission? What is the first priority action, and what determines whether it's profitable?"

### SEALED_EXPERT_JUDGMENT_HIDDEN_FROM_OPSIQ
**sealed_answer:** Conditional. Compute per-order contribution after commission: $40 − $24 food − $12 commission − $2 packaging = **$2/order** (vs. $16 dine-in). It is only worth it if the orders are **incremental** (off-peak slack) and not cannibalizing $16 dine-in contribution. First action: compute the after-commission contribution and pilot delivery **off-peak only**, measuring incrementality, before any peak-time rollout.
**supporting_logic:** A 30% commission collapses contribution from $16 to ~$2. If a delivery order replaces a dine-in order, the restaurant loses $14 of contribution. So profitability hinges entirely on incrementality + capacity timing — both partly unknown.
**expected_first_priority_action:** Compute after-commission per-order contribution (~$2), restrict to off-peak, measure incrementality before scaling.
**known_bad_actions:** Joining with no contribution math ("more orders = good"); enabling delivery at weekend peak (displaces $16 dine-in for $2 delivery); raising menu prices only on apps without checking competitiveness.
**appropriate_confidence:** MODERATE/conditional.
**scoring_notes:** Full credit = compute the ~$2 after-commission contribution AND condition on incrementality/off-peak. Saying "yes, more revenue" is an automatic fail.

### CASE_SCORING_GUIDE
**root_cause_full_credit:** Computes after-commission contribution (~$2/order) and identifies incrementality + capacity timing as the deciding (unknown) factors.
**root_cause_partial_credit:** Flags that 30% commission severely compresses contribution.
**first_priority_action_full_credit:** Compute contribution + off-peak pilot + measure incrementality before scaling.
**first_priority_action_partial_credit:** Recommends a limited pilot rather than full rollout.
**automatic_fail_conditions:** "Yes, more orders = more revenue" with no contribution math; ignoring cannibalization; inventing an incremental-order count.
**dangerous_recommendations:** Full peak-time rollout that displaces dine-in contribution.
**false_confidence_traps:** Treating gross order value as profit; assuming all delivery demand is incremental.
**missing_data_that_should_be_flagged:** Incremental vs. cannibalized split; delivery order volume; peak/off-peak capacity.
**evidence_that_should_be_used:** $40 order, $24 cost, 30% commission, $16 dine-in contribution, off-peak slack.
**evidence_that_should_not_be_invented:** Number of new delivery customers.

---

## CASE BLND-004: Professional-Services Anchor-Client Decision

**case_id:** BLND-004
**case_name:** Agency — Take a Large Low-Margin Anchor Client?
**case_type:** BLIND_OUTCOME_CASE
**industry:** Professional Services / Agency
**business_model:** Project + retainer services
**business_stage:** Small, capacity-constrained
**geography:** Synthetic / illustrative (anonymized)
**leakage_resistance_score:** 9/10
**business_relevance_score:** 8/10
**why_blind:** Forward-looking capacity/margin decision; resolution depends on displacement and client behavior that are not provided.
**why_case_is_not_too_easy:** Tempts "take the big logo for stability" while it displaces higher-margin work and concentrates risk.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.0/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**owner_context:** Owner of a 10-person creative agency at ~85% utilization.
**stated_problem:** "A large brand offers a 12-month retainer worth $600k/yr — about 40% of our capacity — but at a 20% gross margin vs. our usual 45%. It's a great logo and steady cash. Should I take it?"
**visible_financial_data:** Current revenue $1.5M; blended gross margin 45%. The anchor: $600k at 20% margin = $120k gross profit, consuming ~40% of delivery capacity.
**visible_sales_data:** Existing/pipeline project work runs at ~45% margin; pipeline is healthy but lumpy.
**visible_operations_data:** ~85% utilization; taking the anchor displaces ~40% of capacity currently on higher-margin work.
**visible_marketing_data:** The logo could aid business development (unquantified).
**visible_customer_data:** No data on the anchor's scope-creep tendency or renewal likelihood.
**visible_constraints:** Limited delivery capacity; hiring lead time ~3 months.
**known_limitations:** Displacement of higher-margin work not precisely modeled; scope-creep risk unknown; brand-halo value unquantified.
**exact_prompt_to_opsiq:** "Should I take the anchor client? What is the first priority action, and what's the key trade-off?"

### SEALED_EXPERT_JUDGMENT_HIDDEN_FROM_OPSIQ
**sealed_answer:** Conditional — the trade-off is capacity displacement, not the logo. $600k at 20% = $120k gross profit; the same ~40% capacity on 45%-margin work would generate roughly $600k×(45/20 scaling is wrong — compare on capacity): if 40% of capacity normally yields ~$600k revenue at 45% = ~$270k gross profit, the anchor yields $120k — a ~$150k gross-profit displacement. First action: model the displacement (gross profit per unit of capacity, anchor vs. existing) and decide based on whether incremental capacity (hiring) or brand-halo can offset it; negotiate margin/scope guardrails before signing.
**supporting_logic:** At 85% utilization, the anchor mostly displaces higher-margin work rather than filling idle capacity. The right metric is gross profit per unit of delivery capacity, where the anchor (20%) underperforms the base (45%). Whether the logo's BD value or added headcount offsets the displacement is the unknown.
**expected_first_priority_action:** Model gross-profit-per-capacity displacement (anchor vs. base) + decide on hiring/guardrails; negotiate margin/scope or decline if it purely displaces better work.
**known_bad_actions:** Taking it for "stability/logo" without displacement math; declining purely on margin % without considering capacity/BD value; assuming you can hire instantly.
**appropriate_confidence:** MODERATE/conditional.
**scoring_notes:** Full credit = frame as gross-profit-per-capacity displacement at high utilization and require guardrails/hiring analysis; not a logo-driven yes.

### CASE_SCORING_GUIDE
**root_cause_full_credit:** Frames the decision as capacity displacement (gross profit per unit of capacity, 20% anchor vs 45% base) at ~85% utilization, with hiring/brand-halo as the offsetting unknowns.
**root_cause_partial_credit:** Flags lower margin OR capacity displacement as the issue.
**first_priority_action_full_credit:** Model displacement + decide on hiring/guardrails + negotiate margin/scope before signing.
**first_priority_action_partial_credit:** Recommends analyzing capacity trade-off before accepting.
**automatic_fail_conditions:** "Take the logo for stability" with no displacement analysis; declining solely on margin % ignoring capacity/BD; inventing the anchor's renewal/scope behavior.
**dangerous_recommendations:** Committing 40% of capacity to 20% margin with no guardrails or hiring plan.
**false_confidence_traps:** Treating steady cash as obviously good; assuming instant hiring.
**missing_data_that_should_be_flagged:** Displacement of higher-margin pipeline; scope-creep risk; brand-halo BD value; hiring feasibility.
**evidence_that_should_be_used:** 85% utilization, 20% vs 45% margin, 40% capacity, 3-month hiring lead.
**evidence_that_should_not_be_invented:** The anchor's renewal probability or scope behavior.

---

## CASE BLND-005: Retail Second-Location Decision

**case_id:** BLND-005
**case_name:** Retailer — Open a Second Location Now?
**case_type:** BLIND_OUTCOME_CASE
**industry:** Retail
**business_model:** Single-location specialty retail
**business_stage:** First location stabilizing
**geography:** Synthetic / illustrative (anonymized)
**leakage_resistance_score:** 10/10
**business_relevance_score:** 8/10
**why_blind:** Forward-looking expansion decision; resolution depends on first-unit durability and new-site demand, neither knowable from the input.
**why_case_is_not_too_easy:** Tempts "first store works, replicate it" before the first unit's profitability is proven durable, and without runway for a second ramp.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.0/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**owner_context:** Owner of one specialty retail store.
**stated_problem:** "My first store just turned profitable this year. A great second-location lease is available now. I'd fund the build-out mostly from savings. Should I open the second store now?"
**visible_financial_data:** Store 1: revenue $900k/yr, net profit $70k this year (first profitable year). Owner savings available ≈ $120k. Estimated second-store build-out + initial inventory ≈ $150k; typical ramp to profitability historically 12–18 months for similar stores.
**visible_sales_data:** Store 1's profitability is one year old; seasonality not yet proven across cycles.
**visible_operations_data:** Owner personally runs Store 1; a second store needs a trusted manager (not yet hired).
**visible_marketing_data:** Local brand; second site is in a different trade area with unknown demand.
**visible_customer_data:** No demand data for the new trade area.
**visible_constraints:** Build-out cost ($150k) exceeds available savings ($120k); owner can only be in one place; manager not hired.
**known_limitations:** First-unit durability unproven; new-site demand unknown; management bandwidth and funding gap.
**exact_prompt_to_opsiq:** "Should I open the second location now? What is the first priority action, and what are the key risks?"

### SEALED_EXPERT_JUDGMENT_HIDDEN_FROM_OPSIQ
**sealed_answer:** Most likely **not yet** — but the deciding factors (first-unit durability, new-site demand, funding gap, management) are partly unknown, so the answer is conditional, not a flat yes. Three concrete blockers are visible: (1) the funding gap ($150k need vs $120k savings) with a 12–18 month second-unit ramp threatens runway; (2) first-unit profitability is only one year old (durability unproven across a seasonal cycle); (3) no manager hired and the owner can only be in one place. First action: prove first-unit durability (a full seasonal cycle), close the funding/management gaps, and validate new-site demand before committing.
**supporting_logic:** Replicating an unproven unit, while under-funded for the ramp and without management depth, is premature scaling. The lease's availability creates false urgency. Whether the first unit is durable and the new site has demand is genuinely unknown.
**expected_first_priority_action:** De-risk before expanding: prove durability over a seasonal cycle + close funding/management gaps + validate new-trade-area demand; do not sign now solely because the lease is available.
**known_bad_actions:** Signing now because "the first store works and the lease is available"; funding the gap with high-cost debt without a ramp cushion; expanding with no manager.
**appropriate_confidence:** MODERATE/conditional — lean "not yet," name the unknowns.
**scoring_notes:** Full credit = identifies the funding gap + unproven durability + management gap, resists the lease-driven urgency, and conditions expansion on de-risking. A confident "yes, replicate it" is an automatic fail.

### CASE_SCORING_GUIDE
**root_cause_full_credit:** Identifies premature-scaling risk: unproven first-unit durability + funding gap + no management + unknown new-site demand; resists false urgency from lease availability.
**root_cause_partial_credit:** Flags any one of: funding gap, unproven durability, management gap.
**first_priority_action_full_credit:** De-risk first (durability over a cycle + funding/management + demand validation) before committing.
**first_priority_action_partial_credit:** Recommends caution/validation before signing.
**automatic_fail_conditions:** Confident "yes, replicate it now"; ignoring the $150k-vs-$120k funding gap; ignoring the missing manager; inventing new-site demand.
**dangerous_recommendations:** Signing a second lease while under-funded for the ramp and without management; high-cost debt with no cushion.
**false_confidence_traps:** "First store is profitable, so a second will be too"; treating lease availability as urgency.
**missing_data_that_should_be_flagged:** First-unit durability across a seasonal cycle; new-trade-area demand; management hiring; full ramp funding.
**evidence_that_should_be_used:** $70k profit (year 1 only), $120k savings vs $150k cost, 12–18 month ramp, owner-run, no manager.
**evidence_that_should_not_be_invented:** New-site demand; second-unit revenue projection.

---

## BLIND_OUTCOME_CASE_PACK_CLOSEOUT

**total_cases_created:** 5
**total_cases_accepted:** 5
**average_leakage_resistance:** 9.4/10 (all ≥ 9)
**average_business_relevance:** 8.6/10 (all ≥ 8)
**average_expected_answer_quality:** 8.0/10
**average_case_quality:** 8.4/10
**all_forward_looking_no_outcome_residue:** true
**common_correct_pattern:** conditional reasoning + compute the decision-relevant break-even/contribution + name the deciding unknown + appropriate (MODERATE) confidence — rewarding calibration over false certainty.
**cases_ready_for_round_1:** 5/5
**final_status:** BLIND_OUTCOME_CASE_PACK_READY
