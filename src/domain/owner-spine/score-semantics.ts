/**
 * Owner Intelligence Spine — SCORE SEMANTICS CONTRACT (pure, readonly, no I/O).
 *
 * Every numeric "score" the spine carries (0–100 scores, 0–1 confidences) is a bounded, deterministic HEURISTIC
 * produced by fixed rules (see each domain's `metrics.ts` / `risk-rules.ts` / `actions.ts`). None is a
 * probability, a calibrated magnitude or an economic value, and sharing a 0–100 range does NOT make two scores
 * the same quantity. This module records, in one place, what each score means and where it may legally be used:
 *
 *   - `direction`        which way is "more" (higher health = healthier; higher effort = MORE effort);
 *   - `interpretation`   always "heuristic_ordinal": order is meaningful within one definition, ratios and
 *                        differences are not (80 is not "twice" 40; a gap of 10 is not a fixed amount);
 *   - `comparability`    the widest scope in which values may be compared (vocabulary below);
 *   - `crossDomainCardinal` always false: no score is declared equal-interval/equal-meaning across domains;
 *   - `crossDomainRawSortLegal` whether a list drawn from DIFFERENT domains may be ordered by the raw value alone;
 *   - `aggregation`      which of average / max / min are legal, and only through a named, defined rollup.
 *
 * COMPARABILITY CLASSES
 *   DOMAIN_LOCAL_ORDINAL      rank values from the SAME domain and the SAME score definition only. Finance risk
 *                             80 > Finance risk 50 is meaningful; Finance risk 80 > Operations risk 70 is not.
 *   DEFINED_ROLLUP_ONLY       cross-domain use is allowed ONLY through one explicitly defined aggregate
 *                             (`buildBusinessConditionProfile`); the aggregate is a fixed display/profile rollup
 *                             and does not make the inputs cardinally comparable.
 *   CANONICAL_TIE_BREAK_ONLY  a cross-domain numeric comparison is legal only at the subordinate stage of the
 *                             canonical Owner Decision comparator (after business class, recorded block,
 *                             severity and current-evidence), never as the election itself.
 *   COMMON_RUBRIC             reserved for a score proven to be produced by ONE identical rubric in every domain.
 *                             NO current score qualifies (same range or a similar penalty template is not enough);
 *                             a test pins that nothing claims it without a deliberate, evidenced change here.
 *
 * Changing any entry here changes documentation and governance only. It changes no formula, threshold, weight,
 * ordering or output. Mirrors docs/opsiq/architecture/OWNER_SCORE_COMPARABILITY_CONTRACT.md.
 */

export const SCORE_COMPARABILITY_CLASSES = [
  "DOMAIN_LOCAL_ORDINAL",
  "DEFINED_ROLLUP_ONLY",
  "CANONICAL_TIE_BREAK_ONLY",
  "COMMON_RUBRIC",
] as const;
export type ScoreComparabilityClass = (typeof SCORE_COMPARABILITY_CLASSES)[number];

export const SCORE_DIRECTIONS = [
  "higher_is_healthier",
  "higher_is_riskier",
  "higher_is_more_opportunity",
  "higher_is_more_evidence",
  "higher_is_more_impact",
  "higher_is_more_urgent",
  "higher_is_more_effort",
  "higher_is_higher_priority",
] as const;
export type ScoreDirection = (typeof SCORE_DIRECTIONS)[number];

/** Where the value is carried in the spine. */
export type ScoreCarrier = "domain_score" | "finding" | "action" | "business_condition_profile" | "owner_decision";

export interface ScoreRange {
  min: number;
  max: number;
}

export interface ScoreAggregationLegality {
  /** Arithmetic mean across domains/entities. */
  average: boolean;
  /** Maximum across domains/entities. */
  max: boolean;
  /** Minimum across domains/entities. */
  min: boolean;
}

export interface ScoreSemantics {
  /** The canonical field name (a finding/action `confidence` is registered as "confidence"). */
  readonly name: string;
  readonly carriers: readonly ScoreCarrier[];
  readonly range: ScoreRange;
  readonly direction: ScoreDirection;
  /** Always an ordinal heuristic: no score is an interval, ratio or calibrated quantity. */
  readonly interpretation: "heuristic_ordinal";
  /** What the value actually measures, from the current implementation. */
  readonly meaning: string;
  readonly comparability: ScoreComparabilityClass;
  /** Always false: no score is declared equal-interval or equal-meaning across domains. */
  readonly crossDomainCardinal: false;
  /** May a list that mixes domains be ordered by this raw value alone? */
  readonly crossDomainRawSortLegal: boolean;
  /** Aggregations that are legal ONLY through the named defined rollup(s) in `legalRollups`. */
  readonly aggregation: ScoreAggregationLegality;
  readonly legalRollups: readonly string[];
  /** Always false: no score here is a probability or a likelihood of correctness/occurrence. */
  readonly probabilistic: false;
  /** Where the canonical decision may use it (empty when it may not). */
  readonly canonicalUse: string;
  /** Inferences a reader or UI must NOT draw. */
  readonly prohibitedInferences: readonly string[];
}

const NO_AGG: ScoreAggregationLegality = { average: false, max: false, min: false };

const SCORE_ENTRIES: readonly ScoreSemantics[] = [
  {
    name: "healthScore",
    carriers: ["domain_score"],
    range: { min: 0, max: 100 },
    direction: "higher_is_healthier",
    interpretation: "heuristic_ordinal",
    meaning:
      "A domain's own fixed-rule health indicator. Seven domains blend 0.6×(100−risk) with a domain-specific second " +
      "term (similar shape, different inputs; strategy's second term is its opportunity score; finance is further " +
      "capped by data confidence). Recovery's is 100 minus severity-weighted finding penalties. Not one rubric.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: { average: true, max: false, min: false },
    legalRollups: ["overallHealthScore (buildBusinessConditionProfile)", "businessHealthScore (owner-home summary)"],
    probabilistic: false,
    canonicalUse: "",
    prohibitedInferences: [
      "Finance health 75 is objectively healthier than Sales health 70",
      "a domain health score is a probability or a percentage of anything",
    ],
  },
  {
    name: "riskScore",
    carriers: ["domain_score"],
    range: { min: 0, max: 100 },
    direction: "higher_is_riskier",
    interpretation: "heuristic_ordinal",
    meaning:
      "A domain's own fixed-rule risk indicator, built from different additive point tables per domain (finance risk, " +
      "cashflow danger, sales/marketing/operations/SOP risk). Strategy's scores a proposed option from a stated risk " +
      "level, not the business; recovery's is a status lookup (critical 85 / at_risk 55 / healthy 20).",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: { average: false, max: true, min: false },
    legalRollups: [
      "survivalRiskScore (max within SURVIVAL_DOMAINS only)",
      "executionRiskScore (max within EXECUTION_DOMAINS only)",
    ],
    probabilistic: false,
    canonicalUse: "",
    prohibitedInferences: [
      "risk 80 means twice the risk of 40",
      "Finance risk 80 outranks Operations risk 70 in business importance",
      "a risk score is a chance of failure",
    ],
  },
  {
    name: "opportunityScore",
    carriers: ["domain_score"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_opportunity",
    interpretation: "heuristic_ordinal",
    meaning: "A domain's own fixed-rule opportunity signal; not an expected monetary upside.",
    comparability: "DOMAIN_LOCAL_ORDINAL",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse: "",
    prohibitedInferences: [
      "opportunity 80 is worth more money than opportunity 60",
      "one domain's opportunity score is comparable with another's",
    ],
  },
  {
    name: "dataConfidenceScore",
    carriers: ["domain_score", "business_condition_profile"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_evidence",
    interpretation: "heuristic_ordinal",
    meaning:
      "Evidence completeness/sufficiency of one domain's snapshot: starts at 100 and loses fixed points for missing " +
      "critical and important inputs, invalid currency and staleness. The deduction template is shared in shape by " +
      "finance, cashflow, sales, marketing, operations, SOP and strategy, but the input lists and staleness windows " +
      "differ per domain (marketing deducts 4 per important field, others 5; strategy adds a cash-affordability " +
      "deduction); recovery's is 100 − 30 per missing revenue/cost/order input. So it is not one identical rubric. It is not a probability that anything is correct.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: { average: true, max: false, min: true },
    legalRollups: [
      "dataConfidenceScore (average, buildBusinessConditionProfile)",
      "lowestDataConfidenceScore (worst-of floor, buildBusinessConditionProfile)",
      "dataSufficiencyStatus thresholds DATA_CONFIDENCE_CAUTION / DATA_CONFIDENCE_INSUFFICIENT",
    ],
    probabilistic: false,
    canonicalUse: "Business-wide sufficiency status caps the displayed owner-decision confidence (never reorders candidates).",
    prohibitedInferences: [
      "data confidence 80 means an 80% chance the diagnosis is right",
      "equal data confidence in two domains means equally trustworthy evidence",
    ],
  },
  {
    name: "confidence",
    carriers: ["finding", "action"],
    range: { min: 0, max: 1 },
    direction: "higher_is_more_evidence",
    interpretation: "heuristic_ordinal",
    meaning:
      "Evidence sufficiency of one finding/action: metric-derived findings carry the domain's dataConfidenceScore/100; " +
      "findings about the data itself are set to 1; an action's value may be nudged by the bounded effectiveness " +
      "modifier (never for critical severity). No calibration against outcomes exists in the repository for this value.",
    comparability: "CANONICAL_TIE_BREAK_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse: "Owner Decision comparator stage 'confidence' (after priority and impact), and the displayed decision-confidence level.",
    prohibitedInferences: [
      "confidence 0.8 means an 80% chance this recommendation is correct",
      "averaging or multiplying confidences yields a probability",
    ],
  },
  {
    name: "impactScore",
    carriers: ["finding"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_impact",
    interpretation: "heuristic_ordinal",
    meaning: "A fixed per-rule impact rating assigned by the finding rule; not a measured amount.",
    comparability: "DOMAIN_LOCAL_ORDINAL",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse: "",
    prohibitedInferences: ["impact 80 is twice the impact of 40", "impact is a currency amount"],
  },
  {
    name: "expectedImpactScore",
    carriers: ["action"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_impact",
    interpretation: "heuristic_ordinal",
    meaning: "A fixed per-recommendation impact rating; not expected value and not an economic estimate.",
    comparability: "CANONICAL_TIE_BREAK_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse: "Owner Decision comparator stage 'impact' (after priority); domain-local action ranking.",
    prohibitedInferences: ["expected impact 80 is twice the impact of 40", "expected impact is a currency amount"],
  },
  {
    name: "urgencyScore",
    carriers: ["finding", "action"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_urgent",
    interpretation: "heuristic_ordinal",
    meaning:
      "A fixed per-rule urgency rating (defaulting from severity: low 20, medium 45, high 70, critical 90); not a " +
      "deadline or time estimate. Actions re-read from persistence carry urgency 0 (it is not separately persisted).",
    comparability: "DOMAIN_LOCAL_ORDINAL",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse: "Input to calculateOwnerPriorityScore (urgency factor) and to the finding tie-break chain; not compared on its own across domains by the Owner Decision.",
    prohibitedInferences: ["urgency 90 means it must happen within a set time", "urgency in one domain outranks urgency in another"],
  },
  {
    name: "effortScore",
    carriers: ["action"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_effort",
    interpretation: "heuristic_ordinal",
    meaning: "A fixed per-recommendation effort rating. HIGHER MEANS MORE EFFORT (worse), not better; it lowers priority.",
    comparability: "CANONICAL_TIE_BREAK_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse: "Owner Decision comparator stage 'effort' (lower effort first, after confidence).",
    prohibitedInferences: ["effort 80 is a quantity of hours or money", "high effort is a good score"],
  },
  {
    name: "priorityScore",
    carriers: ["action", "owner_decision"],
    range: { min: 0, max: 100 },
    direction: "higher_is_higher_priority",
    interpretation: "heuristic_ordinal",
    meaning:
      "calculateOwnerPriorityScore: impact × confidence × urgency factor × effort factor × survival factor, clamped to " +
      "[0, 100]. The raw product reaches ~300, so ties at 100 are routine (saturation). Each domain feeds its OWN risk " +
      "reading into the survival factor, so values are not on a shared footing across domains. A deterministic " +
      "heuristic: not a probability, not economic value.",
    comparability: "CANONICAL_TIE_BREAK_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: [],
    probabilistic: false,
    canonicalUse:
      "Valid for ordering ONE domain's own actions (rankOwnerActions). Across domains it is only the 'priority' " +
      "tie-break inside resolveOwnerDecision, after class, recorded block, severity and current-evidence. Raw " +
      "'highest priorityScore wins' across domains is prohibited.",
    prohibitedInferences: [
      "priority 100 is universally more important than every priority 95 across all semantic classes",
      "priority is a probability or an economic value",
      "the highest priorityScore across domains is the owner's #1 action",
    ],
  },
  {
    name: "overallHealthScore",
    carriers: ["business_condition_profile"],
    range: { min: 0, max: 100 },
    direction: "higher_is_healthier",
    interpretation: "heuristic_ordinal",
    meaning: "Equal-weight mean of the present domains' healthScore: a fixed display/profile rollup.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: ["buildBusinessConditionProfile"],
    probabilistic: false,
    canonicalUse: "Display; a late stability tie-break in the portfolio business list only.",
    prohibitedInferences: [
      "the average makes the underlying domain health scales cardinally comparable",
      "overall health 70 means the business is 70% healthy",
    ],
  },
  {
    name: "survivalRiskScore",
    carriers: ["business_condition_profile"],
    range: { min: 0, max: 100 },
    direction: "higher_is_riskier",
    interpretation: "heuristic_ordinal",
    meaning:
      "Worst-of (max) riskScore across SURVIVAL_DOMAINS (recovery, finance, cashflow) only. null = NOT MEASURED " +
      "(no survival domain supplied evidence), which is distinct from a measured 0.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: ["buildBusinessConditionProfile"],
    probabilistic: false,
    canonicalUse: "Survival factor inside calculateOwnerPriorityScore; display; portfolio urgency tie-break.",
    prohibitedInferences: ["a measured value of 0 and NOT MEASURED are the same", "survival risk 60 is a 60% chance of failure"],
  },
  {
    name: "executionRiskScore",
    carriers: ["business_condition_profile"],
    range: { min: 0, max: 100 },
    direction: "higher_is_riskier",
    interpretation: "heuristic_ordinal",
    meaning: "Worst-of (max) riskScore across EXECUTION_DOMAINS (operations, sop) only. null = NOT MEASURED.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: ["buildBusinessConditionProfile"],
    probabilistic: false,
    canonicalUse: "Display; portfolio 'worst execution problem' ordering.",
    prohibitedInferences: ["a measured value of 0 and NOT MEASURED are the same", "execution risk is comparable with survival risk"],
  },
  {
    name: "growthOpportunityScore",
    carriers: ["business_condition_profile"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_opportunity",
    interpretation: "heuristic_ordinal",
    meaning:
      "Max opportunityScore across ALL present domains (no domain family). Because each domain scores opportunity on " +
      "its own rules, this reports whichever domain's own scale reads highest; it is not a measured growth potential.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: ["buildBusinessConditionProfile"],
    probabilistic: false,
    canonicalUse: "Display only; portfolio growth-candidate ordering (see UNSAFE_CROSS_DOMAIN_COMPARISON in the contract).",
    prohibitedInferences: ["growth opportunity 80 is a measured growth potential", "it identifies the best growth domain"],
  },
  {
    name: "lowestDataConfidenceScore",
    carriers: ["business_condition_profile"],
    range: { min: 0, max: 100 },
    direction: "higher_is_more_evidence",
    interpretation: "heuristic_ordinal",
    meaning: "Worst-of (min) dataConfidenceScore across present domains, so one stale/missing domain is never averaged away.",
    comparability: "DEFINED_ROLLUP_ONLY",
    crossDomainCardinal: false,
    crossDomainRawSortLegal: false,
    aggregation: NO_AGG,
    legalRollups: ["buildBusinessConditionProfile"],
    probabilistic: false,
    canonicalUse: "Business-wide data-sufficiency status (caution / insufficient).",
    prohibitedInferences: ["it is a probability that the weakest domain is wrong"],
  },
];

/** Frozen, deterministic registry keyed by canonical score name. */
export const SCORE_SEMANTICS: Readonly<Record<string, ScoreSemantics>> = Object.freeze(
  Object.fromEntries(SCORE_ENTRIES.map((e) => [e.name, Object.freeze(e)]))
);

export const SCORE_SEMANTICS_NAMES: readonly string[] = Object.freeze(SCORE_ENTRIES.map((e) => e.name));

export function scoreSemanticsFor(name: string): ScoreSemantics | undefined {
  return Object.prototype.hasOwnProperty.call(SCORE_SEMANTICS, name) ? SCORE_SEMANTICS[name] : undefined;
}

/** Classification of each cross-domain aggregate in `buildBusinessConditionProfile` / the owner-home summary. */
export const BUSINESS_CONDITION_ROLLUP_AUDIT = Object.freeze({
  overallHealthScore: {
    rollup: "equal-weight average of present domains' healthScore",
    verdict: "DISPLAY_HEURISTIC_ONLY",
    reason: "Averages uncalibrated domain scales with equal weight; a fixed profile summary, not a measurement.",
  },
  survivalRiskScore: {
    rollup: "max riskScore within SURVIVAL_DOMAINS; null (NOT MEASURED) when none present",
    verdict: "SEMANTICALLY_VALID",
    reason:
      "A defined worst-of alarm over a declared three-domain family: monotone (any member rising raises it) and never " +
      "borrows an unrelated domain. It reports a worst reading, not a magnitude or a probability.",
  },
  executionRiskScore: {
    rollup: "max riskScore within EXECUTION_DOMAINS; null (NOT MEASURED) when none present",
    verdict: "SEMANTICALLY_VALID",
    reason: "Same worst-of construction over the declared operations/SOP family.",
  },
  growthOpportunityScore: {
    rollup: "max opportunityScore across all present domains",
    verdict: "UNSAFE_CROSS_DOMAIN_COMPARISON",
    reason:
      "Takes a raw maximum across heterogeneous, independently scored domains with no declared family, so it picks " +
      "whichever scale runs hottest. Correcting it would change the calculation, so it is reported, not changed here; " +
      "the owner-facing wording is qualified instead.",
  },
  dataConfidenceScore: {
    rollup: "average of present domains' dataConfidenceScore",
    verdict: "DISPLAY_HEURISTIC_ONLY",
    reason: "Averages evidence-completeness scores whose deduction lists differ per domain.",
  },
  lowestDataConfidenceScore: {
    rollup: "min dataConfidenceScore across present domains",
    verdict: "SEMANTICALLY_VALID",
    reason: "A conservative worst-of floor chosen precisely so one weak domain is not averaged away; it gates a status, not a ranking.",
  },
} as const);
