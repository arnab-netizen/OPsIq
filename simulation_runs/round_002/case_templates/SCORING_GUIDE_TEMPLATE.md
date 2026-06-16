# Round 2 Scoring Guide Template

**Created:** 2026-06-16  
**Authority:** ROUND_2_CASE_PACK_SPECIFICATION.md §11 (Manual Scoring Process)  
**Purpose:** Domain-expert-level scoring rubric for Round 2 case pack evaluation

---

## Scoring Overview

Each case will be scored on **seven dimensions** by an independent domain expert (blind to engine identity):

1. **Root-Cause Accuracy** (weight: 2x)
2. **First-Action Accuracy** (weight: 2x)
3. **Business Relevance** (weight: 1x)
4. **Constraint Awareness** (weight: 1x)
5. **Evidence Traceability** (weight: 1x)
6. **Confidence Calibration** (weight: 1x)
7. **Safety** (weight: pass/fail gate)

**Scoring Formula:**
```
case_score = (root_cause × 2 + first_action × 2 + business_relevance × 1 + 
              constraint_awareness × 1 + evidence_traceability × 1 + 
              confidence_calibration × 1) / 10
```

**Scale:** 0-10 points per dimension (except Safety)

---

## Dimension 1: Root-Cause Accuracy (Weight: 2x)

**Question:** Does the engine diagnose the root cause of the business problem correctly?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Engine diagnosis exactly matches the answer key diagnosis. Archetype, framing, evidence reasoning are all aligned. Clear evidence of correct pattern matching. |
| **8** | Engine diagnosis matches the answer-key archetype; framing or emphasis slightly different but fundamentally correct. Secondary factors handled appropriately. |
| **6** | Engine diagnosis partially correct; identifies a related root cause but misses one key dimension. Example: diagnoses OPERATIONAL_BOTTLENECK when QUALITY_CONTROL_FAILURE is the primary driver, but shows some understanding of the problem. |
| **4** | Engine diagnosis identifies a related or plausible cause but is fundamentally wrong on the primary problem. Example: diagnoses DEMAND_FORECASTING_MISMATCH when the real issue is BRAND_EROSION, but the diagnosed issue is present in the case. |
| **2** | Engine diagnosis contradicts or inverts the answer-key diagnosis. Example: diagnoses growth opportunity when case is actually decline, or vice versa. |
| **0** | Engine diagnosis completely unrelated to the case or its problem. No clear connection to case facts. |

**Scoring Notes:**
- Root-cause accuracy is the highest-priority dimension (2x weight) because diagnosis is the foundation for all subsequent recommendations.
- A correct diagnosis with a suboptimal action is more valuable than an incorrect diagnosis with a good action.
- Score 10 only if the engine's reasoning chain (evidence → pattern → diagnosis) is sound, not just if the final label is correct.
- Score 8 or 6 if the diagnosis is correct but reasoning is incomplete or includes minor errors.

**Examples:**

**Case RW-016 (BRAND_EROSION):**
- Engine diagnoses: "BRAND_EROSION based on market perception decline (NPS 72→48), customer feedback citing quality concerns, competitor gains on brand positioning."
- Answer key: "BRAND_EROSION: evidence shows NPS decline, market share loss to competitor, customer feedback about brand perception."
- **Score: 10** (exact match, sound reasoning)

**Case SYN-012 (UNIT_ECONOMICS_BREAKDOWN):**
- Engine diagnoses: "CUSTOMER_RETENTION_EROSION: churn rate elevated, LTV declining."
- Answer key: "UNIT_ECONOMICS_BREAKDOWN: both CAC inflation (rising customer acquisition costs) and LTV decline (churn acceleration) together create the broken unit economics. The primary driver is CAC inflation from market saturation."
- **Score: 4** (related diagnosis, but misses the primary driver; focuses on retention but not acquisition-cost inflation)

---

## Dimension 2: First-Action Accuracy (Weight: 2x)

**Question:** Is the engine's recommended first action the right one, and is it implementable within the owner's constraints?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Engine action directly addresses the diagnosed root cause, matches the answer key in substance, is case-specific (not generic), and respects all owner constraints (budget, time, staff, risk appetite). Implementable. |
| **8** | Engine action addresses root cause correctly; slightly less specific than answer key or less detailed in constraint consideration, but still appropriate and implementable. |
| **6** | Engine action partially addresses root cause; may be less specific, omit a constraint, or suggest complementary rather than primary action. Still reasonable given situation. |
| **4** | Engine action addresses a symptom rather than root cause, or violates a key owner constraint (budget, timeline). Still somewhat relevant but wrong priority. |
| **2** | Engine action generic, misdirected, or significantly violates owner constraints. Difficult or impossible to implement. |
| **0** | Engine action harmful, nonsensical, violates critical constraints, or completely off-topic. Owner should not follow this recommendation. |

**Scoring Notes:**
- First-action accuracy is equally weighted with root-cause accuracy (2x weight) because correct diagnosis without correct action is incomplete.
- Specificity matters: "Improve customer retention" (generic) scores lower than "Implement proactive outreach to high-churn customer segments using existing relationship manager team" (specific).
- Constraint respect is critical: an excellent action that exceeds the budget is not implementable and should be scored lower.
- **Safety first:** If the action is dangerous or unethical, cap the score at 2 regardless of other factors; dangerous actions score 0.

**Examples:**

**Case RW-016 (BRAND_EROSION, budget $500k, timeline 6 months, 3-person team):**
- Engine action: "Commission third-party brand audit ($50-75k) to validate quality perception vs. reality. Use results to guide product and messaging roadmap. Communicate findings to customer advisory board."
- Answer key action: Same.
- **Score: 10** (exact match, specific, respects all constraints)

**Case RW-016 (BRAND_EROSION, budget $500k, timeline 6 months, 3-person team):**
- Engine action: "Invest $400k in brand repositioning campaign across TV, digital, and print. Hire brand agency to redesign messaging and company positioning. Target 30% improvement in brand awareness within 6 months."
- Answer key action: (See above)
- **Score: 2** (violates constraint: $400k leaves only $100k buffer, TV campaign needs 6+ month lead time, 3-person team cannot manage major brand overhaul; wrong priority given diagnosis requires diagnostic validation first)

---

## Dimension 3: Business Relevance (Weight: 1x)

**Question:** Does the recommendation show understanding of the specific owner situation and business context, or is it generic/template-like?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Recommendation deeply reflects owner's specific situation: acknowledges constraints, references specific business metrics, mentions industry context, shows awareness of owner's stakeholders (board, customers, team). Goes beyond template; personalized. |
| **8** | Recommendation is specific to owner's situation; references relevant business context and constraints. May miss one owner-specific nuance. |
| **6** | Recommendation is relevant to owner's situation but somewhat generic; misses owner-specific factors (e.g., doesn't acknowledge specific market dynamic or stakeholder pressure). |
| **4** | Recommendation is generic but on-topic for the industry or business problem type. Could apply to any similar company. |
| **2** | Recommendation tangential or weakly relevant to owner's situation. Shows limited business understanding. |
| **0** | Recommendation irrelevant to case or owner situation. No clear business logic. |

**Scoring Notes:**
- This dimension rewards recommendations that show real business understanding, not just pattern matching.
- Example of generic recommendation (score 4): "Improve customer retention through targeted retention programs." (True but applicable to any company with retention challenge.)
- Example of relevant recommendation (score 8): "Your customer churn is concentrated in the SMB segment ($50k-$200k ARR cohort). You have two options: (1) build self-service retention features for this segment, or (2) focus acquisition on larger customers with lower churn. Given your 3-person team, option 2 aligns better with your capacity constraint."

---

## Dimension 4: Constraint Awareness (Weight: 1x)

**Question:** Does the action respect the owner's constraints (budget, timeline, staff capacity, risk appetite, legal/compliance)?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Action explicitly respects all identified constraints. May even creatively leverage constrained resources (e.g., uses existing relationships or skills to reduce cost). |
| **8** | Action respects major constraints; may miss one nuance in constraint interaction. |
| **6** | Action mostly respects constraints; some constraint consideration missing. |
| **4** | Action partially violates one constraint (budget is tight, timeline is ambitious, staff capacity stretched) but still feasible. |
| **2** | Action severely violates one or more constraints (budget is 2x available, timeline is compressed by half, requires expertise owner doesn't have). Would be very difficult to implement. |
| **0** | Action ignores constraints entirely; not feasible for owner. |

**Scoring Notes:**
- Constraints matter because an infeasible recommendation is worse than a suboptimal but feasible one.
- Common constraint violations: recommending $2M spend when budget is $500k, recommending 6-month timeline when decision due in 60 days, recommending team expansion when owner has fixed headcount.
- Score 10 when action is not just feasible but clever within constraints (e.g., leverages existing customer relationships to reduce CAC, uses free tier tools instead of paid solutions).

---

## Dimension 5: Evidence Traceability (Weight: 1x)

**Question:** Can every claim in the diagnosis and recommendation be traced back to specific case evidence?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Every claim in diagnosis/action is traceable to provided evidence. No unsupported inferences. Clear chain from evidence → interpretation → diagnosis → action. |
| **8** | Primary claims traced to evidence; minor claims are reasonable inferences. Good traceability. |
| **6** | Main diagnosis supported by evidence; some claims lack clear evidence basis or rely on inference. |
| **4** | Some evidence support; significant claims without traceable evidence. Diagnosis leans on inference. |
| **2** | Minimal evidence support; mostly inference or speculation. Diagnosis weakly connected to case facts. |
| **0** | No evidence traceability; recommendation appears to ignore provided evidence or make claims contradicted by case data. |

**Scoring Notes:**
- Evidence traceability prevents hallucinations and grounds recommendations in case facts.
- Example of strong traceability (score 10): "NPS declined from 72 to 48 (evidence item X). Customer focus groups cite 'brand perception' (evidence item Y). We lost 3 contracts to Competitor B citing 'quality concerns' (evidence item Z). Therefore, brand erosion is the diagnosis."
- Example of weak traceability (score 2): "The company is losing customers because its brand is weak. We should improve marketing." (No specific evidence cited; generic pattern-matching without case-specific detail.)

---

## Dimension 6: Confidence Calibration (Weight: 1x)

**Question:** Is the confidence level (HIGH/MODERATE/PROVISIONAL) appropriate given the evidence strength?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Confidence level perfectly matches evidence quality. HIGH when evidence is robust, PROVISIONAL when limited, MODERATE when mixed or ambiguous. Scorer agrees with assessment. |
| **8** | Confidence level generally appropriate; may be slightly over or under-calibrated but defensible. |
| **6** | Confidence level somewhat misaligned with evidence; noticeable but not severe miscalibration. |
| **4** | Confidence level notably misaligned; HIGH confidence on weak evidence or very LOW confidence on robust evidence. |
| **2** | Confidence level significantly misaligned; HIGH confidence on contradictory or missing evidence. |
| **0** | Confidence completely inverted; claims HIGH where evidence is absent, or PROVISIONAL where evidence is overwhelming. |

**Scoring Notes:**
- Calibration reflects wisdom, not just accuracy. A diagnosis can be correct but overconfident (score 6-4) if evidence is weaker than confidence suggests.
- Example of good calibration (score 10): "Evidence strongly supports BRAND_EROSION (NPS decline, customer feedback, contract losses). Confidence: HIGH."
- Example of miscalibration (score 4): "Evidence suggests BRAND_EROSION but is limited to one cohort and anecdotal feedback. Confidence: HIGH." (Confidence too high for evidence base.)
- Example of miscalibration (score 4): "Evidence strongly supports BRAND_EROSION (multiple sources, consistent narrative, measurable NPS decline). Confidence: PROVISIONAL." (Confidence too low for evidence base.)

---

## Dimension 7: Safety (Weight: Pass/Fail Gate)

**Question:** Are any recommendations dangerous, unethical, or unsafe for the owner to follow?

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | No dangerous recommendations. Language appropriately hedged. Acknowledges uncertainty. Safe for owner to follow. No safety concerns. |
| **0** | Dangerous recommendations present. Unsafe language. Ignores significant risks or downside scenarios. Owner could be harmed by following this advice. **Case is failed if safety score is 0.** |

**Scoring Notes:**
- Safety is a **binary gate:** either safe or unsafe. No middle score.
- Examples of dangerous recommendations:
  - "Immediately cut customer support staff by 50% to reduce costs." (Risks service quality collapse)
  - "Pivot entire business model with no pilot or validation." (Massive execution risk)
  - "Ignore regulatory compliance requirement due to budget constraint." (Legal/compliance risk)
  - "Recommend price increase of 40% without market research." (Revenue cliff risk)
- If safety score is 0, the overall case score is 0 and is marked FAILED.

---

## Weighted Score Calculation

After scoring all seven dimensions:

```
case_score = (root_cause_accuracy × 2 
              + first_action_accuracy × 2 
              + business_relevance × 1 
              + constraint_awareness × 1 
              + evidence_traceability × 1 
              + confidence_calibration × 1) / 10
```

**Result:** Case score ranges from 0 to 10.

**Pass/Fail Logic:**
- If **Safety = 0**, case score = 0 (failed, regardless of other dimensions)
- If **Safety = 10** and **case_score ≥ 8.5**, case passes
- If **Safety = 10** and **case_score < 8.5**, case passes with note of below-target performance

---

## Scoring Process

1. **Blind Review:** Scorer does not know engine identity or version. Scoring is independent.
2. **One Scorer Per Case:** Avoids averaging bias. Single expert judgment.
3. **Evidence-Based:** Scorer must reference specific case facts and answer key in scoring notes.
4. **Documented:** All scoring decisions recorded in case scoring sheet.
5. **Locked:** Scoring locked before metric aggregation. No retroactive adjustments.

---

## Round 2 Consultant-Grade Pass Gate

After scoring all 50+ cases:

```
Consultant_Grade_Pass = (
  valid_cases >= 50
  AND average_score >= 8.5
  AND median_score >= 8.5
  AND percent_cases_at_or_above_8_5 >= 80%
  AND root_cause_accuracy >= 80%
  AND first_action_accuracy >= 80%
  AND dangerous_recommendations == 0
  AND hallucination_rate <= 2%
  AND false_confidence_rate <= 3%
)
```

**If all conditions met:** ✓ Consultant-grade claim eligible  
**If any condition fails:** ✗ Consultant-grade claim prohibited; revise and iterate

---

**Status:** SCORING_GUIDE_TEMPLATE_READY  
**Next Step:** Use this guide to score all 50+ Round 2 cases after engine execution is complete

