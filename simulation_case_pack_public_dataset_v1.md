# Public-Dataset Simulation Case Pack v1 for OpsIQ Benchmark

**Status:** PUBLIC_DATASET_CASE_PACK_READY
**Created:** 2026-06-16
**Total Cases:** 10 (PD-001 … PD-010)

---

## Purpose

Deterministic, calculation-based business cases anchored to public-dataset-style inputs. Each case has a **single correct numeric answer** derivable from the provided figures, plus an explicit **tolerance band**. These test whether OpsIQ performs correct quantitative business reasoning (break-even, margin, CAC payback, churn-implied lifetime, LTV:CAC, comparable-sales growth, inventory days, cash runway, ROAS, CAGR) without arithmetic errors, method errors, or invented numbers.

These are the most objectively scorable cases in the benchmark: full credit requires the answer to fall inside the tolerance band AND the method to be correct.

---

## Usage Rules

1. OpsIQ sees only `CASE_INPUT_VISIBLE_TO_OPSIQ` (the provided dataset values + the question).
2. The formula, worked solution, expected answer, and tolerance live only in `CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ`.
3. Scoring is mechanical: inside tolerance + correct method = full credit.

## Leakage Prevention Rules

- The visible section contains the dataset values and the question only — never the computed answer, the formula walk-through, or the tolerance band.
- All figures needed to compute the answer are present in the visible section, so no external lookup or memory is required (and none should be invented).

## Case Quality Thresholds

- expected_answer_quality_score ≥ 8 (deterministic answers score high by construction)
- total_case_quality_score ≥ 7.5
- contamination_risk: LOW for all (a computation cannot be "memorized"; only the method matters)

**Note on figures:** Input values are representative of the cited public-dataset *types* (SBA small-business benchmarks, public company 10-K line items, SaaS public benchmark reports, Census/BLS/FRED series). The benchmark scores the **computation on the provided numbers**, which is fully deterministic regardless of any single figure's provenance.

---

## Index of Cases

| Case ID | Calculation Tested | Domain | Expected Answer | Tolerance |
|---------|--------------------|--------|-----------------|-----------|
| PD-001 | Contribution-margin break-even (units) | Restaurant / local service | 4,000 units/mo | ±0 |
| PD-002 | Gross margin % | Public retailer 10-K | 35.0% | ±0.1 pp |
| PD-003 | CAC payback (months) | SaaS | 8.0 months | ±0.1 |
| PD-004 | Churn-implied avg customer lifetime | Subscription | 25 months | ±0.5 |
| PD-005 | LTV : CAC ratio | SaaS unit economics | 4.0 : 1 | ±0.1 |
| PD-006 | Comparable-store sales growth % | Retail | 5.0% | ±0.1 pp |
| PD-007 | Inventory days (DIO) | Retailer 10-K | 50 days | ±1 day |
| PD-008 | Cash runway (months) | Startup finance | 8.0 months | ±0.2 |
| PD-009 | ROAS (and margin-adjusted ROAS) | Marketing | 4.0x (2.0x adj) | ±0.05 |
| PD-010 | Revenue CAGR (3-yr) | Public company series | 20.0% | ±0.2 pp |

**average_expected_answer_quality:** 9.0/10
**average_case_quality:** 8.5/10

---

# CASES

---

## CASE PD-001: Break-Even Units (Contribution Margin)

**case_id:** PD-001
**case_name:** Local Café Monthly Break-Even in Units
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Restaurant / Local Service
**data_source:** SBA small-business cost-structure benchmarks (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW (deterministic computation)
**calculation_tested:** Break-even volume = Fixed Costs ÷ (Price − Variable Cost)
**tolerance:** ±0 units
**why_case_is_not_too_easy:** Tempts mixing up gross revenue break-even with unit break-even, or using price (not contribution margin) in the denominator.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**owner_context:** Owner of a single-location café.
**provided_data:** Fixed monthly costs (rent, salaried staff, insurance, utilities base) = $20,000. Average selling price per unit (drink + pastry combo) = $12.00. Average variable cost per unit (COGS + variable labor + supplies) = $7.00.
**exact_prompt_to_opsiq:** "How many units must the café sell per month to break even? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Break-even units = Fixed Costs ÷ (Price − Variable Cost) = 20,000 ÷ (12 − 7) = 20,000 ÷ 5.
**expected_answer:** 4,000 units per month.
**tolerance_band:** exactly 4,000 (±0).
**common_wrong_answers:** 1,667 (dividing by price 12, ignoring variable cost); 2,857 (dividing by 7); any revenue figure without converting to units.
**scoring_notes:** Full credit requires 4,000 AND contribution-margin method shown.

### CASE_SCORING_GUIDE
**full_credit:** 4,000 units with correct contribution-margin method.
**partial_credit:** Correct method (FC ÷ contribution) but an arithmetic slip.
**automatic_fail_conditions:** Dividing by price instead of contribution margin; answering in dollars without units; inventing additional costs not provided.
**dangerous_recommendations:** Advising expansion/price changes off a wrong break-even.
**false_confidence_traps:** Stating a confident number with the wrong denominator.
**evidence_that_should_be_used:** FC $20,000; price $12; variable cost $7.
**evidence_that_should_not_be_invented:** Tax, additional fixed costs, seasonality.

---

## CASE PD-002: Gross Margin Percentage

**case_id:** PD-002
**case_name:** Retailer Gross Margin from 10-K Line Items
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Public Retailer
**data_source:** Public company 10-K income statement (representative line items)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** Gross margin % = (Revenue − COGS) ÷ Revenue
**tolerance:** ±0.1 percentage points
**why_case_is_not_too_easy:** Tempts reporting gross profit in dollars instead of margin %, or using operating income.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Net revenue = $4,000,000. Cost of goods sold = $2,600,000. (Operating expenses $900,000 are provided as a distractor.)
**exact_prompt_to_opsiq:** "What is the gross margin percentage? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** GM% = (Revenue − COGS) ÷ Revenue = (4,000,000 − 2,600,000) ÷ 4,000,000 = 1,400,000 ÷ 4,000,000.
**expected_answer:** 35.0%.
**tolerance_band:** 34.9%–35.1%.
**common_wrong_answers:** Subtracting opex too (giving operating margin 12.5%); reporting $1,400,000 without converting to %.
**scoring_notes:** Full credit requires 35.0% using COGS only (not opex).

### CASE_SCORING_GUIDE
**full_credit:** 35.0% via (Rev − COGS)/Rev.
**partial_credit:** Correct method, minor rounding outside band.
**automatic_fail_conditions:** Using opex in the gross-margin calc; reporting dollars only; inventing other costs.
**dangerous_recommendations:** Margin-based pricing advice off the wrong figure.
**false_confidence_traps:** Confusing gross with operating margin.
**evidence_that_should_be_used:** Revenue $4.0M; COGS $2.6M.
**evidence_that_should_not_be_invented:** Tax rate; the $900k opex must be excluded from gross margin.

---

## CASE PD-003: CAC Payback Period

**case_id:** PD-003
**case_name:** SaaS CAC Payback in Months
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** SaaS
**data_source:** SaaS public benchmark reports (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** CAC payback = CAC ÷ (monthly gross-margin contribution per customer)
**tolerance:** ±0.1 months
**why_case_is_not_too_easy:** Tempts dividing CAC by gross revenue per month (ignoring gross margin), understating payback.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Fully-loaded CAC = $1,200. Monthly revenue per customer = $200. Gross margin = 75%.
**exact_prompt_to_opsiq:** "What is the CAC payback period in months on a gross-margin basis? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Monthly GM contribution = 200 × 0.75 = $150. Payback = CAC ÷ contribution = 1,200 ÷ 150.
**expected_answer:** 8.0 months.
**tolerance_band:** 7.9–8.1 months.
**common_wrong_answers:** 6.0 months (using $200 revenue, ignoring margin).
**scoring_notes:** Full credit requires 8.0 months on a gross-margin basis.

### CASE_SCORING_GUIDE
**full_credit:** 8.0 months using GM contribution $150.
**partial_credit:** Correct method, minor rounding.
**automatic_fail_conditions:** Ignoring gross margin (answering 6.0); inventing a different margin.
**dangerous_recommendations:** "Scale paid acquisition" based on an understated payback.
**false_confidence_traps:** Revenue-basis payback presented as gross-margin payback.
**evidence_that_should_be_used:** CAC $1,200; $200/mo; 75% GM.
**evidence_that_should_not_be_invented:** Churn, expansion revenue.

---

## CASE PD-004: Churn-Implied Average Customer Lifetime

**case_id:** PD-004
**case_name:** Average Lifetime from Monthly Churn
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Subscription
**data_source:** Subscription churn benchmark (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** Average lifetime (months) = 1 ÷ monthly churn rate
**tolerance:** ±0.5 months
**why_case_is_not_too_easy:** Tempts confusing monthly vs annual churn, or using retention instead of churn.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Monthly customer churn rate = 4.0% (0.04). Monthly retention = 96%.
**exact_prompt_to_opsiq:** "What is the average customer lifetime in months implied by this churn? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Average lifetime = 1 ÷ churn = 1 ÷ 0.04.
**expected_answer:** 25 months.
**tolerance_band:** 24.5–25.5 months.
**common_wrong_answers:** 1 ÷ 0.96 = 1.04 (using retention); 12 ÷ 0.04 = 300 (units error).
**scoring_notes:** Full credit requires 25 months from 1/churn.

### CASE_SCORING_GUIDE
**full_credit:** 25 months via 1/churn.
**partial_credit:** Correct method, minor rounding.
**automatic_fail_conditions:** Using retention rate in denominator; unit errors; inventing churn figures.
**dangerous_recommendations:** LTV claims off a wrong lifetime.
**false_confidence_traps:** Mixing monthly and annual churn.
**evidence_that_should_be_used:** Monthly churn 4%.
**evidence_that_should_not_be_invented:** ARPA, discount rate.

---

## CASE PD-005: LTV : CAC Ratio

**case_id:** PD-005
**case_name:** Unit-Economics LTV:CAC
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** SaaS Unit Economics
**data_source:** SaaS unit-economics benchmark (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** LTV = ARPA × GM% × (1/churn); ratio = LTV ÷ CAC
**tolerance:** ±0.1
**why_case_is_not_too_easy:** Multi-step; tempts omitting gross margin or mis-deriving lifetime.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** ARPA = $100/month. Gross margin = 80%. Monthly churn = 5.0%. CAC = $400.
**exact_prompt_to_opsiq:** "What is the LTV:CAC ratio? Show each step."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Lifetime = 1/0.05 = 20 months. LTV = 100 × 0.80 × 20 = $1,600. Ratio = 1,600 ÷ 400.
**expected_answer:** 4.0 : 1.
**tolerance_band:** 3.9–4.1.
**common_wrong_answers:** 5.0 (omitting gross margin: 100×20/400); 0.8 (single-month).
**scoring_notes:** Full credit requires 4.0:1 with margin and lifetime applied.

### CASE_SCORING_GUIDE
**full_credit:** 4.0:1 with full method.
**partial_credit:** Correct structure, one slip (e.g., margin omitted but lifetime right) → partial.
**automatic_fail_conditions:** Omitting churn-derived lifetime; inventing inputs.
**dangerous_recommendations:** "Scale spend" off an inflated ratio.
**false_confidence_traps:** Ignoring gross margin inflates LTV.
**evidence_that_should_be_used:** ARPA $100; GM 80%; churn 5%; CAC $400.
**evidence_that_should_not_be_invented:** Expansion revenue, discount rate.

---

## CASE PD-006: Comparable-Store Sales Growth

**case_id:** PD-006
**case_name:** Same-Store Sales Growth %
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Retail
**data_source:** Public retailer comparable-sales disclosure (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** Growth % = (Current − Prior) ÷ Prior
**tolerance:** ±0.1 percentage points
**why_case_is_not_too_easy:** Tempts including new-store revenue (the question is comparable/same-store only).
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Comparable-store sales this year = $5,250,000. Same comparable base last year = $5,000,000. (Total company sales including new stores = $6,400,000 — distractor.)
**exact_prompt_to_opsiq:** "What is the comparable-store (same-store) sales growth percentage? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Growth = (5,250,000 − 5,000,000) ÷ 5,000,000 = 250,000 ÷ 5,000,000.
**expected_answer:** 5.0%.
**tolerance_band:** 4.9%–5.1%.
**common_wrong_answers:** Using $6,400,000 total (28% — includes new stores).
**scoring_notes:** Full credit requires 5.0% on the comparable base only.

### CASE_SCORING_GUIDE
**full_credit:** 5.0% on comparable base.
**partial_credit:** Correct method, rounding.
**automatic_fail_conditions:** Including new-store revenue; inventing figures.
**dangerous_recommendations:** Expansion advice off an inflated growth number.
**false_confidence_traps:** Total sales vs comparable sales confusion.
**evidence_that_should_be_used:** Comparable $5.25M vs $5.0M.
**evidence_that_should_not_be_invented:** Traffic, ticket size.

---

## CASE PD-007: Inventory Days (DIO)

**case_id:** PD-007
**case_name:** Days Inventory Outstanding
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Retailer 10-K
**data_source:** Public retailer 10-K (COGS + average inventory; representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** Turnover = COGS ÷ Avg Inventory; DIO = 365 ÷ Turnover
**tolerance:** ±1 day
**why_case_is_not_too_easy:** Tempts using revenue instead of COGS, or skipping the turnover step.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Annual COGS = $7,300,000. Average inventory = $1,000,000. (Annual revenue $11,000,000 — distractor.)
**exact_prompt_to_opsiq:** "What is the days-inventory-outstanding (DIO)? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Turnover = 7,300,000 ÷ 1,000,000 = 7.3. DIO = 365 ÷ 7.3.
**expected_answer:** 50 days.
**tolerance_band:** 49–51 days.
**common_wrong_answers:** Using revenue $11M → turnover 11 → 33 days.
**scoring_notes:** Full credit requires 50 days using COGS.

### CASE_SCORING_GUIDE
**full_credit:** 50 days via COGS-based turnover.
**partial_credit:** Correct method, rounding.
**automatic_fail_conditions:** Using revenue instead of COGS; inventing inventory figures.
**dangerous_recommendations:** Inventory-cut advice off a wrong DIO.
**false_confidence_traps:** Revenue-based turnover.
**evidence_that_should_be_used:** COGS $7.3M; avg inventory $1.0M.
**evidence_that_should_not_be_invented:** Seasonality, SKU mix.

---

## CASE PD-008: Cash Runway

**case_id:** PD-008
**case_name:** Months of Cash Runway
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Startup Finance
**data_source:** Startup finance norms / public filings (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** Runway = Cash ÷ Net Monthly Burn
**tolerance:** ±0.2 months
**why_case_is_not_too_easy:** Tempts using gross burn (ignoring revenue inflow) instead of net burn.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Cash on hand = $600,000. Monthly cash operating expenses = $125,000. Monthly cash revenue = $50,000.
**exact_prompt_to_opsiq:** "How many months of runway remain at the current net burn? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** Net burn = 125,000 − 50,000 = $75,000/mo. Runway = 600,000 ÷ 75,000.
**expected_answer:** 8.0 months.
**tolerance_band:** 7.8–8.2 months.
**common_wrong_answers:** 4.8 months (gross burn $125k, ignoring revenue).
**scoring_notes:** Full credit requires 8.0 months using net burn.

### CASE_SCORING_GUIDE
**full_credit:** 8.0 months via net burn $75k.
**partial_credit:** Correct method, rounding.
**automatic_fail_conditions:** Using gross burn; inventing burn figures.
**dangerous_recommendations:** Hiring/spend advice off an overstated runway.
**false_confidence_traps:** Gross vs net burn.
**evidence_that_should_be_used:** Cash $600k; opex $125k; revenue $50k.
**evidence_that_should_not_be_invented:** Future fundraising, one-offs.

---

## CASE PD-009: ROAS and Margin-Adjusted ROAS

**case_id:** PD-009
**case_name:** Return on Ad Spend (and Profit-Adjusted)
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Marketing
**data_source:** Marketing performance benchmark (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** ROAS = Attributed Revenue ÷ Ad Spend; margin-adjusted ROAS = (Revenue × GM) ÷ Ad Spend
**tolerance:** ±0.05x
**why_case_is_not_too_easy:** A "good" 4x ROAS can be unprofitable after margin; the margin-adjusted figure is the decision-relevant one.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Ad spend = $50,000. Attributed revenue = $200,000. Gross margin = 50%.
**exact_prompt_to_opsiq:** "What is the ROAS, and the margin-adjusted (gross-profit) ROAS? Which is decision-relevant? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** ROAS = 200,000 ÷ 50,000 = 4.0x. Margin-adjusted = (200,000 × 0.50) ÷ 50,000 = 100,000 ÷ 50,000 = 2.0x.
**expected_answer:** ROAS 4.0x; margin-adjusted 2.0x (the gross-profit-on-spend figure is the decision-relevant one).
**tolerance_band:** 3.95–4.05x and 1.95–2.05x.
**common_wrong_answers:** Reporting only 4.0x and calling it "profit"; omitting margin entirely.
**scoring_notes:** Full credit requires BOTH figures AND noting the margin-adjusted one drives the profitability decision.

### CASE_SCORING_GUIDE
**full_credit:** 4.0x and 2.0x, with margin-adjusted flagged as decision-relevant.
**partial_credit:** Correct ROAS 4.0x but missing margin adjustment.
**automatic_fail_conditions:** Calling 4.0x ROAS "profit"; inventing margin.
**dangerous_recommendations:** "Scale spend, it's 4x profitable" (ignores margin).
**false_confidence_traps:** Revenue ROAS mistaken for profit.
**evidence_that_should_be_used:** Spend $50k; revenue $200k; GM 50%.
**evidence_that_should_not_be_invented:** Incrementality not stated (note: attributed ≠ incremental; flagging this is a bonus, not required).

---

## CASE PD-010: Revenue CAGR (3-Year)

**case_id:** PD-010
**case_name:** Compound Annual Growth Rate
**case_type:** PUBLIC_DATASET_CALCULATION
**domain:** Public Company Revenue Series
**data_source:** Public company 10-K revenue series (representative)
**source_quality_score:** 8/10
**contamination_risk:** LOW
**calculation_tested:** CAGR = (End ÷ Start)^(1/n) − 1
**tolerance:** ±0.2 percentage points
**why_case_is_not_too_easy:** Tempts a simple average growth rate instead of the compound rate; wrong n.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

### CASE_INPUT_VISIBLE_TO_OPSIQ
**provided_data:** Revenue Year 0 = $10,000,000. Revenue Year 3 = $17,280,000. (Years 1 and 2 not provided.)
**exact_prompt_to_opsiq:** "What is the 3-year revenue CAGR? Show the method."

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ
**formula:** CAGR = (17,280,000 ÷ 10,000,000)^(1/3) − 1 = (1.728)^(1/3) − 1 = 1.20 − 1.
**expected_answer:** 20.0%.
**tolerance_band:** 19.8%–20.2%.
**common_wrong_answers:** 72.8% ÷ 3 = 24.3% (simple-average error); using n=2 or n=4.
**scoring_notes:** Full credit requires 20.0% via the compound formula with n=3.

### CASE_SCORING_GUIDE
**full_credit:** 20.0% via CAGR with n=3.
**partial_credit:** Correct formula, rounding, or off-by-one n with method shown.
**automatic_fail_conditions:** Simple-average growth; inventing intermediate-year figures.
**dangerous_recommendations:** Projection/valuation advice off an overstated growth rate.
**false_confidence_traps:** Total-growth-over-3-years presented as annual rate.
**evidence_that_should_be_used:** Year 0 $10M; Year 3 $17.28M; n=3.
**evidence_that_should_not_be_invented:** Years 1–2 values (not provided; not needed).

---

## PUBLIC_DATASET_CASE_PACK_CLOSEOUT

**total_cases_created:** 10
**total_cases_accepted:** 10
**calculations_covered:** break-even, gross margin, CAC payback, churn-implied lifetime, LTV:CAC, comparable-sales growth, inventory days, cash runway, ROAS (+margin-adjusted), CAGR
**average_expected_answer_quality:** 9.0/10
**average_case_quality:** 8.5/10
**all_deterministic_with_tolerance:** true
**contamination_risk:** LOW for all 10 (computation cannot be memorized)
**cases_ready_for_round_1:** 10/10
**final_status:** PUBLIC_DATASET_CASE_PACK_READY
