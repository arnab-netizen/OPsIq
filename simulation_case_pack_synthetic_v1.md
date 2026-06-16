# Synthetic Simulation Case Pack v1 for OpsIQ Benchmark

**Purpose:** Hand-authored, leakage-controlled, business-mechanics-driven case studies for OpsIQ consultant-quality benchmark testing. These cases are SYNTHETIC: realistic scenarios built on sound business logic (contribution margin, CAC payback, runway, channel concentration, etc.). They are not real companies and are not sourced from the web. Each has a clear, defensible expected answer derived deterministically from the visible numbers.

**Date Created:** 2026-06-16

**Total Cases:** 10 (all accepted for Round 1)

---

## Usage Rules

1. **VISIBLE INPUT ONLY**: OpsIQ receives only CASE_INPUT_VISIBLE_TO_OPSIQ sections.
2. **HIDDEN ANSWERS**: CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ must not be included in the OpsIQ prompt.
3. **SCORING AFTER**: CASE_SCORING_GUIDE used only after OpsIQ produces output.
4. **NO LEAKAGE**: Root cause, expert conclusion, supporting calculation, and scoring notes are never visible to OpsIQ.
5. **DETERMINISTIC MATH**: Because numbers are authored, the expected root cause follows logically and is checkable. At least 4 cases hinge on an explicit quantitative calculation.
6. **INDUSTRY MIX**: 2 local service, 2 restaurant/food, 2 SaaS/subscription, 1 retail/e-commerce, 1 cash-crisis/turnaround, 1 marketing-spend, 1 professional-services/agency.

---

## Leakage Prevention Rules

- Visible prompt includes revenue, trend, cost/margin, customer/channel signal, operational constraint, owner constraint, decision pressure, and explicit missing data.
- Visible prompt excludes: expected root cause, supporting calculation, expert conclusion, what later worked, scoring notes.
- Answer key clearly marked HIDDEN_FROM_OPSIQ.
- Scoring guide includes automatic-fail conditions (hallucinations, dangerous recommendations, false confidence).
- Every case forces PRIORITIZATION among competing plausible actions; none is a single-lever "sales are down, what now" prompt.

---

## Case Quality Thresholds

**Minimum Required:**
- data_quality_score ≥ 7/10
- expected_answer_quality_score ≥ 8/10
- total_case_quality_score ≥ 7.5/10

**Rejection Criteria:**
- Expected answer vague or non-falsifiable
- Root cause not derivable from the visible numbers
- Outcome or calculation leaks into visible prompt
- Case allows multiple equally-correct first actions with no defensible best
- Case cannot be scored fairly

---

## Index of Cases

| Case ID | Case Name | Industry | Design Basis | Data Quality | Answer Quality | Overall |
|---------|-----------|----------|--------------|---|---|---|
| SYN-001 | Tide & Time Laundromat | Local Service | Contribution-margin break-even per machine | 8/10 | 9/10 | 8.5/10 |
| SYN-002 | BrightPath HVAC | Local Service | Capacity bottleneck vs. lead conversion | 8/10 | 8/10 | 8.0/10 |
| SYN-003 | Nonna's Trattoria | Restaurant/Food | Prime cost ratio and menu margin | 8/10 | 9/10 | 8.5/10 |
| SYN-004 | Crumb & Co Ghost Kitchen | Restaurant/Food | Delivery-platform commission margin collapse | 9/10 | 9/10 | 9.0/10 |
| SYN-005 | LedgerLoop SaaS | SaaS/Subscription | CAC payback vs. cash runway | 9/10 | 9/10 | 9.0/10 |
| SYN-006 | FitStream Subscription | SaaS/Subscription | Churn-driven LTV collapse vs. acquisition | 9/10 | 9/10 | 9.0/10 |
| SYN-007 | Lumen & Loom E-Commerce | Retail/E-Commerce | Channel concentration + return rate margin drain | 8/10 | 8/10 | 8.0/10 |
| SYN-008 | Harbor Mill Furniture | Cash-Crisis/Turnaround | Working-capital runway vs. covenant breach | 9/10 | 9/10 | 9.0/10 |
| SYN-009 | Velocity Apparel Ads | Marketing-Spend | Blended vs. incremental ROAS / MER | 8/10 | 9/10 | 8.5/10 |
| SYN-010 | Northwind Creative Agency | Professional-Services/Agency | Utilization, realization, and client concentration | 8/10 | 8/10 | 8.0/10 |

**Average Data Quality:** 8.3/10
**Average Answer Quality:** 8.7/10
**Average Case Quality:** 8.45/10

---

# CASES

---

## CASE SYN-001: Tide & Time Laundromat

**case_id:** SYN-001
**case_name:** Tide & Time Laundromat: Revenue Up, Cash Down
**case_type:** SYNTHETIC_CASE
**industry:** Local Service / Self-Service Laundry
**business_model:** Owner-operated self-service laundromat (coin/card vend) plus wash-dry-fold service
**business_stage:** Mature single location, 6 years operating
**geography:** Synthetic / illustrative
**design_basis:** Contribution-margin break-even per machine; utility cost as variable cost mistaken for fixed
**why_case_is_not_too_easy:** Revenue grew year over year, so the surface story is "growth." The owner wants to add a second location. But the new wash-dry-fold line, which drove the revenue growth, is sold below its true variable cost once water/gas/labor are loaded in. OpsIQ must reject the "expand" framing and prove that the growth line destroys contribution. The math is the test.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Owner-operator
- Business: Single laundromat, 24 washers + 24 dryers, plus a 12-month-old wash-dry-fold (WDF) service
- Time available: ~50 hrs/week on site; one part-time attendant

**stated_problem:**
"Revenue is up 22% this year, mostly from our new wash-dry-fold service. But my bank balance is flat and I'm working more than ever. I want to open a second location to keep the momentum going. How fast can I scale?"

**visible_financial_data:**
- Total revenue this year: $360,000 (last year: $295,000)
- Self-service vend revenue: $240,000 (roughly flat vs. last year's $235,000)
- Wash-dry-fold (WDF) revenue: $120,000 (last year: $60,000, launched mid-year)
- WDF priced at $1.75 per pound
- Rent + fixed utilities baseline + insurance + loan: $138,000/year (fixed)
- Variable water/sewer + gas per WDF pound processed: $0.95/lb
- Attendant + owner labor allocated to WDF: $0.85/lb (WDF is labor-intensive: sorting, folding)
- Detergent/supplies for WDF: $0.20/lb
- Self-service vend contribution margin: ~70% after machine water/gas
- Net cash change for the year: approximately $0

**visible_sales_data:**
- WDF volume this year: ~68,570 lbs (= $120,000 / $1.75)
- WDF customers: mostly local apartment dwellers and two small Airbnb cleaning accounts
- Self-service foot traffic: stable, weekend peaks
- WDF demand is growing ~10% per quarter

**visible_operations_data:**
- WDF turnaround promised: same-day, which forces overtime and rushed sorting
- Machines are sometimes tied up on WDF loads during peak self-service hours
- No per-line P&L is kept; owner looks only at total revenue and bank balance

**visible_marketing_data:**
- WDF promoted via a $0.99/lb launch coupon (now expired) and word of mouth
- No paid acquisition currently

**visible_customer_data:**
- WDF is well-reviewed; customers value convenience
- Two Airbnb accounts represent ~30% of WDF poundage

**visible_constraints:**
- Owner is already at ~50 hrs/week
- Only one part-time attendant
- A second location would require a personal-guarantee loan

**known_limitations:**
- No per-line profit and loss is currently tracked
- Exact split of utility cost between self-service and WDF is estimated, not metered separately
- No data on how much WDF cannibalizes peak-hour self-service capacity

**exact_prompt_to_opsiq:**

*"A laundromat owner grew total revenue 22% (from $295K to $360K) by launching a wash-dry-fold service, but year-over-year cash is flat and the owner is working more hours. The owner wants to open a second location. Self-service vend revenue is ~$240K at ~70% contribution; WDF revenue is $120K at $1.75/lb with variable costs of $0.95/lb water-gas, $0.85/lb labor, and $0.20/lb supplies. Fixed costs are $138K/year. What is the root cause of the flat cash despite growth? What is the first priority action? What should the owner do about the second-location plan?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
The growth line (WDF) is sold below its loaded variable cost and therefore generates negative contribution. Total per-pound variable cost is $0.95 + $0.85 + $0.20 = $2.00/lb, but the price is only $1.75/lb. Every pound processed loses $0.25 of contribution. The revenue growth is real but is funded by destroying margin, which is why cash is flat while hours rise. Scaling this line (or a second location built on it) would accelerate cash loss.

**supporting_calculation:**
- WDF variable cost per lb: $0.95 + $0.85 + $0.20 = $2.00
- WDF price per lb: $1.75
- WDF contribution per lb: $1.75 − $2.00 = **−$0.25/lb**
- WDF volume: $120,000 / $1.75 ≈ 68,570 lbs
- WDF total contribution: 68,570 × (−$0.25) ≈ **−$17,140/year**
- Self-service contribution: $240,000 × 0.70 = **$168,000**
- Total contribution: $168,000 − $17,140 = $150,860
- Fixed costs: $138,000
- Implied owner cash before owner's own draw: ~$12,860, consistent with "roughly flat cash" once the owner takes any draw and absorbs overtime — and the WDF line is the drag, not the support.
- Counterfactual: dropping WDF entirely would *raise* contribution by ~$17,140 and free peak capacity.

**expected_first_priority_action:**
Stop selling WDF below cost. Immediately reprice WDF to a true break-even-plus-target margin (at minimum above $2.00/lb; e.g., $2.49–$2.79/lb), and renegotiate or reprice the two Airbnb accounts that consume 30% of poundage. Build a simple per-line P&L before any expansion decision.

**why_first:** The negative-contribution line is the direct cause of the flat cash. No other action (marketing, second location, more staff) helps until the unit economics of the existing growth line are fixed; expanding a money-losing service multiplies the loss.

**known_bad_actions:**
- Opening a second location now (multiplies a negative-contribution line and adds debt).
- Increasing marketing spend on WDF (drives more loss per pound).
- Hiring more staff to chase WDF volume (adds the very labor cost that makes WDF unprofitable).
- Cutting price further or re-running the $0.99/lb coupon.

**accepted_alternative_answers:**
- Repricing WDF and simultaneously deciding whether to keep it after measuring true demand at a profitable price.
- Discontinuing WDF and redirecting peak capacity to high-margin self-service if demand supports it.
- Keeping WDF only for accounts that accept a margin-positive price; dropping below-cost accounts.

**scoring_notes:**
- Full credit requires identifying negative WDF contribution with the $2.00 vs. $1.75 math and rejecting the second location until fixed.
- The "revenue is up, so expand" framing is the trap; rewarding expansion is a fail.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- States WDF variable cost ($2.00/lb) exceeds price ($1.75/lb), so contribution is negative (−$0.25/lb).
- Explains that the growth line is cannibalizing cash and capacity, which is why revenue rose but cash did not.

**root_cause_partial_credit:**
- Identifies WDF as unprofitable or "underpriced" without the explicit per-pound math.
- Identifies that labor/owner hours are not being costed into the service.

**first_priority_action_full_credit:**
- Reprice WDF above true variable cost (≥ ~$2.00/lb, ideally $2.49–$2.79) and/or drop below-cost accounts; build per-line P&L; defer expansion.

**first_priority_action_partial_credit:**
- Recommends measuring per-line profitability before expanding, even without the specific price.

**automatic_fail_conditions:**
- Recommends opening the second location now.
- Recommends scaling WDF volume via marketing or more staff without repricing.
- Concludes the business is healthy because revenue grew.

**dangerous_recommendations:**
- "Borrow against the growth to open location two."
- "Run another low-price coupon to build WDF volume."

**false_confidence_traps:**
- Treating 22% revenue growth as proof of health.
- Treating water/gas/labor as fixed costs already covered by rent.

**missing_data_that_should_be_flagged:**
- Separately metered utility split between self-service and WDF.
- Peak-hour capacity lost to WDF loads.
- True WDF demand at a profitable price.

**evidence_that_should_be_used:**
- $1.75 price vs. $0.95 + $0.85 + $0.20 cost stack; flat cash; rising hours.

**evidence_that_should_not_be_invented:**
- Specific second-location rent or revenue.
- Competitor pricing not provided.

---

## CASE SYN-002: BrightPath HVAC

**case_id:** SYN-002
**case_name:** BrightPath HVAC: Leads Up, Booked Jobs Flat
**case_type:** SYNTHETIC_CASE
**industry:** Local Service / Residential HVAC
**business_model:** Residential heating/cooling install and repair, owner plus 3 technicians
**business_stage:** Established, 8 years, single market
**geography:** Synthetic / illustrative
**design_basis:** Capacity/scheduling bottleneck vs. lead-volume spend; throughput constraint
**why_case_is_not_too_easy:** The owner is buying more leads to grow, and lead volume is indeed rising, but booked revenue is flat. The intuitive fix (buy more leads) is wrong because the constraint is install capacity and slow quote-to-schedule turnaround, not demand. OpsIQ must locate the bottleneck and stop the wasteful spend.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Owner; also acts as lead estimator and dispatcher
- Team: 3 install/service technicians, 1 office admin
- The owner personally writes every quote in the evenings

**stated_problem:**
"I doubled my lead spend this year and I'm getting way more calls, but my revenue is basically flat. I think I need even more leads or a bigger ad budget. Should I increase spend again?"

**visible_financial_data:**
- Revenue this year: $1,180,000 (last year: $1,140,000) — up 3.5%
- Lead/marketing spend: $96,000 (last year: $48,000) — up 100%
- Average installed job value: ~$8,500; average repair ticket: ~$420
- Gross margin on installs: ~38%; on repairs: ~55%

**visible_sales_data:**
- Inbound leads this year: 1,420 (last year: 720) — up ~97%
- Quotes actually sent: 610
- Jobs booked: 132 installs + 940 repairs
- Quote-to-booking close rate: 132 / 610 ≈ 21.6% (last year ~34%)
- Median time from site visit to quote delivered: 9 days (last year ~3 days)
- Median time from accepted quote to install scheduled: 6 weeks

**visible_operations_data:**
- 3 technicians are booked solid 5–6 weeks out
- Owner is the sole estimator; quote backlog sits in his evening queue
- Many leads never receive a quote because the owner cannot keep up
- No CRM follow-up; leads that go cold are not recontacted

**visible_marketing_data:**
- Spend split: paid search and local services ads
- Cost per lead: ~$68
- No tracking of lead-to-quote or quote-to-close by source

**visible_customer_data:**
- Customers report choosing a competitor "because they quoted faster"
- Repeat/maintenance customers are loyal

**visible_constraints:**
- Hiring a 4th technician takes ~3 months (recruit + ramp)
- Owner is the bottleneck for quoting but resists delegating estimates
- Cash is adequate but not unlimited

**known_limitations:**
- No source-level conversion data
- No measure of how many leads went unquoted
- No data on competitor scheduling lead times

**exact_prompt_to_opsiq:**

*"An HVAC owner doubled lead spend from $48K to $96K; leads nearly doubled (720 to 1,420) but revenue rose only 3.5% ($1.14M to $1.18M). Quotes sent: 610. Jobs booked: 132 installs + 940 repairs. Close rate fell from ~34% to ~22%. Median visit-to-quote time rose from 3 to 9 days; accepted jobs wait 6 weeks to schedule. Three techs are booked solid; the owner is the sole estimator. The owner wants to increase ad spend again. What is the root cause of flat revenue despite more leads? What is the first priority action? Should ad spend increase?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
The business is capacity- and throughput-constrained, not demand-constrained. The binding bottleneck is the owner-as-sole-estimator (quote turnaround ballooned from 3 to 9 days, collapsing close rate from 34% to 22%) plus install capacity (3 techs booked 6 weeks out). Extra leads pile up unquoted and go cold, so doubling lead spend bought almost no incremental revenue. The marginal lead dollar is wasted.

**supporting_calculation:**
- Leads up ~97% (720 → 1,420); revenue up 3.5%. Marginal leads converted to almost nothing.
- Lead spend $48K → $96K (+$48K); incremental revenue ~$40K at ~40% blended GM ≈ $16K gross profit gained for $48K extra spend → **negative ROI on the marginal $48K**.
- Conversion funnel: 1,420 leads → 610 quotes (57% of leads never quoted) → 132 installs (21.6% close vs. 34% prior).
- Recovering the prior 34% close on the 610 quotes already sent would yield ~207 installs vs. 132 — ~75 additional installs × $8,500 × 38% GM ≈ **$242,000 incremental gross profit** with zero extra lead spend.

**expected_first_priority_action:**
Fix the throughput bottleneck before spending another dollar on leads: get estimating off the owner's evening queue (hire/delegate an estimator or adopt same-/next-day quoting), implement systematic quote follow-up, and add install capacity. Freeze or cut the incremental lead budget until quote turnaround and close rate recover.

**why_first:** The funnel proves the constraint is internal. Every additional lead at $68 is wasted while 57% of leads go unquoted and close rate is falling. Restoring quote speed converts already-paid-for demand at far higher ROI than buying more.

**known_bad_actions:**
- Increasing ad spend again.
- Buying from more lead sources.
- Discounting to win price-shoppers (problem is speed, not price).

**accepted_alternative_answers:**
- Prioritize hiring/training a dedicated estimator and a 4th technician; redirect lead budget to capacity.
- Triage leads to highest-value installs given the capacity ceiling and pause low-value lead channels.

**scoring_notes:**
- Full credit requires naming the owner/estimating bottleneck and slow quote turnaround as the binding constraint and rejecting more ad spend.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Identifies internal throughput/capacity constraint (estimating bottleneck + 6-week install backlog) as binding; demand is not the problem.
- Connects 9-day quote time and unquoted leads to the fallen close rate and wasted lead spend.

**root_cause_partial_credit:**
- Identifies "leads aren't converting" or "capacity issue" without the funnel/turnaround diagnosis.

**first_priority_action_full_credit:**
- Offload estimating from owner / accelerate quoting + add install capacity; freeze incremental lead spend.

**first_priority_action_partial_credit:**
- Recommends improving close rate or follow-up without addressing the estimator bottleneck or spend freeze.

**automatic_fail_conditions:**
- Recommends increasing ad/lead spend.
- Recommends discounting as the primary lever.

**dangerous_recommendations:**
- "Triple the ad budget to grow faster."
- "Add a second lead vendor for volume."

**false_confidence_traps:**
- Treating rising lead count as progress.
- Assuming flat revenue means weak demand.

**missing_data_that_should_be_flagged:**
- Source-level conversion; number of leads never quoted; competitor scheduling speed.

**evidence_that_should_be_used:**
- Lead-to-quote gap, quote turnaround time, close-rate drop, install backlog.

**evidence_that_should_not_be_invented:**
- Specific competitor pricing; exact cost of a new hire not stated.

---

## CASE SYN-003: Nonna's Trattoria

**case_id:** SYN-003
**case_name:** Nonna's Trattoria: Full House, Empty Till
**case_type:** SYNTHETIC_CASE
**industry:** Restaurant / Full-Service Italian
**business_model:** Independent 60-seat dine-in restaurant, dinner-focused
**business_stage:** Mature, 5 years, single location
**geography:** Synthetic / illustrative
**design_basis:** Prime cost ratio (food + labor as % of sales) and menu-mix margin
**why_case_is_not_too_easy:** Covers are full and sales are healthy, so the owner blames "rent and the economy." The real problem is prime cost: food cost and labor together run 74% of sales versus a sustainable ~60–65%, driven by an over-portioned, ingredient-heavy menu and overstaffed shifts. OpsIQ must compute prime cost and target the controllable largest line, not rent.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Owner / head chef, works the line nightly
- Front of house run by a manager; kitchen has 4 cooks per dinner shift

**stated_problem:**
"We're busy almost every night — 85% of seats filled on weekends — but I'm barely breaking even. I think my rent is too high and the economy is hurting us. Should I try to renegotiate the lease or cut the menu price to drive even more covers?"

**visible_financial_data:**
- Monthly sales: $150,000
- Food cost (COGS): $58,500/month (39% of sales)
- Labor cost (kitchen + FOH, fully loaded): $52,500/month (35% of sales)
- Rent: $12,000/month (8% of sales)
- Other operating (utilities, supplies, marketing, insurance): $18,000/month (12%)
- Owner's net: roughly $9,000/month (6%) before the owner's own living draw
- Industry healthy benchmarks: food cost 28–32%, labor 28–33%, prime cost 55–65%

**visible_sales_data:**
- Average check: $42
- Covers per month: ~3,570
- Weekend seat-fill: ~85%; weekday: ~45%
- Top sellers are the most ingredient-heavy, large-portion pasta and seafood dishes
- Menu has 38 items; many low-volume items require unique perishable ingredients

**visible_operations_data:**
- Portions are generous; significant plate waste returns to dish pit
- 4 cooks per dinner shift regardless of weekday vs. weekend demand
- No recipe costing or portion standards documented
- Weekly food waste/spoilage from low-volume menu items is notable

**visible_marketing_data:**
- Mostly organic and repeat; modest local social spend
- No discount program currently

**visible_customer_data:**
- Strong reviews; guests praise large portions and variety
- Loyal repeat base

**visible_constraints:**
- Owner resists shrinking portions for fear of reviews
- Lease has 3 years remaining; landlord unlikely to cut a below-market rent

**known_limitations:**
- No per-dish margin or recipe costing exists
- No labor productivity data by shift/day
- No measured spoilage figure for the 38-item menu

**exact_prompt_to_opsiq:**

*"An Italian restaurant runs $150K monthly sales with food cost at 39% and labor at 35% of sales; rent is 8%, other opex 12%, leaving ~6% before the owner's draw. Covers are strong (85% weekend fill). Healthy benchmarks are food 28–32%, labor 28–33%, prime cost 55–65%. The 38-item menu favors large-portion, ingredient-heavy dishes; 4 cooks staff every dinner shift regardless of demand; no recipe costing exists. The owner blames rent and wants to renegotiate the lease or cut menu prices to drive more covers. What is the root cause of the thin profit? What is the first priority action?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
Prime cost (food + labor) is 39% + 35% = 74% of sales, roughly 9–19 points above the healthy 55–65% band. The profit drain is the two largest, controllable cost lines — over-portioning/menu complexity inflating food cost, and inflexible over-staffing inflating labor — not rent (8%, already below typical) and not insufficient covers. Cutting price would worsen prime cost ratio.

**supporting_calculation:**
- Prime cost = food 39% + labor 35% = **74% of sales**.
- Bringing prime cost to a 62% target on $150K = $93,000, vs. current $111,000 (food $58,500 + labor $52,500) → **$18,000/month** of recoverable margin.
- Even a partial fix (food to 33%, labor to 31% = 64% prime) recovers ($150K × (74%−64%)) = **$15,000/month**, tripling current net.
- Rent is 8% — already below the typical 6–10% upper range for full-service; renegotiation upside is small ($12K base).
- Price cut to "drive covers" raises COGS and labor with volume while lowering check — worsens the 74% ratio.

**expected_first_priority_action:**
Attack prime cost: institute recipe costing and portion standards (target food cost toward ~32%), and flex kitchen labor to demand (reduce cooks on the 45%-fill weekdays). Trim the 38-item menu of low-volume, high-spoilage items. Defer any lease renegotiation and reject the price cut.

**why_first:** Prime cost is 74% and is the single largest, most controllable lever; an 8–12 point reduction multiplies owner net several times over. Rent (8%) and "more covers" cannot move the outcome while prime cost runs this high.

**known_bad_actions:**
- Cutting menu prices to drive more covers (worsens prime-cost ratio).
- Prioritizing lease renegotiation (rent is already low share).
- Adding menu items or marketing spend before fixing portions/labor.

**accepted_alternative_answers:**
- Menu engineering (cut low-margin/low-volume items, re-portion, reprice high-cost dishes upward) plus labor scheduling to demand.
- Raising prices modestly on ingredient-heavy hero dishes rather than cutting.

**scoring_notes:**
- Full credit requires computing 74% prime cost and targeting food + labor, explicitly rejecting rent and price-cut framings.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- States prime cost = 74% (food 39% + labor 35%) vs. 55–65% healthy; identifies portioning/menu complexity and inflexible staffing as the drivers.

**root_cause_partial_credit:**
- Flags high food cost or high labor cost individually without the prime-cost computation.

**first_priority_action_full_credit:**
- Recipe costing/portion control toward ~32% food cost + flex labor to demand + trim menu; defer lease, reject price cut.

**first_priority_action_partial_credit:**
- Recommends controlling food or labor cost without the menu/portion or scheduling specifics.

**automatic_fail_conditions:**
- Recommends cutting menu prices to drive covers.
- Names rent as the primary problem / lease renegotiation as first action.

**dangerous_recommendations:**
- "Discount to fill weekday seats" (deepens the loss per cover).
- "Add more menu variety to attract guests" (raises spoilage and complexity).

**false_confidence_traps:**
- Treating high seat-fill as proof the model is sound.
- Assuming rent is the lever because it "feels" high.

**missing_data_that_should_be_flagged:**
- Per-dish margins/recipe costs; spoilage figure; labor productivity by shift.

**evidence_that_should_be_used:**
- 39% food, 35% labor, 8% rent; benchmark bands; over-portioning and fixed 4-cook staffing.

**evidence_that_should_not_be_invented:**
- Exact spoilage dollars; specific dish costs not given.

---

## CASE SYN-004: Crumb & Co Ghost Kitchen

**case_id:** SYN-004
**case_name:** Crumb & Co: Delivery Volume Soars, Margin Vanishes
**case_type:** SYNTHETIC_CASE
**industry:** Restaurant / Food — Delivery-Only Ghost Kitchen
**business_model:** Delivery-only brand operating from a shared commissary, sold via third-party apps
**business_stage:** Early growth, 18 months
**geography:** Synthetic / illustrative
**design_basis:** Delivery-platform commission compressing contribution margin to negative at the order level
**why_case_is_not_too_easy:** Order volume and gross revenue are climbing fast, and the founder treats the apps as pure growth. But after 30% platform commission plus promotional discounts and packaging, the average order contributes nothing or loses money. OpsIQ must compute per-order contribution net of commission and reject "scale the apps" in favor of channel/price restructuring.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 9.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Founder/operator, 2 line cooks
- Sells exclusively through two third-party delivery apps

**stated_problem:**
"Orders are up 60% in six months and gross sales hit a record. But I never seem to have cash, and I just raised prices on the app and still feel underwater. I want to launch a second virtual brand on the apps to grow even faster. Good idea?"

**visible_financial_data:**
- Monthly gross order value (before app deductions): $90,000
- Average order value (customer-paid): $30
- Orders/month: ~3,000
- Platform commission: 30% of order value
- In-app promotional discount funded by Crumb & Co: average 12% of order value
- Food cost (COGS): 30% of order value
- Packaging per order: $1.40
- Commissary rent + utilities + insurance (fixed): $14,000/month
- Labor (2 cooks + founder allocation): $16,000/month

**visible_sales_data:**
- Order growth: +60% over six months
- ~85% of orders come with an active in-app promotion attached
- Repeat-customer rate via app: low; app users price-shop across brands

**visible_operations_data:**
- Kitchen runs near capacity during dinner rush
- No direct ordering channel (own website/phone) exists
- All customer data is held by the platforms, not Crumb & Co

**visible_marketing_data:**
- Only marketing is in-app promotions and platform placement
- No owned email/SMS list

**visible_customer_data:**
- Customers chosen largely by promotion/price
- No loyalty or direct relationship

**visible_constraints:**
- Founder believes apps are the only realistic channel
- Limited cash buffer (under 1 month of fixed costs)

**known_limitations:**
- No per-order contribution analysis exists
- No data on what share of customers would order direct if offered
- Exact promo participation varies week to week

**exact_prompt_to_opsiq:**

*"A delivery-only ghost kitchen does $90K monthly gross order value at a $30 average order (3,000 orders). Platform commission is 30%; the brand also funds an average 12% in-app discount; food cost is 30% of order value; packaging is $1.40/order. Fixed costs are $14K rent/utilities and $16K labor monthly. Orders grew 60% in six months but cash is always tight; 85% of orders carry a promo. The founder wants to launch a second virtual brand on the same apps. What is the root cause of the cash squeeze? What is the first priority action? Should the founder launch the second brand?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
Per-order contribution after commission, self-funded promos, COGS, and packaging is essentially zero/negative, so scaling app orders scales the loss. The third-party channel takes 30% commission plus 12% promo (42% of order value off the top) before any food cost, leaving almost nothing to cover fixed costs. The cash squeeze is structural channel-margin compression, not a volume problem.

**supporting_calculation:**
- Per $30 order:
  - Commission 30%: −$9.00
  - Self-funded promo 12%: −$3.60
  - Food cost 30%: −$9.00
  - Packaging: −$1.40
  - **Contribution per order = $30 − $9.00 − $3.60 − $9.00 − $1.40 = $7.00**
- Monthly contribution: 3,000 × $7.00 = **$21,000**
- Fixed costs: $14,000 + $16,000 = **$30,000**
- Monthly operating result: $21,000 − $30,000 = **−$9,000** (loss), worsening as volume grows because each added order only contributes $7 against a $10 average fixed cost burden at this scale (fixed/order = $30,000/3,000 = $10).
- Per-order fully-loaded: $7.00 contribution − $10.00 fixed/order = **−$3.00/order** → growth deepens losses.
- A second brand on the same 42%-take channel replicates negative unit economics.

**expected_first_priority_action:**
Fix channel economics before scaling: stop self-funding the 12% promo on most orders, raise app menu prices to offset commission, and stand up a direct ordering channel (own website/SMS, lower or no commission) to convert repeat customers off the 30% platform. Do not launch the second brand until per-order contribution covers fixed cost per order.

**why_first:** Each order loses money fully loaded; more volume on the same channel increases the loss. Restructuring take rate and promo is the only path to positive contribution; a second brand multiplies the defect.

**known_bad_actions:**
- Launching a second virtual brand on the same apps now.
- Increasing in-app promotions to grow orders.
- Cutting food quality to chase margin while leaving 42% channel take untouched.

**accepted_alternative_answers:**
- Renegotiate commission tier / drop one platform; build owned channel; reprice to neutralize commission.
- Reduce promo dependence and re-target only profitable order mixes.

**scoring_notes:**
- Full credit requires the per-order contribution math (~$7 vs. $10 fixed/order = −$3) and rejecting the second brand.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Computes that commission + promo + COGS + packaging leave ~$7 contribution against ~$10 fixed cost per order, so orders lose money fully loaded; identifies channel-take compression as the cause.

**root_cause_partial_credit:**
- Identifies "platform fees are too high" or "promotions eat margin" without the per-order math.

**first_priority_action_full_credit:**
- Cut self-funded promo + reprice for commission + build a direct channel; defer second brand.

**first_priority_action_partial_credit:**
- Recommends reducing platform dependence OR raising prices, without the combined plan.

**automatic_fail_conditions:**
- Recommends launching the second brand now.
- Recommends increasing promotions/volume on the same channel.

**dangerous_recommendations:**
- "Add more discounts to win the app algorithm."
- "Scale aggressively; margins improve with volume" (false here — fixed/order math worsens).

**false_confidence_traps:**
- Treating gross order value growth as success.
- Assuming volume creates operating leverage when contribution is below fixed-cost-per-order.

**missing_data_that_should_be_flagged:**
- Share of customers who would order direct; true repeat rate; commission tiers available.

**evidence_that_should_be_used:**
- 30% commission, 12% promo, 30% COGS, $1.40 packaging, $30 AOV, $30K fixed.

**evidence_that_should_not_be_invented:**
- Specific direct-channel conversion %; competitor app economics.

---

## CASE SYN-005: LedgerLoop SaaS

**case_id:** SYN-005
**case_name:** LedgerLoop: Growing Fast, Burning Faster
**case_type:** SYNTHETIC_CASE
**industry:** SaaS / B2B Subscription
**business_model:** B2B SaaS, sales-led, monthly + annual plans
**business_stage:** Seed-funded growth-stage, ~2.5 years
**geography:** Synthetic / illustrative
**design_basis:** CAC payback period vs. cash runway; growth that outpaces capital
**why_case_is_not_too_easy:** New-logo MRR is growing nicely, so the board narrative is "keep accelerating sales hiring." But CAC payback is ~20 months while only ~8 months of runway remain. Spending more to acquire customers who pay back over 20 months when the company has 8 months of cash is a path to insolvency. OpsIQ must compute payback and runway and prescribe a survival-first reprioritization.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 9.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: CEO/founder
- Board pressuring for "growth at all costs" to raise a Series A

**stated_problem:**
"New-logo revenue is up 18% quarter over quarter. The board wants me to double the sales team to hit our Series A growth target. I'm planning to hire 6 more reps next month. How aggressively should we scale acquisition?"

**visible_financial_data:**
- Cash in bank: $1,200,000
- Net monthly burn (current): $150,000
- MRR: $130,000 (growing ~6%/month)
- Gross margin: 80%
- Blended CAC (fully loaded sales + marketing per new customer): $9,000
- Average new-customer MRR: $600 (ACV $7,200)
- Monthly logo churn: 3% (gross revenue churn ~3%)

**visible_sales_data:**
- New logos/month: ~22
- Sales cycle: ~75 days
- Pipeline healthy; demand is not the constraint
- Annual prepay adoption: low (~15% of new customers)

**visible_operations_data:**
- Onboarding is manual and engineering-assisted
- Product is stable; support load moderate

**visible_marketing_data:**
- Marketing is ~30% of CAC; rest is sales salaries/commissions
- Pipeline cost-efficient; conversion stable

**visible_customer_data:**
- Customers mid-market; satisfaction solid
- Net revenue retention ~100% (expansion roughly offsets churn)

**visible_constraints:**
- No Series A term sheet in hand; raise expected to take 4–6 months
- Each new rep adds ~$12,000/month fully loaded and ramps over 3 months
- Investors will scrutinize unit economics in diligence

**known_limitations:**
- No cohort LTV by segment
- No scenario model for raise timing
- Annual-prepay impact on cash not modeled

**exact_prompt_to_opsiq:**

*"A B2B SaaS company has $1.2M cash, $150K net monthly burn, MRR $130K growing 6%/month, 80% gross margin. Blended CAC is $9,000; average new-customer MRR is $600 (ACV $7,200); monthly churn 3%; ~22 new logos/month. No Series A term sheet yet (raise takes 4–6 months); each new rep costs ~$12K/month and ramps over 3 months. The board wants to double the sales team to hit a growth target. How aggressively should acquisition scale? What is the root cause of the risk? What is the first priority action?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
CAC payback (~20 months on gross-margin basis) is far longer than the cash runway (~8 months), and no Series A is secured. Doubling sales spend extends payback further out and accelerates burn against a fixed, short runway — creating insolvency risk before customers repay their acquisition cost. The problem is a timing/liquidity mismatch, not weak growth.

**supporting_calculation:**
- Gross-margin CAC payback = CAC / (new-customer MRR × gross margin) = $9,000 / ($600 × 0.80) = $9,000 / $480 = **18.75 months ≈ 19–20 months**.
- Runway = cash / net burn = $1,200,000 / $150,000 = **8 months** (and falling as hiring raises burn).
- Adding 6 reps at ~$12K/month = +$72,000/month burn → new burn ~$222,000 → runway = $1,200,000 / $222,000 ≈ **5.4 months**, with reps unproductive for the first ~3 months.
- Each acquired customer costs $9,000 now but returns only $480/month of gross profit → cash-negative for ~19–20 months, i.e., long past the runway horizon.
- Churn 3%/month implies ~33-month average lifetime, so customers are ultimately profitable — but only if the company survives long enough to collect; liquidity, not LTV, is the binding constraint.

**expected_first_priority_action:**
Prioritize runway/liquidity over acquisition: do NOT double the sales team. Extend runway to cover the 4–6 month raise — cut/defer the rep hiring, push annual prepay to pull cash forward, and right-size burn so runway comfortably exceeds expected raise timing. Scale acquisition only after the raise closes or payback shortens.

**why_first:** With 8 months of runway, ~20-month CAC payback, and no term sheet, the existential risk is running out of cash before the raise. Aggressive acquisition shortens runway below the raise timeline. Survival must precede growth.

**known_bad_actions:**
- Hiring 6 reps now (cuts runway to ~5 months pre-productivity).
- Increasing CAC/marketing to accelerate logos.
- Discounting to close faster, hurting cash and payback.

**accepted_alternative_answers:**
- Raise bridge/extend runway, then resume hiring; shift to annual-prepay to improve cash-based payback.
- Modest, payback-justified hiring only if a term sheet is secured.

**scoring_notes:**
- Full credit requires both numbers: ~19–20 month payback and ~8-month (→~5-month if hiring) runway, and rejecting the doubling.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- States CAC payback (~19–20 months) exceeds runway (~8 months) with no secured raise; identifies the liquidity/timing mismatch.

**root_cause_partial_credit:**
- Notes runway is short OR payback is long without relating the two.

**first_priority_action_full_credit:**
- Preserve runway: do not double sales; extend runway to clear the 4–6 month raise (defer hiring, push annual prepay, cut burn).

**first_priority_action_partial_credit:**
- Recommends slowing hiring or extending runway without quantifying the mismatch.

**automatic_fail_conditions:**
- Recommends doubling or significantly expanding the sales team now.
- Recommends increasing CAC/marketing spend to accelerate growth.

**dangerous_recommendations:**
- "Grow at all costs to hit the Series A number."
- "Discount heavily to win logos faster."

**false_confidence_traps:**
- Treating 18% QoQ growth as a green light irrespective of cash.
- Citing healthy LTV while ignoring that liquidity is the binding constraint.

**missing_data_that_should_be_flagged:**
- Term-sheet probability/timing; cohort LTV by segment; cash impact of annual prepay.

**evidence_that_should_be_used:**
- $9,000 CAC, $600 MRR, 80% GM, $1.2M cash, $150K burn, no term sheet, rep cost/ramp.

**evidence_that_should_not_be_invented:**
- A specific raise amount or valuation; segment LTVs not provided.

---

## CASE SYN-006: FitStream Subscription

**case_id:** SYN-006
**case_name:** FitStream: Filling a Leaky Bucket
**case_type:** SYNTHETIC_CASE
**industry:** SaaS / Consumer Subscription (fitness app)
**business_model:** D2C subscription app, monthly plan, paid-ads acquisition
**business_stage:** Growth-stage, ~2 years
**geography:** Synthetic / illustrative
**design_basis:** Churn-driven LTV collapse vs. CAC; retention as the binding lever
**why_case_is_not_too_easy:** Downloads and new subscribers are strong, and the team wants to pour more into acquisition. But monthly churn is so high that LTV is below CAC — the company pays more to acquire each subscriber than it earns over their lifetime. More acquisition spend on a leaky bucket loses more money. OpsIQ must compute LTV vs. CAC and pivot to retention.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 9.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Co-founder / growth lead
- Team is paid-acquisition heavy; "growth = more installs" mindset

**stated_problem:**
"We're adding 5,000 new subscribers a month and downloads are at an all-time high. I want to push another $50K/month into paid ads to accelerate. Our subscriber count keeps growing, so growth is working — how much more can we spend?"

**visible_financial_data:**
- Subscription price: $15/month
- Gross margin on subscription: ~85% (content + hosting + payment fees)
- Blended CAC (paid ads + creative): $42 per paying subscriber
- Monthly churn: 14%
- New paying subscribers/month: ~5,000
- Total active subscribers: ~38,000 (growth flattening despite high adds)
- Monthly ad spend: $210,000

**visible_sales_data:**
- Free-to-paid conversion: stable
- Add rate high but net growth decelerating (churn offsetting adds)
- Annual plans exist but only ~10% of subscribers choose them

**visible_operations_data:**
- Onboarding is a generic welcome flow; no personalization or habit-building
- Most churn occurs within the first 2 months (weak activation/habit formation)
- No win-back or re-engagement program

**visible_marketing_data:**
- Spend concentrated on top-of-funnel installs
- No lifecycle/retention marketing
- Creative refresh frequent; CAC stable

**visible_customer_data:**
- Engagement (sessions/week) drops sharply after week 2
- Cancel reasons cluster on "didn't build a habit / forgot about it"

**visible_constraints:**
- Investors want efficient growth, not just gross adds
- Limited engineering bandwidth for onboarding rework

**known_limitations:**
- No cohort retention curve published internally
- No measured impact of annual plans on churn
- No activation metric defined

**exact_prompt_to_opsiq:**

*"A consumer fitness subscription charges $15/month at ~85% gross margin. Blended CAC is $42 per paying subscriber; monthly churn is 14%; ~5,000 new paying subs/month; 38,000 active but net growth is flattening; ad spend $210K/month. Most churn happens in the first two months; onboarding is generic; no retention/win-back program exists. The growth lead wants to add $50K/month to paid ads. What is the root cause of the flattening growth and weak economics? What is the first priority action? Should ad spend increase?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
LTV is below CAC because churn is far too high: average subscriber lifetime is ~7 months, yielding ~$89 gross-margin LTV against a $42 CAC — but the real issue is that high early churn is capping net growth and crushing payback efficiency, and pouring more into acquisition pours water into a leaky bucket. The binding lever is first-60-day retention/activation, not acquisition volume.

**supporting_calculation:**
- Average lifetime = 1 / monthly churn = 1 / 0.14 = **~7.1 months**.
- LTV (gross-margin) = price × gross margin × lifetime = $15 × 0.85 × 7.1 = **~$90**.
- LTV/CAC = $90 / $42 ≈ **2.1×** — marginal (3× is the healthy bar) and fragile; CAC payback = $42 / ($15 × 0.85) = $42 / $12.75 ≈ **3.3 months**, nearly half the 7-month lifetime.
- Net growth math: adds 5,000/month; churn 14% × 38,000 = **5,320 lost/month** → net **−320/month** → subscriber base is now shrinking, which is why growth flattened.
- Halving churn from 14% to 7% doubles lifetime to ~14 months and LTV to ~$180 (LTV/CAC ~4.3×) AND flips net growth strongly positive — far more valuable than $50K more ad spend.
- Adding $50K ad spend at $42 CAC buys ~1,190 more subs/month, but at 14% churn most leave within two months; net base barely moves while burn rises.

**expected_first_priority_action:**
Fix early-life retention before adding acquisition spend. Rebuild onboarding/activation for the first 60 days (habit-building, personalization, early-value milestones), launch win-back/re-engagement, and push annual plans to lock in lifetime. Hold or reduce ad spend until churn improves.

**why_first:** Churn (14%) is making the base shrink and keeping LTV/CAC marginal. More acquisition multiplies a leaky bucket. Cutting early churn raises LTV, flips net growth positive, and improves every downstream metric — acquisition spend only pays off after retention is fixed.

**known_bad_actions:**
- Adding $50K/month to paid ads.
- Optimizing only top-of-funnel CAC/creative.
- Discounting acquisition to add more cheap, high-churn installs.

**accepted_alternative_answers:**
- Prioritize activation metric + onboarding rework + annual-plan push; redirect part of ad budget to lifecycle/retention.
- Cohort-analyze churn drivers, then targeted retention before reaccelerating spend.

**scoring_notes:**
- Full credit requires the lifetime (~7 mo), LTV (~$90) vs. CAC ($42), and the net-growth (−320/month) math, and rejecting more ad spend.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Computes ~7-month lifetime, LTV ~$90 vs. CAC $42 (LTV/CAC ~2×), and that churn (5,320) exceeds adds (5,000) so the base is shrinking; names early-life churn as the binding constraint.

**root_cause_partial_credit:**
- Identifies high churn or weak retention without the LTV/CAC or net-growth math.

**first_priority_action_full_credit:**
- Fix first-60-day onboarding/activation + win-back + annual plans; hold/cut ad spend until churn improves.

**first_priority_action_partial_credit:**
- Recommends improving retention generally without targeting early-life churn or pausing spend.

**automatic_fail_conditions:**
- Recommends increasing paid ad spend.
- Frames gross adds/downloads as proof growth is working.

**dangerous_recommendations:**
- "Spend more on installs to outrun churn."
- "Lower price to acquire more users" (worsens LTV and likely churn).

**false_confidence_traps:**
- Treating 5,000 monthly adds as growth while the base shrinks.
- Citing healthy CAC without checking it against LTV.

**missing_data_that_should_be_flagged:**
- Cohort retention curve; activation metric; annual-plan churn impact; churn driver detail.

**evidence_that_should_be_used:**
- $15 price, 85% GM, $42 CAC, 14% churn, 5,000 adds, 38,000 base, first-2-month churn concentration.

**evidence_that_should_not_be_invented:**
- Specific cohort curves; exact engineering effort for onboarding.

---

## CASE SYN-007: Lumen & Loom E-Commerce

**case_id:** SYN-007
**case_name:** Lumen & Loom: One Channel, Thin Margin
**case_type:** SYNTHETIC_CASE
**industry:** Retail / E-Commerce (home textiles DTC)
**business_model:** Direct-to-consumer online store, single dominant ad channel
**business_stage:** Growth-stage, 3 years
**geography:** Synthetic / illustrative
**design_basis:** Channel-concentration risk + return-rate margin drain
**why_case_is_not_too_easy:** Revenue is growing and the brand looks healthy, but ~80% of sales come from one paid channel whose CAC just jumped after a platform change, and a high return rate on a hero product silently erodes contribution. The owner wants to "scale the winning channel." OpsIQ must weigh concentration risk and returns-adjusted margin rather than doubling down blindly.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Founder/CEO
- Lean team; one person manages all paid acquisition

**stated_problem:**
"We grew to $4.2M revenue mostly through one paid social channel that's been our rocket ship. CAC has crept up since the platform's recent targeting changes, but it still works. I want to pour more budget into that channel to hit $6M. How much more can we push?"

**visible_financial_data:**
- Annual revenue: $4,200,000
- Blended gross margin (before returns/shipping): 55%
- Average order value: $95
- Paid-social CAC: rose from $28 to $46 per order over two quarters
- Return rate overall: 12%; on the hero "weighted blanket" line (35% of revenue): 28%
- Return handling + restocking + reverse shipping cost: ~$22 per returned order
- Outbound shipping subsidy (free shipping): ~$9/order

**visible_sales_data:**
- ~80% of revenue from one paid-social channel
- Email/owned channel: ~8% of revenue; organic/SEO: ~7%; marketplaces: ~5%
- Repeat purchase rate: ~18%

**visible_operations_data:**
- 3PL fulfillment; returns processed manually
- Hero product has frequent sizing/expectation complaints driving returns
- No post-purchase or retention email flows beyond a receipt

**visible_marketing_data:**
- Nearly all budget in one channel; creative fatigue rising
- No diversification into search, organic, or retention
- CAC trend clearly worsening

**visible_customer_data:**
- Reviews flag the hero product "heavier/different than expected"
- Email list exists (~40K) but barely monetized

**visible_constraints:**
- Single-channel dependency; platform policy changes outside owner's control
- Limited team bandwidth to open new channels quickly

**known_limitations:**
- No contribution-margin-after-returns by product line is tracked
- No measured LTV by channel
- No cohort data on repeat purchase

**exact_prompt_to_opsiq:**

*"A DTC home-textiles brand at $4.2M revenue gets ~80% of sales from one paid-social channel where CAC rose from $28 to $46/order. AOV is $95, gross margin 55% pre-returns. Overall return rate is 12% but the hero line (35% of revenue) returns at 28%, costing ~$22/return plus a $9/order shipping subsidy. Email (40K list) is ~8% of revenue and barely used. The founder wants to pour more budget into the winning paid-social channel to reach $6M. What is the root cause of the margin and risk concern? What is the first priority action? Should the founder scale that channel?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
Two compounding problems: (1) dangerous channel concentration — ~80% of revenue depends on one paid-social channel whose CAC is rising sharply and whose policy is outside the owner's control; and (2) returns-adjusted margin erosion led by the hero product's 28% return rate. Scaling the deteriorating channel raises CAC further and amplifies returns on the product that drives them. The owner is mistaking a worsening, concentrated channel for a durable rocket ship.

**supporting_calculation:**
- Per order on paid social, hero-heavy: revenue $95; gross profit at 55% = $52.25; less shipping subsidy $9 = $43.25; less rising CAC $46 = **−$2.75 contribution before returns** on the marginal paid-social order at the new CAC.
- Returns drag: hero line 28% return × $22 handling, plus lost margin on returned units, materially lowers effective margin; overall 12% returns × $22 ≈ $2.64/order average just in handling.
- CAC trend: $28 → $46 is +64%; at $46 the channel is at/below breakeven on the margin order, so "pour more in" buys negative-contribution orders.
- Underused assets: 40K email list driving only ~8% of revenue at near-zero marginal CAC is the highest-ROI growth lever available.

**expected_first_priority_action:**
Stop scaling the deteriorating channel at current CAC; instead (a) attack the hero product's 28% return rate (fix sizing/expectations via product detail, photography, weight specs) to recover margin, and (b) diversify demand by activating the owned email list and other channels to reduce single-channel dependency. Cap paid-social spend at the CAC where contribution is positive.

**why_first:** The marginal paid-social order is at or below breakeven once CAC and shipping are loaded, and returns erode it further; concentration makes the business fragile to one platform. Reducing returns and activating low-CAC owned channels improves margin and de-risks growth before any channel scaling.

**known_bad_actions:**
- Pouring more budget into the rising-CAC channel to hit $6M.
- Ignoring the 28% hero-product return rate.
- Treating the email list as a side project.

**accepted_alternative_answers:**
- Returns reduction first (highest margin recovery), then channel diversification.
- Set a CAC ceiling and reallocate spend toward retention/owned channels.

**scoring_notes:**
- Full credit requires naming both concentration risk and returns-adjusted margin, and rejecting unconstrained channel scaling.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Identifies 80% single-channel concentration with rising CAC AND returns-driven margin erosion (28% hero return rate); explains the marginal order is near/below breakeven.

**root_cause_partial_credit:**
- Identifies channel concentration OR the return-rate problem alone.

**first_priority_action_full_credit:**
- Cut hero-product returns + diversify via owned email/other channels; cap paid-social at positive-contribution CAC.

**first_priority_action_partial_credit:**
- Recommends diversifying channels OR fixing returns without the CAC cap.

**automatic_fail_conditions:**
- Recommends scaling the paid-social channel without addressing CAC/returns.
- Ignores the 28% return rate.

**dangerous_recommendations:**
- "Double down on the winning channel to hit $6M."
- "Discount the hero product to sell more" (more returns, lower margin).

**false_confidence_traps:**
- Treating revenue growth as proof the channel is durable.
- Ignoring returns because top-line gross margin "looks fine."

**missing_data_that_should_be_flagged:**
- Contribution margin after returns by line; LTV by channel; repeat cohorts.

**evidence_that_should_be_used:**
- 80% concentration, CAC $28→$46, 28% hero returns, $22 handling, $9 shipping, 40K idle list.

**evidence_that_should_not_be_invented:**
- Specific LTV-by-channel numbers; exact new-channel CAC.

---

## CASE SYN-008: Harbor Mill Furniture

**case_id:** SYN-008
**case_name:** Harbor Mill: Profitable on Paper, Out of Cash
**case_type:** SYNTHETIC_CASE
**industry:** Cash-Crisis / Turnaround — Made-to-Order Furniture Manufacturer
**business_model:** B2B made-to-order furniture for hospitality clients; net-60 terms
**business_stage:** Established, 12 years, acute cash crisis
**geography:** Synthetic / illustrative
**design_basis:** Working-capital runway vs. payroll/covenant timing; profit ≠ cash
**why_case_is_not_too_easy:** The income statement shows a profit and a record order book, so the owner wants to take a big new contract requiring up-front material purchases. But cash will run out before receivables convert, and a loan covenant tests next month. OpsIQ must distinguish profit from cash, compute the runway in weeks, and prioritize liquidity over the tempting growth order.
**data_quality_score:** 9/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 9.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Owner/CEO
- Pride in a record order backlog; sees the cash pinch as temporary

**stated_problem:**
"We just had our most profitable year and the order book is the biggest ever. A hotel group wants a $600K order, but it needs $220K of materials bought up front. I want to say yes to grow. We're a bit tight on cash this month but we're profitable — can we take it?"

**visible_financial_data:**
- Last fiscal year net profit: $310,000 (on $4.0M revenue)
- Current cash on hand: $85,000
- Accounts receivable: $640,000 (mostly net-60; ~$180K already past due)
- Accounts payable due within 30 days: $260,000
- Payroll (next run, due in 12 days): $96,000
- Monthly fixed overhead (rent, utilities, admin, loan): $70,000
- Bank loan covenant: minimum current ratio 1.2, tested at month-end (≈18 days away)
- Inventory (raw + WIP): $410,000

**visible_sales_data:**
- Order backlog: record high (~$1.8M)
- Customer concentration: top 2 hospitality clients = ~55% of revenue
- New $600K hotel order pending; requires $220K materials up front, paid net-60 on delivery (~90+ days out)

**visible_operations_data:**
- Production lead time: 8–10 weeks per order
- Several jobs near completion but not yet invoiced
- Collections process is informal; no disciplined dunning

**visible_marketing_data:**
- Demand strong; no acquisition spend needed currently

**visible_customer_data:**
- Clients pay slowly but reliably; two are habitually 30+ days late

**visible_constraints:**
- Covenant test at month-end; breach could trigger loan recall
- Payroll is non-negotiable in 12 days
- Taking the new order consumes $220K cash before any inflow

**known_limitations:**
- No 13-week cash-flow forecast exists
- Exact collection dates on past-due AR uncertain
- No committed line-of-credit headroom stated

**exact_prompt_to_opsiq:**

*"A made-to-order furniture maker earned $310K profit on $4.0M last year and has a record backlog, but holds only $85K cash. AR is $640K (net-60, ~$180K past due); AP due in 30 days is $260K; payroll of $96K is due in 12 days; fixed overhead is $70K/month. A loan covenant (current ratio ≥ 1.2) tests at month-end (~18 days out). A new $600K order needs $220K of materials bought up front, paid net-60 after delivery (~90+ days). The owner wants to accept it to grow. What is the root cause of the cash crisis? What is the first priority action? Should the owner accept the order now?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
The company is profitable but illiquid: cash is trapped in receivables and inventory while near-term obligations (payroll, payables, covenant) come due first. This is a working-capital/cash-conversion problem, not a profitability problem. Committing $220K of cash up front for the new order — with cash inflow 90+ days away — would breach payroll and/or the covenant. Profit on paper does not equal available cash.

**supporting_calculation:**
- Near-term cash needs (next ~18–30 days): payroll $96K (12 days) + overhead ~$70K + AP $260K = **~$426K** of outflows.
- Cash available: $85K on hand + collectible AR (only the non-past-due/near-term portion converts soon; ~$460K is net-60 and may not land in time; ~$180K is already past due and uncertain).
- Cash runway against payroll alone: $85K covers the $96K payroll *not even once* without collections → must accelerate AR or draw credit within 12 days.
- Accepting the order: −$220K cash now against an $85K balance = immediately insolvent on materials purchase; inflow ~90+ days out.
- Covenant: current ratio = current assets / current liabilities. Buying $220K materials on credit raises current liabilities and consumes cash, pushing the ratio toward/below 1.2 at month-end → **likely breach**.
- Customer concentration (top 2 = 55%) plus two habitually-late payers compounds the collection risk.

**expected_first_priority_action:**
Prioritize liquidity and the covenant, not the new order. Build a 13-week cash forecast immediately; aggressively collect the $180K past-due AR (and invoice the near-complete jobs now); secure or draw a credit line to cover the 12-day payroll and protect the month-end covenant. Decline or defer the $600K order, or accept it only with a substantial up-front deposit that funds the $220K materials. Do not consume cash on growth before solvency is secured.

**why_first:** Payroll is due in 12 days and the covenant tests in ~18 days against only $85K cash; breaching either is existential. Collecting trapped AR and securing liquidity directly addresses the binding constraint, whereas the new order would precipitate the crisis it pretends to solve.

**known_bad_actions:**
- Accepting the $600K order with $220K cash out and no deposit.
- Treating last year's $310K profit as available cash.
- Ignoring the 12-day payroll and month-end covenant.

**accepted_alternative_answers:**
- Negotiate the new order with a 40–50% deposit so it is cash-positive up front; otherwise defer.
- Factor receivables / draw credit line + tighten collections to bridge the gap.

**scoring_notes:**
- Full credit requires separating profit from cash, flagging the 12-day payroll and ~18-day covenant against $85K, and declining/deposit-gating the order.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Identifies illiquidity/working-capital trap (cash in AR + inventory) vs. profitability; ties near-term payroll/AP/covenant to the $85K cash shortfall.

**root_cause_partial_credit:**
- Notes "cash flow problem" or "slow receivables" without the payroll/covenant timing.

**first_priority_action_full_credit:**
- 13-week cash forecast + accelerate/collect AR + secure credit for payroll/covenant; decline or deposit-gate the new order.

**first_priority_action_partial_credit:**
- Recommends collecting receivables or arranging financing without explicitly protecting payroll/covenant or gating the order.

**automatic_fail_conditions:**
- Recommends accepting the $600K order now without a cash-positive deposit.
- Treats the $310K profit as spendable cash.

**dangerous_recommendations:**
- "Take the order and worry about cash later."
- "Profit is strong, so cash will follow."

**false_confidence_traps:**
- Conflating profit with liquidity.
- Assuming AR will be collected in time without a forecast.

**missing_data_that_should_be_flagged:**
- A 13-week cash forecast; exact AR collection dates; available credit-line headroom.

**evidence_that_should_be_used:**
- $85K cash, $96K payroll in 12 days, covenant in ~18 days, $220K up-front order cost, $180K past-due AR, concentration.

**evidence_that_should_not_be_invented:**
- A specific credit-line size; exact collection dates not given.

---

## CASE SYN-009: Velocity Apparel Ads

**case_id:** SYN-009
**case_name:** Velocity Apparel: The ROAS That Lies
**case_type:** SYNTHETIC_CASE
**industry:** Marketing-Spend — DTC Apparel
**business_model:** DTC apparel, scaling paid acquisition across brand + retargeting + prospecting
**business_stage:** Growth-stage, 3 years
**geography:** Synthetic / illustrative
**design_basis:** Blended/reported ROAS vs. incremental ROAS; MER and the retargeting illusion
**why_case_is_not_too_easy:** The ad platform reports a strong 4.5x ROAS, so the team wants to scale spend. But most of that reported ROAS is retargeting and brand-search credit claiming sales that would have happened anyway; the marketing efficiency ratio (MER) and incremental contribution tell a different story. OpsIQ must separate reported from incremental ROAS and avoid scaling spend on non-incremental tactics.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 9/10
**total_case_quality_score:** 8.5/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Head of growth
- Reports platform-attributed ROAS to the founder as the headline metric

**stated_problem:**
"Our ad platform shows a 4.5x ROAS, which is great, so I want to double our monthly ad budget from $100K to $200K to scale revenue. The dashboard says every dollar makes $4.50. How fast can we scale?"

**visible_financial_data:**
- Monthly ad spend: $100,000
- Platform-reported (last-click/attributed) revenue: $450,000 → reported ROAS 4.5x
- Total company revenue (all channels): $620,000/month
- Gross margin: 50%
- Spend breakdown: prospecting $40K, retargeting $35K, brand-search $25K
- Reported ROAS by tactic: prospecting 1.8x, retargeting 9.0x, brand-search 12.0x

**visible_sales_data:**
- Organic/direct revenue (no ads): historically ~$300,000/month before paid scaled up
- Repeat-customer share: ~35% (these buyers see retargeting/brand-search ads)
- New-customer revenue: roughly tracks prospecting performance

**visible_operations_data:**
- Attribution is platform last-click; no incrementality testing has been run
- No geo holdout or conversion-lift test conducted
- Brand-search ads bid on the company's own brand name

**visible_marketing_data:**
- MER (total revenue / total ad spend) = $620K / $100K = 6.2x
- Retargeting and brand-search audiences are existing/intent customers
- Prospecting reaches genuinely new audiences

**visible_customer_data:**
- Brand-search clickers typed the brand name (already intend to buy)
- Retargeting reaches cart abandoners and past visitors

**visible_constraints:**
- Founder anchored on the 4.5x dashboard number
- No budget for a long testing window before scaling

**known_limitations:**
- No incrementality (holdout/lift) test has been run
- True organic baseline under current conditions not re-measured
- Cross-channel attribution overlap unknown

**exact_prompt_to_opsiq:**

*"A DTC apparel brand spends $100K/month on ads; the platform reports $450K attributed revenue (4.5x ROAS). Total company revenue is $620K/month at 50% gross margin; organic/direct was ~$300K/month before paid scaled. Spend is prospecting $40K (1.8x reported), retargeting $35K (9.0x), brand-search $25K (12.0x). Attribution is platform last-click; no incrementality test has been run; brand-search bids on the company's own name; retargeting hits existing visitors. The team wants to double the budget to $200K. What is the root cause of the misleading picture? What is the first priority action? Should spend double?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
The headline 4.5x is reported (last-click) ROAS that over-credits non-incremental tactics — brand-search (12x) and retargeting (9x) are mostly claiming sales that would have occurred anyway (existing/intent customers, organic baseline ~$300K). True incremental ROAS is dominated by prospecting (1.8x reported, lower incrementally). Doubling the budget assuming a uniform 4.5x will scale spend into non-incremental and low-incremental tactics, wasting money. The problem is attribution illusion, not real efficiency.

**supporting_calculation:**
- MER = total revenue / total spend = $620K / $100K = 6.2x, but organic baseline was ~$300K with little/no paid → roughly **$320K** of revenue sits above baseline against $100K spend = **~3.2x incremental MER** at best, not 4.5x and not 6.2x.
- Brand-search 12x and retargeting 9x reach customers who already intended to buy (typed brand name; prior visitors); much of their "attributed" revenue is non-incremental → real lift far below reported.
- Prospecting (truly new audiences) reports only **1.8x**; at 50% gross margin, 1.8x ROAS = $1.80 revenue × 50% = $0.90 gross profit per $1.00 spent → **gross-margin negative on the marginal prospecting dollar**.
- Doubling to $200K: incremental tactics (prospecting) are already near/below margin breakeven, and you cannot "double" non-incremental brand-search/retargeting volume — so the marginal $100K lands in unprofitable prospecting. Reported blended ROAS will fall well below 4.5x.

**expected_first_priority_action:**
Do not double the budget on the reported ROAS. First measure incrementality: run a holdout/geo-lift or pause/scale test on brand-search and retargeting to find true incremental ROAS, and judge prospecting on margin (1.8x is below the 2x gross-margin breakeven at 50% GM). Reallocate from non-incremental tactics toward what genuinely drives new revenue, and set scaling decisions on incremental ROAS / MER, not last-click.

**why_first:** Scaling on a misleading 4.5x would pour the marginal budget into non-incremental brand-search/retargeting and margin-negative prospecting. Establishing incrementality is the only way to know which dollar is worth scaling; everything else follows from it.

**known_bad_actions:**
- Doubling spend based on reported 4.5x ROAS.
- Scaling brand-search/retargeting (largely non-incremental).
- Cutting prospecting (the only true new-customer source) without testing.

**accepted_alternative_answers:**
- Run incrementality tests, reallocate to incremental drivers, set a margin-based prospecting ROAS floor (≥2x at 50% GM).
- Reduce brand-search/retargeting to test cannibalization of organic, then reinvest savings.

**scoring_notes:**
- Full credit requires distinguishing reported vs. incremental ROAS, flagging brand-search/retargeting non-incrementality and 1.8x prospecting below the 2x margin breakeven, and rejecting the doubling.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Explains reported (last-click) ROAS over-credits non-incremental brand-search/retargeting; true incremental efficiency is much lower; prospecting at 1.8x is below the 2x gross-margin breakeven.

**root_cause_partial_credit:**
- Notes attribution is misleading or that retargeting/brand-search "steal credit" without the margin/breakeven math.

**first_priority_action_full_credit:**
- Run incrementality testing + reallocate to incremental drivers + set a margin-based ROAS floor; don't double on reported ROAS.

**first_priority_action_partial_credit:**
- Recommends measuring true ROAS/incrementality without the reallocation or breakeven floor.

**automatic_fail_conditions:**
- Recommends doubling the budget based on the 4.5x figure.
- Recommends scaling brand-search/retargeting as the growth engine.

**dangerous_recommendations:**
- "The dashboard says 4.5x, so scale everything."
- "Kill prospecting because its ROAS is lowest" (kills the only incremental channel).

**false_confidence_traps:**
- Trusting last-click ROAS as incremental.
- Treating MER (6.2x) as proof without the organic baseline.

**missing_data_that_should_be_flagged:**
- Incrementality/holdout test results; re-measured organic baseline; cross-channel overlap.

**evidence_that_should_be_used:**
- Reported 4.5x, tactic ROAS (1.8/9/12), ~$300K organic baseline, 50% GM, no incrementality test.

**evidence_that_should_not_be_invented:**
- Specific true-incremental ROAS numbers (must be tested, not assumed).

---

## CASE SYN-010: Northwind Creative Agency

**case_id:** SYN-010
**case_name:** Northwind Creative: Busy, Booked, and Barely Profitable
**case_type:** SYNTHETIC_CASE
**industry:** Professional Services / Creative Agency
**business_model:** Project-based creative/branding agency, salaried team, fixed-fee projects
**business_stage:** Established, 7 years, ~18 staff
**geography:** Synthetic / illustrative
**design_basis:** Utilization × realization (effective billing) and client concentration
**why_case_is_not_too_easy:** The agency is fully booked and revenue is up, so the partners want to hire more people to take on more work. But low realization (scope creep on fixed-fee projects) and one client at 40% of revenue mean the agency is busy doing under-billed work for a concentrated, risky base. OpsIQ must compute effective billing/utilization economics and prioritize realization and concentration over hiring.
**data_quality_score:** 8/10
**expected_answer_quality_score:** 8/10
**total_case_quality_score:** 8.0/10
**include_in_round_1:** true

---

### CASE_INPUT_VISIBLE_TO_OPSIQ

**owner_context:**
- Role: Managing partner
- Two partners sell and oversee delivery; 16 billable staff

**stated_problem:**
"The team is slammed — everyone's at capacity and we just had a record revenue quarter. To grow, I want to hire 4 more designers and a producer. We turn away work because we're full. How fast should we staff up?"

**visible_financial_data:**
- Annual revenue: $2,800,000
- Billable staff: 16; fully loaded cost per billable head: ~$110,000/year ($1,760,000 total)
- Partners + non-billable (ops, admin): $520,000/year
- Net profit margin: ~7% (~$196,000)
- Standard rate card: $150/hour; average effective realized rate: $96/hour
- Target billable utilization: 75%; actual utilization: 82% (team overworked)

**visible_sales_data:**
- Largest client: 40% of revenue; next two clients: 18% combined
- Most work is fixed-fee; scope creep common, change orders rarely issued
- Pipeline strong; turning away projects

**visible_operations_data:**
- No time-tracking discipline tying hours to project budgets
- Projects routinely run 20–35% over the hours quoted
- No formal change-order or scope-management process
- Team burnout signals rising (overtime, missed deadlines)

**visible_marketing_data:**
- Inbound-driven; minimal marketing spend
- Referrals from the large client drive much of the pipeline

**visible_customer_data:**
- Large client is demanding and slow to approve, but pays
- Smaller clients more profitable per project but fewer

**visible_constraints:**
- Hiring a designer costs ~$110K loaded and takes ~2 months to ramp
- Partners' time is consumed by the large client
- Concentration risk: losing the top client removes 40% of revenue

**known_limitations:**
- No realization or utilization reporting by project/client
- No measured profit margin by client
- Effective rate is estimated, not tracked per engagement

**exact_prompt_to_opsiq:**

*"A creative agency at $2.8M revenue runs ~7% net margin. It has 16 billable staff (loaded $110K each) plus $520K partner/admin cost. The rate card is $150/hour but the average realized rate is only $96/hour; utilization is 82% (above the 75% target — team is overworked). Fixed-fee projects routinely run 20–35% over quoted hours with no change orders. One client is 40% of revenue. The partners are fully booked and want to hire 4 designers and a producer to grow. What is the root cause of the thin margin and risk? What is the first priority action? Should they staff up now?"*

---

### CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ

**expected_root_cause:**
The margin is thin not because of too little capacity but because of low realization: the agency bills an effective $96/hour against a $150 rate card (64% realization), driven by uncontrolled scope creep on fixed-fee work (projects run 20–35% over quoted hours with no change orders). Adding headcount scales under-billed work and raises fixed cost. Compounding this is severe client concentration (40% from one client). Hiring now multiplies low-realization delivery and increases fixed-cost exposure to a concentrated, risky base.

**supporting_calculation:**
- Realization = effective rate / rate card = $96 / $150 = **64%** — the lost 36 points are the profit leak.
- Recovering realization from 64% toward, say, 80% ($120/hour effective) on the same delivered hours raises revenue ~25% on existing capacity. Billable hours ≈ revenue / effective rate = $2.8M / $96 ≈ 29,170 hours → at $120/hour that's **~$3.5M revenue with the same team**, ~$700K incremental at near-zero added cost.
- Utilization is already 82% vs. 75% target — the team is over-utilized, so there is no slack to "fill"; the constraint is price/scope capture, not hours.
- Hiring 5 people ≈ +$540K fixed cost; at the current 7% margin and 64% realization, new heads deliver under-billed work and could erase the $196K profit before realization is fixed.
- Concentration: losing the 40% client would drop revenue by ~$1.12M against a fixed cost base that a larger team would only enlarge.

**expected_first_priority_action:**
Fix realization and scope control before hiring: implement time-tracking against project budgets, institute a change-order/scope-management process, and reprice or renegotiate the over-running fixed-fee work (especially the 40% client). Diversify away from the concentrated client. Defer the 5-person hire until realization and concentration improve; the existing team can deliver materially more profit at proper billing.

**why_first:** The profit leak is the 36-point realization gap on already-maxed capacity; recovering it adds far more profit than new heads while reducing burnout. Hiring into low realization and 40% concentration enlarges fixed cost and risk without fixing the cause.

**known_bad_actions:**
- Hiring 4 designers + a producer now.
- Taking on more fixed-fee work without scope/change-order control.
- Deepening reliance on the 40% client to feed the bigger team.

**accepted_alternative_answers:**
- Implement realization/scope discipline + selective repricing, then hire only against profitable, diversified demand.
- Raise rates / convert to value or T&M pricing on scope-creep-prone work; reduce concentration.

**scoring_notes:**
- Full credit requires identifying low realization (64%, $96 vs. $150) plus concentration, and deferring hiring until realization/scope are fixed.

---

### CASE_SCORING_GUIDE

**root_cause_full_credit:**
- Identifies low realization (effective $96 vs. $150 card = 64%) from scope creep on fixed-fee work as the profit drain, plus 40% client concentration; notes utilization (82%) is already above target so capacity is not the constraint.

**root_cause_partial_credit:**
- Identifies scope creep/under-billing OR client concentration alone.

**first_priority_action_full_credit:**
- Time-tracking + change-order/scope process + reprice over-running work + diversify the 40% client; defer hiring.

**first_priority_action_partial_credit:**
- Recommends improving billing/realization OR managing concentration without deferring the hire.

**automatic_fail_conditions:**
- Recommends hiring the 5 people now to grow.
- Recommends taking more fixed-fee work without scope control.

**dangerous_recommendations:**
- "Staff up fast to capture the pipeline."
- "Lean harder into the big client's referrals" (deepens concentration).

**false_confidence_traps:**
- Treating full utilization / record revenue as proof of health.
- Assuming more capacity equals more profit while realization is 64%.

**missing_data_that_should_be_flagged:**
- Realization/utilization by project and client; profit margin per client; tracked hours vs. budget.

**evidence_that_should_be_used:**
- $96 vs. $150 effective rate, 82% utilization, 20–35% overruns, 40% client concentration, ~7% margin.

**evidence_that_should_not_be_invented:**
- Specific per-client margins; exact hours not tracked.

---

# SYNTHETIC_CASE_PACK_CLOSEOUT

**total_cases_created:** 10
**total_cases_accepted:** 10
**average_expected_answer_quality:** 8.7/10
**average_case_quality:** 8.45/10
**industries_covered:** Local service (SYN-001 laundromat, SYN-002 HVAC), Restaurant/food (SYN-003 full-service Italian, SYN-004 ghost kitchen), SaaS/subscription (SYN-005 B2B SaaS, SYN-006 consumer subscription), Retail/e-commerce (SYN-007 DTC home textiles), Cash-crisis/turnaround (SYN-008 furniture manufacturer), Marketing-spend (SYN-009 DTC apparel ads), Professional-services/agency (SYN-010 creative agency)
**cases_ready_for_round_1:** 10
**quantitative_calculation_cases:** SYN-001 (contribution margin), SYN-004 (per-order contribution), SYN-005 (CAC payback vs. runway), SYN-006 (LTV vs. CAC + net growth), SYN-008 (working-capital runway), SYN-009 (incremental vs. reported ROAS) — 6 cases hinge on explicit math (exceeds the required minimum of 4)
**final_status:** SYNTHETIC_CASE_PACK_READY
