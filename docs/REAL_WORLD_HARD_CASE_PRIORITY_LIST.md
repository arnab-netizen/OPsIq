# Real-World Hard Case Priority List

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 6 — Hard Case Prioritization  

---

## 1. Purpose

Identify and rank the hardest case types for the blind replay corpus. Hard cases are the most valuable for validation because:
1. They expose engine failure modes that easy cases hide
2. They test whether the engine can navigate ambiguity and conflicting signals
3. They determine whether the engine's safety gates function on non-obvious harm patterns
4. They prevent a corpus from producing artificially high scores by including only "textbook" cases

---

## 2. Hardness Classification

Each case type is rated on three axes:

| Axis | Definition |
|---|---|
| **Difficulty** | How hard it is for a consulting engine to produce the correct diagnosis and action |
| **OpsIQ failure risk** | Likelihood the engine misdiagnoses, recommends a harmful action, or abstains incorrectly |
| **Learning value** | How much the result (correct OR incorrect) tells us about the engine's real-world capability |

Ratings: 1 (low) — 5 (high)

---

## 3. Hard Case Priority Rankings

---

### 3.1 Rank 1 — Failed Turnarounds

**Definition:** A business that attempted a documented turnaround strategy which failed. The pre-decision evidence looked promising. The outcome was worse than the status quo.

**Why hard:** The engine must evaluate a situation where a plausible-looking action set was taken and failed. The challenge is whether the engine can identify WHY the turnaround was likely to fail from pre-decision evidence — not by knowing it failed.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 5/5 | Pre-decision evidence is ambiguous; the turnaround plan often looks reasonable |
| OpsIQ failure risk | 5/5 | Engine may recommend the same (failed) action, scoring OPSIQ_WORSE |
| Learning value | 5/5 | Reveals whether engine can detect structural failure conditions vs. surface improvements |

**Example patterns:**
- Company implements cost reduction while ignoring declining market position → profitability improves briefly, then accelerates decline
- Company raises prices to improve margins while losing core customer base → short-term margin gain, then volume collapse
- New CEO implements operational efficiency while the real problem is market obsolescence

**Sourcing:** Chapter 11 first-day declarations frequently include prior turnaround attempts that failed. Look for "prior restructuring attempts" sections.

**Corpus target:** 8–10 cases in the 50-case corpus

---

### 3.2 Rank 2 — Bankruptcies With Pre-Decision Financial Recovery Signals

**Definition:** A business that showed genuine financial improvement signals (revenue up, cash position improved) in the quarters just before filing for bankruptcy or shutting down. The engine sees positive signals and must determine whether they are genuine or misleading.

**Why hard:** Evidence contains genuine positive data (revenue growth, customer additions). The failure is structural (debt load, burn rate, cost base) not visible in the top-line metrics. Engine must weigh positive surface signals against structural warning signs.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 5/5 | Positive surface signals mask structural failure |
| OpsIQ failure risk | 5/5 | Engine may read revenue growth as RECOVERY and recommend continuation |
| Learning value | 5/5 | Tests whether engine can weight structural vs. surface evidence |

**Example patterns:**
- SaaS company growing ARR 30% while burn rate makes runway < 12 months at current growth cost
- Retailer showing positive same-store sales in a subset of stores while total store base is uneconomic
- Restaurant chain with positive franchise royalty growth while corporate store cash drain is accelerating

**Sourcing:** SEC 10-K filings from 12–18 months before bankruptcy filing. Compare to the first-day declaration filed at bankruptcy.

**Corpus target:** 6–8 cases in the 50-case corpus

---

### 3.3 Rank 3 — Misleading Growth

**Definition:** A business that appears to be growing (revenue, customer count, market share) but the growth is destroying value (unit economics negative, CAC unsustainable, gross margin declining).

**Why hard:** Growth is the most powerful cognitive bias override. A business growing at 40% YoY is expected to "invest for growth" not "fix the fundamentals." The engine must detect that the growth is destroying value even when all surface indicators are positive.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 5/5 | All intuitive signals point to success; engine must detect the decay in unit economics |
| OpsIQ failure risk | 4/5 | Engine may recommend "continue growth investment" — which is the harmful action |
| Learning value | 5/5 | Tests the engine's unit economics comprehension vs. top-line pattern recognition |

**Example patterns:**
- E-commerce growing GMV while take rate is insufficient to cover fulfillment + CAC
- SaaS growing ARR while LTV/CAC ratio is below 1.0 and worsening
- B2B company winning enterprise logos but at below-cost pricing that cannot be raised at renewal

**Sourcing:** Founder post-mortems with detailed unit economics discussion. SEC S-1 filings followed by down-round financing or shutdown.

**Corpus target:** 6–8 cases in the 50-case corpus

---

### 3.4 Rank 4 — Conflicting Signals (Multi-Causal Failures)

**Definition:** A business where multiple genuine problems exist simultaneously, some improving and some worsening, creating a conflicting evidence set. The root cause is the interaction between problems, not any single problem.

**Why hard:** No single piece of evidence is diagnostic. The root cause is emergent from the combination. The engine must integrate conflicting evidence without reverting to the most salient single signal.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 4/5 | Any single-factor heuristic fails; requires multi-signal synthesis |
| OpsIQ failure risk | 4/5 | Engine may over-weight the most alarming single signal and miss the interaction |
| Learning value | 5/5 | Tests evidence integration vs. single-factor pattern matching |

**Example patterns:**
- Revenue improving + margins worsening + cash declining + customer satisfaction stable
- Churn improving + CAC increasing + pricing power declining + product NPS high
- Market share growing + absolute revenue declining (total market collapsing)

**Sourcing:** Companies with mixed quarterly earnings narratives across 4–6 quarters. Earnings call transcripts where analysts are confused.

**Corpus target:** 5–7 cases in the 50-case corpus

---

### 3.5 Rank 5 — False Recoveries

**Definition:** A business that showed a genuine recovery signal (metrics improved for 2–4 quarters) before deteriorating again to a worse state than the original crisis.

**Why hard:** The recovery appears real. The pre-decision evidence at the "second crisis" includes a prior recovery — making the situation seem like a temporary setback rather than a structural failure. The engine must determine whether the second crisis is recoverable or terminal.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 4/5 | Prior recovery evidence makes the situation look recoverable; it is not |
| OpsIQ failure risk | 4/5 | Engine may anchor on prior recovery as evidence of resilience |
| Learning value | 5/5 | Tests whether engine can distinguish genuine recovery from temporary improvement |

**Example patterns:**
- Retailer improves same-store sales for 3 quarters (seasonal + markdown effect), then collapses
- SaaS improves net revenue retention for 2 quarters (cohort timing), then structural churn resumes
- Restaurant chain improves traffic with promotions, then promotion costs destroy profitability

**Sourcing:** Multi-year 10-K sequences; companies that had a "turnaround story" followed by a second failure.

**Corpus target:** 5–6 cases in the 50-case corpus

---

### 3.6 Rank 6 — Cash-Flow Crises With Profitable P&L

**Definition:** A business that is technically profitable (positive net income, positive EBITDA) but is running out of cash due to working capital destruction, capex overcommitments, or debt service obligations.

**Why hard:** Profitability is the strongest single heuristic for business health. A profitable business that fails is deeply counterintuitive. The engine must look past the P&L to the cash flow statement.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 4/5 | P&L evidence points to health; cash evidence points to crisis |
| OpsIQ failure risk | 5/5 | High risk engine anchors on profitability and misses the cash-flow crisis |
| Learning value | 5/5 | Tests whether engine weights cash reality vs. accounting profitability |

**Example patterns:**
- Manufacturer with positive EBITDA but negative operating cash flow due to inventory build
- Retailer with positive net income but cash crisis from lease obligations
- SaaS with positive non-GAAP income but cash drain from deferred revenue unwind

**Sourcing:** Chapter 11 filings for operationally profitable businesses. Look for cases where EBITDA is positive in the filing but cash is the stated crisis driver.

**Corpus target:** 5–6 cases in the 50-case corpus

---

### 3.7 Rank 7 — Acquisition Failures

**Definition:** A business that made an acquisition (or was acquired) and the integration or post-acquisition state destroyed value. The pre-decision evidence covers the period when the acquisition decision was being evaluated.

**Why hard:** Acquisitions involve strategic intent, synergy claims, and integration complexity that are hard to evaluate from financial evidence alone. The engine must identify whether the strategic rationale is sound from pre-decision evidence.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 4/5 | Strategic complexity; integration feasibility is hard to infer from financial evidence |
| OpsIQ failure risk | 3/5 | Moderate — engine may flag integration risk but may underweight cultural/capability risks |
| Learning value | 4/5 | Tests strategic assessment capability; important for owner-mode clients evaluating M&A |

**Example patterns:**
- PE-backed roll-up that destroyed acquired company value through over-leverage + cost cuts
- Strategic acquisition that eliminated the acquired company's competitive differentiation
- Platform company that failed to integrate a complementary product

**Sourcing:** SEC 8-K acquisition announcements + subsequent 10-K impairment charges + FTC enforcement actions.

**Corpus target:** 4–5 cases in the 50-case corpus

---

### 3.8 Rank 8 — Churn Crises With High Gross Revenue Retention

**Definition:** A business where customer churn is causing structural damage but the financial statement metrics are masking it. New customer acquisition is replacing churned customers in revenue but not in unit economics.

**Why hard:** The top-line revenue looks stable or growing. The damage is visible only in cohort analysis and LTV trajectory — which requires the engine to infer from indirect evidence.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 3/5 | Requires working backwards from indirect metrics to structural health |
| OpsIQ failure risk | 3/5 | Moderate — engine may miss churn if it anchors on gross revenue |
| Learning value | 4/5 | Tests customer economics comprehension vs. revenue-level pattern matching |

**Example patterns:**
- SaaS with flat ARR but underlying net revenue retention of 75% (masked by new business)
- Subscription retail with stable revenue but rising customer acquisition cost + declining second-purchase rate
- B2B platform with growing logo count but shrinking average contract value

**Sourcing:** Founder post-mortems with cohort analysis. SEC S-1 filings with NRR disclosure followed by down-round or shutdown.

**Corpus target:** 4–5 cases in the 50-case corpus

---

### 3.9 Rank 9 — Inventory Disasters

**Definition:** A business where excess inventory is destroying working capital, but the condition developed gradually and the financial evidence at T₀ does not yet show the full severity.

**Why hard:** Early-stage inventory build looks like normal operations. The crisis becomes visible when cash runs out and the inventory cannot be liquidated at cost. At T₀, the engine must project forward from current inventory trends to the cash crisis they imply.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 3/5 | Requires forward projection from early-warning metrics (inventory days, turns) |
| OpsIQ failure risk | 3/5 | Moderate — engine may not connect slowing turns to future cash crisis |
| Learning value | 4/5 | Tests forward projection capability and working capital comprehension |

**Example patterns:**
- Retailer with rising inventory days (60 → 90 → 120) approaching peak buying season
- Manufacturer over-producing ahead of demand that didn't materialize
- Consumer goods company that stocked up ahead of price increases; demand shifted

**Sourcing:** Chapter 11 first-day declarations with inventory detail. 10-K filings with inventory turns deterioration across 3+ years.

**Corpus target:** 4–5 cases in the 50-case corpus

---

### 3.10 Rank 10 — Scaling Failures

**Definition:** A business that grew too fast, and the operational infrastructure failed to support the growth. The pre-decision evidence shows rapid growth + mounting operational problems but unclear root cause.

**Why hard:** Growth is the dominant signal, and the operational problems can be framed as "normal growing pains" rather than structural failures. The engine must determine whether the operational problems are solvable at the current growth rate or require slowing growth.

| Axis | Rating | Notes |
|---|---|---|
| Difficulty | 3/5 | Ambiguous: are operational problems solvable or structural? |
| OpsIQ failure risk | 3/5 | Moderate — engine may recommend "invest in operations" without questioning growth rate |
| Learning value | 4/5 | Tests the engine's capacity/capability assessment vs. growth narrative anchoring |

**Example patterns:**
- E-commerce that grew fulfillment orders beyond its warehouse capacity, causing service failures and churn
- SaaS that grew its customer base beyond its support capacity, causing NPS collapse
- Restaurant chain that franchised too fast without adequate field support infrastructure

**Sourcing:** Founder post-mortems; SEC filings for companies with rapid growth followed by operational restatements.

**Corpus target:** 3–4 cases in the 50-case corpus

---

## 4. Priority Summary Table

| Rank | Case Type | Difficulty | OpsIQ Fail Risk | Learning Value | Target count (50-case) |
|---|---|---|---|---|---|
| 1 | Failed turnarounds | 5/5 | 5/5 | 5/5 | 8–10 |
| 2 | Bankruptcies with recovery signals | 5/5 | 5/5 | 5/5 | 6–8 |
| 3 | Misleading growth | 5/5 | 4/5 | 5/5 | 6–8 |
| 4 | Conflicting signals (multi-causal) | 4/5 | 4/5 | 5/5 | 5–7 |
| 5 | False recoveries | 4/5 | 4/5 | 5/5 | 5–6 |
| 6 | Cash-flow crisis with profitable P&L | 4/5 | 5/5 | 5/5 | 5–6 |
| 7 | Acquisition failures | 4/5 | 3/5 | 4/5 | 4–5 |
| 8 | Churn crisis with high GRR | 3/5 | 3/5 | 4/5 | 4–5 |
| 9 | Inventory disasters | 3/5 | 3/5 | 4/5 | 4–5 |
| 10 | Scaling failures | 3/5 | 3/5 | 4/5 | 3–4 |

**Total hard-case target for 50-case corpus: 50–64 cases** — the entire 50-case minimum corpus should consist of hard cases only. Do not dilute the corpus with easy, textbook cases.

---

## 5. Cases to AVOID (Easy Cases That Inflate Scores)

| Type | Why to avoid |
|---|---|
| Textbook cash-flow crisis (single clear cause, linear decline) | Engine trivially diagnoses; inflates `diagnosis_agreement` |
| Business that simply ran out of money with no operational complexity | Low diagnostic challenge; inflates scores |
| Industry-specific cases where the industry decline is universally known (e.g., video rental) | Engine uses training knowledge of industry; not a test of diagnostic capability |
| Cases with ≤ 2 evidence items | Insufficient evidence complexity; engine either abstains or trivially diagnoses |
| Cases where the harmful action is obviously bad (e.g., "took on debt at 40% interest rate") | Safety gate trivially triggered; doesn't test nuanced harm assessment |

---

**Phase 6 complete.**
