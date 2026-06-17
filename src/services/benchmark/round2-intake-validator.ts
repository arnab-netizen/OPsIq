/**
 * Round 2 benchmark intake validator (reusable, deterministic).
 *
 * Enforces ROUND_2_BENCHMARK_ENRICHMENT_SPEC.md at case intake so placeholder /
 * under-specified cases (the Round-1 defect) never enter Round 2. Pure: no I/O,
 * no engine calls, no answer-key leakage into the engine-visible input.
 *
 * A "Round 2 case" = { input: <engine-visible case input>, key: <hidden key> }.
 * The validator inspects both, but only the `input` is ever shown to the engine.
 */

export interface IntakeEvidence {
  dimension: string;
  finding: string;
  confidence?: string;
  source?: string;
  isCritical?: boolean;
  supportingData?: Record<string, unknown>;
}

export interface IntakeCaseInput {
  caseId?: string;
  businessProblem?: string;
  evidence?: IntakeEvidence[];
  ownerIntake?: { riskAppetite?: string } & Record<string, unknown>;
  ownerConstraintProfile?: {
    budgetBand?: string;
    timeHorizonDays?: number;
    staffCapacity?: string;
    cashRunwayMonths?: number | null;
    legalComplianceSensitive?: boolean;
  };
}

export interface IntakeCaseKey {
  true_primary_diagnosis?: string;
  true_secondary_diagnosis?: string;
  documented_root_cause?: string;
  expected_first_action?: string;
  acceptable_first_actions?: string[];
  unsafe_first_actions?: string[];
  expected_safety_label?: string; // SAFE_TO_PROCEED | SHOULD_ABSTAIN | DANGEROUS_IF_PROCEEDED
  adversarial_type?: string;
  expected_gate_outcome?: string; // PROCEED | ABSTAIN
  abstention_eligible?: boolean;
}

export interface Round2Case {
  input: IntakeCaseInput;
  key?: IntakeCaseKey;
}

export interface IntakeFailure {
  code: string;
  detail: string;
}
export interface IntakeResult {
  caseId: string;
  valid: boolean;
  failures: IntakeFailure[];
  content_valid: boolean; // evidence-content checks only (independent of key)
}

/** Boilerplate / placeholder denylist (case-insensitive substring match). */
const PLACEHOLDER_DENYLIST = [
  "performance challenge per case definition",
  "per case definition",
  "placeholder",
  "lorem ipsum",
  "tbd",
  "to be determined",
  "todo",
  "<fill",
  "fill me",
  "xxxx",
];

const MIN_FINDING_LEN = 40;
const MIN_EVIDENCE = 4;
const MIN_CRITICAL = 2;
const MIN_NUMERIC_SUPPORT = 2;

/** Engine-visible answer-key leakage markers (must NOT appear in input). */
const LEAKAGE_MARKERS =
  /case_answer_key|hidden_from_opsiq|documented_root_cause|true_primary_diagnosis|true_root_cause|expected_first_action|expected_or_documented_best_actions|answer_key/i;

/**
 * Taxonomy diagnosis → at least one of these supportingData metric keys must be
 * present in evidence for the case to be committable (unless abstention-eligible
 * or a NO_SINGLE_CAUSE / multi-cause case).
 */
const TRIGGER_METRICS: Record<string, string[]> = {
  cash_liquidity_crisis: ["cashRunwayMonths", "runwayMonths", "monthlyBurn", "cashBalance"],
  unit_economics_failure: ["contribution", "contributionMargin", "contributionPerMember", "cac", "ltv", "variableCost", "price"],
  margin_erosion: ["profitChangePercent", "marginPct", "operatingMargin", "grossMargin", "cogsPct"],
  pricing_power: ["discountPct", "realizedPrice", "listPrice", "priceElasticity"],
  demand_generation_failure: ["newCustomerRate", "pipelineValue", "funnelConversionPct", "leadVolume"],
  gtm_channel_mismatch: ["channelCac", "channelMix", "channelConversionPct"],
  customer_retention_erosion: ["churnPct", "repeatRatePct", "retentionPct", "ltv"],
  quality_trust_failure: ["complaintRate", "defectRate", "nps", "returnRate"],
  operational_bottleneck: ["utilizationPct", "turnaroundDays", "throughput", "capacityPct"],
  inventory_forecasting_mismatch: ["inventoryDays", "stockoutRate", "forecastErrorPct"],
  working_capital_stress: ["dso", "dpo", "cashConversionDays", "receivablesAging"],
  debt_solvency_pressure: ["leverageRatio", "interestCoverage", "covenantHeadroom"],
  legal_governance_risk: ["complianceGapCount", "regulatoryDeadlineDays", "exposureAmount"],
  key_person_risk: ["keyPersonCount", "revenueConcentrationPct", "successionReady"],
  strategic_capex_risk: ["capexAmount", "reversibility", "demandDurabilityMonths", "downsideAmount"],
};
const NO_TRIGGER_REQUIRED = new Set(["no_single_cause", "truly_insufficient", "unknown"]);

function hasNumericSupport(ev: IntakeEvidence): boolean {
  if (!ev.supportingData) return false;
  return Object.values(ev.supportingData).some((v) => typeof v === "number");
}

function evidenceHasMetric(evidence: IntakeEvidence[], metricKeys: string[]): boolean {
  return evidence.some((e) => e.supportingData && metricKeys.some((k) => k in (e.supportingData as object)));
}

/**
 * Validate a Round 2 case. Deterministic; returns all failures (not short-circuit).
 */
export function validateRound2Case(c: Round2Case): IntakeResult {
  const input = c.input ?? {};
  const key = c.key;
  const evidence = input.evidence ?? [];
  const caseId = input.caseId ?? "(unknown)";
  const failures: IntakeFailure[] = [];

  // ── Evidence-content checks (independent of key) ──
  const contentFailures: IntakeFailure[] = [];
  const placeholders = evidence.filter((e) =>
    PLACEHOLDER_DENYLIST.some((p) => (e.finding ?? "").toLowerCase().includes(p))
  );
  if (placeholders.length > 0)
    contentFailures.push({ code: "PLACEHOLDER_FINDING", detail: `${placeholders.length} evidence finding(s) match boilerplate denylist` });

  const short = evidence.filter((e) => (e.finding ?? "").trim().length < MIN_FINDING_LEN);
  if (short.length > 0)
    contentFailures.push({ code: "FINDING_TOO_SHORT", detail: `${short.length} finding(s) under ${MIN_FINDING_LEN} chars` });

  if (evidence.length < MIN_EVIDENCE)
    contentFailures.push({ code: "TOO_FEW_EVIDENCE", detail: `${evidence.length} evidence items (< ${MIN_EVIDENCE})` });

  if (evidence.filter((e) => e.isCritical).length < MIN_CRITICAL)
    contentFailures.push({ code: "TOO_FEW_CRITICAL", detail: `< ${MIN_CRITICAL} critical evidence items` });

  if (evidence.filter(hasNumericSupport).length < MIN_NUMERIC_SUPPORT)
    contentFailures.push({ code: "TOO_FEW_NUMERIC_SUPPORT", detail: `< ${MIN_NUMERIC_SUPPORT} evidence items with numeric supportingData` });

  // Unbalanced dimensions: ALL evidence concentrated in a single dimension (no
  // multi-domain context). A single-domain *diagnosis* is fine as long as the
  // case carries context evidence in ≥2 dimensions. Abstention cases exempt.
  const allDims = new Set(evidence.map((e) => e.dimension));
  const abstentionEligible = key?.abstention_eligible === true;
  if (!abstentionEligible && evidence.length >= MIN_EVIDENCE && allDims.size < 2)
    contentFailures.push({ code: "UNBALANCED_EVIDENCE_DIMENSIONS", detail: `evidence spans ${allDims.size} dimension(s) (< 2) on a non-abstention case` });

  // Answer-key leakage in engine-visible input
  if (LEAKAGE_MARKERS.test(JSON.stringify(input)))
    contentFailures.push({ code: "ANSWER_KEY_LEAKAGE", detail: "answer-key marker detected in engine-visible input" });

  // ── Owner constraints ──
  const ocp = input.ownerConstraintProfile;
  const ocpComplete =
    !!ocp &&
    ocp.budgetBand !== undefined &&
    ocp.timeHorizonDays !== undefined &&
    ocp.staffCapacity !== undefined &&
    ocp.cashRunwayMonths !== undefined &&
    ocp.legalComplianceSensitive !== undefined;
  if (!ocpComplete) failures.push({ code: "MISSING_OWNER_CONSTRAINTS", detail: "ownerConstraintProfile incomplete (need budget/time/staff/runway/legal)" });

  // ── Hidden key checks ──
  if (!key) {
    failures.push({ code: "MISSING_GROUND_TRUTH_DIAGNOSIS", detail: "no hidden key present" });
    failures.push({ code: "MISSING_FIRST_ACTION_KEY", detail: "no hidden key present" });
    failures.push({ code: "MISSING_SAFETY_LABELS", detail: "no hidden key present" });
    failures.push({ code: "MISSING_ABSTENTION_LABEL", detail: "no hidden key present" });
  } else {
    if (!key.true_primary_diagnosis)
      failures.push({ code: "MISSING_GROUND_TRUTH_DIAGNOSIS", detail: "key.true_primary_diagnosis absent" });
    if (!key.expected_first_action || !(key.acceptable_first_actions && key.acceptable_first_actions.length > 0))
      failures.push({ code: "MISSING_FIRST_ACTION_KEY", detail: "expected_first_action / acceptable_first_actions absent" });
    if (!key.expected_safety_label || !key.adversarial_type || !key.expected_gate_outcome)
      failures.push({ code: "MISSING_SAFETY_LABELS", detail: "expected_safety_label / adversarial_type / expected_gate_outcome absent" });
    if (typeof key.abstention_eligible !== "boolean")
      failures.push({ code: "MISSING_ABSTENTION_LABEL", detail: "key.abstention_eligible must be boolean" });

    // Trigger metric present unless abstention-eligible / no-single-cause
    const dx = (key.true_primary_diagnosis ?? "").toLowerCase();
    const required = TRIGGER_METRICS[dx];
    if (required && !abstentionEligible && !NO_TRIGGER_REQUIRED.has(dx)) {
      if (!evidenceHasMetric(evidence, required))
        failures.push({ code: "TRIGGER_METRIC_ABSENT", detail: `diagnosis '${dx}' requires one of [${required.join(", ")}] in evidence supportingData` });
    }
  }

  const allFailures = [...contentFailures, ...failures];
  return {
    caseId,
    valid: allFailures.length === 0,
    failures: allFailures,
    content_valid: contentFailures.length === 0,
  };
}
