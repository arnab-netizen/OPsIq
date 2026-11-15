# Owner Score Comparability Contract

Status: governance + semantics only. No formula, threshold, weight, ordering or numeric output changes.
Code of record: `src/domain/owner-spine/score-semantics.ts` (readonly registry) and
`src/__tests__/owner-spine/score-semantics.test.ts` (governance).

## 1. Principle

Every number the Owner Intelligence Spine carries on a 0–100 (or 0–1) scale is a **bounded, deterministic heuristic
produced by fixed rules**. Sharing a range does not make two scores the same quantity. None is a probability, a
calibrated magnitude or an economic value, and the repository contains no outcome calibration for them (the
`services/calibration` code belongs to the operator queue, not to spine scores). Nothing here introduces
normalization (no z-scores, percentiles, min-max, learned weights, universal scales or probability mapping); the
data to justify any of those does not exist yet.

## 2. Comparability classes

| Class | May do | May not do |
|---|---|---|
| `DOMAIN_LOCAL_ORDINAL` | Rank values from the same domain and the same score definition. | Infer equal intervals or equal meaning across domains. Finance risk 80 > Finance risk 50 is meaningful; Finance risk 80 > Operations risk 70 is not. |
| `DEFINED_ROLLUP_ONLY` | Be combined across domains only through one explicitly defined aggregate (`buildBusinessConditionProfile`). | Treat the aggregate as proof that the inputs are cardinally comparable. |
| `CANONICAL_TIE_BREAK_ONLY` | Be compared across domains only at the subordinate stages of the canonical Owner Decision comparator. | Elect the owner-wide #1 action by itself. |
| `COMMON_RUBRIC` | Reserved for a score proven to follow one identical rubric in every domain. | Be assigned because values share a 0–100 range. **No score currently qualifies**; a test pins this. |

## 3. Score matrix

| Score | Range | Direction | Meaning (from current code) | Comparability | Permitted aggregation | Prohibited inference |
|---|---|---|---|---|---|---|
| `healthScore` (DomainScore) | 0–100 | higher = healthier | Per-domain fixed-rule indicator. Seven domains blend `0.6×(100−risk)` with a domain-specific second term; strategy's second term is its opportunity score; finance is additionally capped by data confidence; recovery is `100 −` severity-weighted finding penalties. | `DEFINED_ROLLUP_ONLY` | mean, only into `overallHealthScore` / owner-home `businessHealthScore` | "Finance 75 is healthier than Sales 70"; health is a percentage or probability |
| `riskScore` (DomainScore) | 0–100 | higher = riskier | Per-domain additive point tables (finance risk, cashflow danger, sales/marketing/operations/SOP risk). Strategy scores a proposed option from its stated risk level. Recovery is a status lookup (85/55/20). | `DEFINED_ROLLUP_ONLY` | max, only within `SURVIVAL_DOMAINS` or `EXECUTION_DOMAINS` | "80 is twice 40"; "Finance 80 outranks Operations 70"; risk is a chance of failure |
| `opportunityScore` (DomainScore) | 0–100 | higher = more opportunity | Per-domain capped upside terms; not expected monetary upside. Recovery is a hard 0. | `DOMAIN_LOCAL_ORDINAL` | none | "80 is worth more money than 60"; comparable across domains |
| `dataConfidenceScore` | 0–100 | higher = more evidence | Evidence completeness: start 100, minus 30 per missing critical input, 5 (marketing 4) per missing important field, 10 invalid currency, 15 stale (windows differ per domain; strategy adds a cash deduction; recovery is `100 − 30×missing`). Same template shape, different inputs: **not one rubric**. | `DEFINED_ROLLUP_ONLY` | mean (`dataConfidenceScore`), min (`lowestDataConfidenceScore`) | "80 means an 80% chance the diagnosis is right"; equal scores mean equally trustworthy evidence |
| `confidence` (finding / action) | 0–1 | higher = more evidence | Metric-derived findings carry `dataConfidenceScore/100`; findings about the data itself are 1; recovery findings use fixed 0.7–0.9 rule constants; an action's value may be nudged by the bounded effectiveness modifier (never for critical severity). Evidence sufficiency / heuristic reliability. **Not calibrated.** | `CANONICAL_TIE_BREAK_ONLY` | none | "0.8 is an 80% chance the recommendation is correct"; averaging/multiplying confidences gives a probability |
| `impactScore` (finding) | 0–100 | higher = more impact | Fixed per-rule rating assigned by the finding rule. | `DOMAIN_LOCAL_ORDINAL` | none | "80 is twice 40"; a currency amount |
| `expectedImpactScore` (action) | 0–100 | higher = more impact | Copied from the finding/recommendation rating (strategy primary step falls back to 60/40). | `CANONICAL_TIE_BREAK_ONLY` | none | "80 is twice 40"; expected value |
| `urgencyScore` | 0–100 | higher = more urgent | Per-rule rating, defaulting from severity (20/45/70/90). Actions re-read from persistence carry 0 (not separately persisted). | `DOMAIN_LOCAL_ORDINAL` | none | a deadline; urgency in one domain outranks another's |
| `effortScore` | 0–100 | **higher = more effort (worse)** | Fixed per-recommendation rating. | `CANONICAL_TIE_BREAK_ONLY` | none | hours or money; "high effort is good" |
| `priorityScore` | 0–100 | higher = higher priority | `clamp(impact × confidence × urgencyFactor × effortFactor × survivalFactor)`. Raw product reaches ~300 so ties at 100 are routine (saturation). Each domain feeds its **own** risk into the survival factor. | `CANONICAL_TIE_BREAK_ONLY` | none | "100 beats 95 across all semantic classes"; probability or economic value; highest `priorityScore` across domains = #1 action |
| `overallHealthScore` | 0–100 | higher = healthier | Equal-weight mean of present domains' `healthScore`. | `DEFINED_ROLLUP_ONLY` | — | the average makes domain scales comparable; "70% healthy" |
| `survivalRiskScore` | 0–100 or `null` | higher = riskier | Max `riskScore` over recovery, finance, cashflow only. `null` = NOT MEASURED. | `DEFINED_ROLLUP_ONLY` | — | measured 0 = NOT MEASURED; a 60% chance of failure |
| `executionRiskScore` | 0–100 or `null` | higher = riskier | Max `riskScore` over operations, SOP only. `null` = NOT MEASURED. | `DEFINED_ROLLUP_ONLY` | — | measured 0 = NOT MEASURED; comparable with survival risk |
| `growthOpportunityScore` | 0–100 | higher = more opportunity | Max `opportunityScore` over **all** present domains. | `DEFINED_ROLLUP_ONLY` | — | a measured growth potential; identifies the best growth domain |
| `lowestDataConfidenceScore` | 0–100 | higher = more evidence | Min `dataConfidenceScore`: worst-of floor so one weak domain is not averaged away. | `DEFINED_ROLLUP_ONLY` | — | a probability the weakest domain is wrong |

`customer` and `portfolio` are listed in `OWNER_DOMAINS` but no `DomainScore` producer exists for them; the
portfolio engine only consumes per-business profiles.

## 4. Business Condition rollup audit

| Rollup | Verdict | Why |
|---|---|---|
| `overallHealthScore` (mean of health) | `DISPLAY_HEURISTIC_ONLY` | Equal-weights uncalibrated domain scales. A fixed profile summary. |
| `survivalRiskScore` (max within recovery/finance/cashflow) | `SEMANTICALLY_VALID` | A defined worst-of alarm over a declared family; monotone; never borrows an unrelated domain (PR #575). A worst reading, not a magnitude. |
| `executionRiskScore` (max within operations/SOP) | `SEMANTICALLY_VALID` | Same construction over the declared execution family. |
| `growthOpportunityScore` (max over all domains) | `UNSAFE_CROSS_DOMAIN_COMPARISON` | Raw max over independently scored domains with no declared family; reports whichever scale runs hottest. Fixing it changes the calculation, so it is **reported, not changed**; owner-facing wording is qualified instead. |
| `dataConfidenceScore` (mean) | `DISPLAY_HEURISTIC_ONLY` | Averages completeness scores whose deduction lists differ. |
| `lowestDataConfidenceScore` (min) | `SEMANTICALLY_VALID` | Conservative worst-of floor that gates a status, not a ranking. |

## 5. Owner Decision contract

Cross-domain heterogeneity is resolved by **business-semantic class and severity before any numeric score**.
`compareOwnerCandidatesWithFactor` orders by: class → recorded compliance block → severity → current evidence →
`priorityScore` → `expectedImpactScore` → `confidence` → lower `effortScore` → identifiers. The numeric factors are
legal **only** as those subordinate tie-breaks. Raw `priorityScore` is **not sufficient** to elect the owner-wide #1
action; the single cross-domain election is `resolveOwnerDecision`. `rankOwnerActions` is domain-local and is only
imported by per-domain action/dashboard modules (enforced by test).

## 6. Cross-domain uses audited (no behavior changed)

| # | Use | Class | Status |
|---|---|---|---|
| 1 | `growthOpportunityScore` = raw max over all domains | unsafe | Wording qualified on `/owner`; calculation unchanged |
| 2 | Portfolio "Highest profit opportunity" / "Best growth candidate" order businesses by #1 | unsafe (inherits #1) | Caption added on `/owner/portfolio`; calculation unchanged |
| 3 | Owner-home top-3 **opportunities** sort mixed-domain findings by raw `impactScore` with no severity/class step | unsafe | **Behavior change needed to fix; reported, not changed.** The surface is already labelled "what was found — your main target decides what comes first" |
| 4 | `dangerLevel` bands (20/40/60/80) applied to every domain's `riskScore` as if comparable | display heuristic | Reported; changing the bands would be a threshold change |
| 5 | Each domain feeds its own risk into `priorityScore`'s survival factor | semantic mismatch | Documented on `priorityScore`; changing it would change numeric output |
| 6 | Owner-home top-3 risks: severity → impact → urgency → confidence → domain → code | acceptable | Severity is the primary key; numeric factors are subordinate; the list is labelled "not an action order" |
| 7 | Portfolio business order: class → severity → current-evidence → survival risk → health → name | acceptable | Numeric factors are late stability tie-breaks after the canonical stages |
| 8 | Portfolio "Highest cash risk" orders businesses by the **same** domain's (cashflow) risk | valid | Same-definition comparison across businesses (`DOMAIN_LOCAL_ORDINAL`) |

## 7. Owner-facing wording changes (copy only)

- `FindingCard` and the cashflow / execution / marketing / strategy pages no longer show "N% confidence"; they show
  "evidence strength N/100 (heuristic, not a probability)". The numeric value is unchanged.
- `/owner` states that the figures are heuristic readings, not probabilities, and how each rollup is formed.
- `/owner/portfolio` states that each ranking line orders businesses by one heuristic score and is not a measured
  amount.

Out-of-scope surfaces found (reported, not changed): bare "Confidence N%" on the startup, operator, decision,
engagement decision-evidence, impact dashboard and execution-workspace pages; "Recovery Probability N%" and
"Likelihood N%" on risk detail pages; sales-pipeline "Win probability" and ROI "success probability" strings; "Overall
Confidence/Risk Level/Execution Certainty N%". These are not Owner Spine scores or need design decisions.
