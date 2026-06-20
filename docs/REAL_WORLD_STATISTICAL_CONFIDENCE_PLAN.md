# Real-World Statistical Confidence Plan

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 5 — Statistical Validation Design  

---

## 1. Purpose

Determine how many real-world blind-replay cases are required before OpsIQ's historical alignment scores become statistically meaningful. Define minimum, recommended, and high-confidence corpus thresholds.

---

## 2. Statistical Framework

### 2.1 What is being measured

Five dimensions are scored per case:

| Dimension | Type | Interpretation |
|---|---|---|
| `historical_alignment` | Binary (aligned / not aligned) | Primary: did engine direction match documented good outcome? |
| `diagnosis_agreement` | Binary (agree / disagree) | Did engine primary diagnosis match documented expert diagnosis? |
| `action_agreement` | Binary (agree / disagree) | Did engine first action match a documented beneficial action? |
| `safety` | Binary (safe / unsafe) | Did engine avoid all documented harmful actions? |
| `counterfactual_review` | Binary (not worse / worse) | Was OpsIQ's output at least as good as the actual decision taken? |

Each dimension is scored as a proportion: `score = (cases_passing / n) × 100%`.

### 2.2 Confidence interval formula

For a binary proportion p with n cases, the 95% confidence interval (Wilson interval approximation for small n) is approximately:

```
CI = p ± 1.96 × sqrt(p(1-p)/n)
```

For p = 0.80 (an 80% alignment score), the CI width at various n values:

| n (cases) | CI width (95%) | Interpretation |
|---|---|---|
| 5 | ±35% | Meaningless — CI spans from 45% to 115% |
| 10 | ±25% | Meaningless — 80% ± 25% = 55% to 100% |
| 20 | ±18% | Barely distinguishable from chance for most p values |
| 30 | ±14% | Weak signal — insufficient for external reporting |
| 50 | ±11% | First minimum viable signal |
| 100 | ±8% | Moderate confidence — publishable with caveats |
| 250 | ±5% | High confidence — suitable for external validation claims |
| 500 | ±4% | Research-grade confidence |

---

## 3. Why 10 Cases Is Insufficient

With n = 10:
- A single case flip changes the score by 10 percentage points
- 95% CI is ±25% around any observed proportion
- An 80% alignment score has CI from 55% to 100% — indistinguishable from 60% or 100%
- The result is dominated by individual case characteristics (source quality, industry type, outcome polarity)
- Cannot detect whether the engine is systematically good or bad at any dimension
- No meaningful sub-group analysis (by industry, size, or polarity) is possible

**Conclusion:** 10 cases produces no interpretable signal. A `historical_alignment` score at n=10 is numerically computable but scientifically meaningless.

---

## 4. Why 20 Cases Is Insufficient

With n = 20:
- 95% CI is ±18%
- An observed 80% score could be "true" performance of 62%–98%
- Cannot distinguish 80% performance from 70% or 90% at 95% confidence
- Sub-group analysis (5+ cases per industry) possible for only 4 industries at most
- Outcome polarity split of ~8 FAILURE / 8 SUCCESS / 4 MIXED provides sub-groups of ~8 per polarity — CI ±28% within each sub-group
- Sampling bias risk is high: 20 cases drawn from a single source type (e.g., all Chapter 11) would over-represent FAILURE polarity and structured industries

**Conclusion:** 20 cases is insufficient for any externally reportable conclusion. Useful only for internal "does the engine produce non-garbage output on real cases" sanity check.

---

## 5. Why 50 May or May Not Be Sufficient

With n = 50, 95% CI is ±11% around the observed proportion.

**Where 50 IS sufficient:**
- Detecting gross failures: if `safety` score is below 70%, a corpus of 50 is sufficient to detect this as statistically significant (p < 0.05)
- Detecting systematic patterns: if the engine consistently mis-diagnoses cash-flow crises as market crises, 50 cases with enough cash-flow-crisis cases (n ≥ 15) will reveal this
- Establishing that the engine is "in the right ballpark" vs. random guessing (50/50 baseline)

**Where 50 is NOT sufficient:**
- Distinguishing 75% alignment from 80% alignment — the CI overlaps
- Making external claims ("OpsIQ achieves 80% historical alignment") — the uncertainty band is too wide
- Sub-group analysis: with 50 cases split across 5 industries × 3 sizes × 3 outcome polarities, most sub-groups have n < 5
- Detecting medium-effect-size failures: a systematic 15% miss rate in one industry may be invisible

**Conclusion:** 50 cases is the minimum viable corpus for internal diagnostic use only. It is sufficient to detect catastrophic failure modes and gross misalignment, but not for external validation claims.

---

## 6. Confidence Thresholds

### 6.1 Minimum Viable Corpus (50 cases)

**Purpose:** Internal signal; catastrophic-failure detection  
**What it can prove:**
- `safety` score statistically different from chance at p < 0.05, if safety ≥ 85%
- `historical_alignment` is not random (if alignment ≥ 75%)
- Engine produces coherent output on real-world evidence structures

**What it cannot prove:**
- Precise performance level (CI too wide)
- Cross-industry performance differences
- Whether alignment scores reflect genuine understanding vs. base-rate bias

**External reportability:** NOT reportable externally. For internal diagnostic use only.

---

### 6.2 Recommended Corpus (100 cases)

**Purpose:** First externally reportable result  
**CI at n = 100:** ±8%  
**What it can prove:**
- `historical_alignment` to ±8% — reportable with appropriate caveats
- `safety` to ±8% — if ≥ 92%, provably non-random at p < 0.001
- Sub-group analysis with ≥ 10 cases per industry category (if balanced)
- Differentiation between outcome polarity performance (FAILURE vs. SUCCESS handling)

**External reportability:** Reportable with explicit confidence intervals. Must include CI and methodology disclosure.

**Recommended breakdown:**
- ≥ 10 cases per primary industry (retail, SaaS, restaurant, manufacturing, hospitality)
- ≥ 15 FAILURE polarity cases
- ≥ 20 SUCCESS polarity cases
- ≥ 15 MIXED polarity cases

---

### 6.3 High-Confidence Corpus (250 cases)

**Purpose:** Robust external validation  
**CI at n = 250:** ±5%  
**What it can prove:**
- All five dimension scores to ±5%
- Industry-specific alignment scores with sub-group n ≥ 20
- Size-specific alignment scores (startup / SMB / mid-market / enterprise)
- Polarity-specific analysis: are FAILURE cases harder than SUCCESS cases?
- Temporal analysis: are pre-2020 cases harder than post-2020 cases?
- Comparison between `diagnosis_agreement` and `action_agreement` (do correct diagnoses lead to correct actions?)

**External reportability:** Fully reportable. Suitable for publications, investor communication, or regulatory disclosure.

---

### 6.4 Research-Grade Corpus (500 cases)

**Purpose:** Publishable research and definitive benchmark  
**CI at n = 500:** ±4%  
**What it can prove:**
- All above, with finer sub-group analysis
- Multivariate analysis: does diagnosis_agreement predict action_agreement?
- Longitudinal analysis: performance delta as engine improves over versions
- Cross-domain robustness analysis

**External reportability:** Research-publication grade.

---

## 7. Dimension-Specific Confidence Requirements

Some dimensions require more cases than others because of lower base-rate variance:

| Dimension | Expected base rate | n needed for reliable measurement |
|---|---|---|
| `safety` | Expected high (≥90% if engine works) | 100 — high rates require more cases to distinguish 95% from 98% |
| `historical_alignment` | Expected moderate (60–80%) | 100 for reportable; 250 for definitive |
| `diagnosis_agreement` | Expected moderate (50–70%) | 100 for initial; 250 for reliable cross-industry |
| `action_agreement` | Expected lower (40–65%) — action matching is harder | 150 for reportable |
| `counterfactual_review` | Expected high (if safety is high) | 100 |

### 7.1 Priority scoring dimension

`historical_alignment` is the primary validation metric. It is the most semantically rich and the most defensible to external stakeholders. Resources should be prioritized to maximize n for this dimension.

---

## 8. Confidence Level Summary Table

| Corpus size | CI at 80% p | Internal use | External reporting | Sub-group analysis | Research grade |
|---|---|---|---|---|---|
| 10 | ±25% | Sanity check only | NO | NO | NO |
| 20 | ±18% | Rough signal | NO | NO | NO |
| 50 | ±11% | YES (diagnostic) | NO | NO | NO |
| 100 | ±8% | YES | YES (with CI) | LIMITED | NO |
| 250 | ±5% | YES | YES (full) | YES | NO |
| 500 | ±4% | YES | YES (full) | YES | YES |

---

## 9. Sampling Strategy for Statistical Validity

To ensure the 50-case minimum corpus is not biased:

| Category | Minimum cases | Rationale |
|---|---|---|
| FAILURE polarity | 15 | Prevent ceiling effect masking failure-detection capability |
| SUCCESS polarity | 20 | Prevent floor effect masking alignment capability |
| MIXED polarity | 15 | Preserve nuance |
| ≥3 distinct industries | 10 each | Detect industry-specific patterns |
| ≥2 size categories | 15 each | Detect size-specific patterns |
| Reliability tier A | 35 | Ensure sourcing quality |
| Reliability tier B | 15 | Allow realistic diversity |

**A corpus that meets all minimum cases but fails any category is statistically biased.** Do not claim 50-case results as representative if the industry or polarity mix is unbalanced.

---

**Phase 5 complete.**
