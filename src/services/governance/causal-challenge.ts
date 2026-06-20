/**
 * RC-7 Option A — independent causal-challenge verifier (deterministic).
 *
 * The engine has only three OPERATIONAL archetypes (operational_bottleneck,
 * quality_control_failure, customer_retention_erosion). A confident, well-
 * supported diagnosis can still be causally WRONG when (a) the stated problem
 * references a cause in a domain the engine cannot represent (market/strategic,
 * financial-structural, legal/regulatory, people/key-person, external/macro), or
 * (b) strong ADVERSE evidence sits in a dimension the chosen archetype ignored.
 *
 * This verifier challenges a COMMITTED diagnosis using runtime-available signals
 * only: businessProblem text, evidence dimension/finding/supportingData/isCritical,
 * the diagnosis type and its used evidenceIds. No answer keys, no probe keys, no
 * monitor flags, no benchmark labels.
 *
 * It only ever pushes toward ABSTAIN (escalate to human); it never converts an
 * abstain into a proceed. Benign off-archetype evidence does NOT trigger it.
 */

export type DiagnosisTypeStr =
  | "operational_bottleneck"
  | "quality_control_failure"
  | "customer_retention_erosion"
  | "unknown"
  | string;

export interface CausalEvidence {
  dimension: string;
  finding: string;
  isCritical?: boolean;
  supportingData?: Record<string, string | number | boolean>;
}

export interface CausalChallengeInput {
  committed: boolean;
  businessProblem: string;
  diagnosisType: DiagnosisTypeStr;
  evidence: CausalEvidence[];
}

export interface CausalChallengeSignal {
  committed: boolean;
  challenged: boolean;
  outOfModelCauseInProblem: boolean;
  adverseOffArchetypeEvidence: boolean;
  reasons: string[];
  /** Preferred abstention state for the engine rule. */
  abstention_hint: "OUTSIDE_VALID_SCOPE" | "CONFLICTING_SIGNALS" | null;
}

/**
 * Dimensions each archetype actually reasons over (archetype metadata — NOT a
 * gate threshold or rule change). Used by the adverse-off-archetype check to
 * know which dimension is "in-model" (home) for the chosen diagnosis. E1 adds
 * the three financial archetypes whose home dimension is financial_health.
 */
const ARCHETYPE_DIMENSIONS: Record<string, Set<string>> = {
  operational_bottleneck: new Set(["operational_efficiency", "customer_retention"]),
  quality_control_failure: new Set(["quality_delivery"]),
  customer_retention_erosion: new Set(["customer_retention"]),
  cash_liquidity_crisis: new Set(["financial_health"]),
  unit_economics_failure: new Set(["financial_health"]),
  margin_erosion: new Set(["financial_health"]),
  // E2 slice 1 archetype metadata (home dimensions) — NOT a gate threshold or rule
  // change; the off-archetype check needs each new archetype's home dimension to
  // evaluate it, exactly as E1 registered the three financial archetypes above.
  debt_solvency_pressure: new Set(["financial_health"]),
  working_capital_stress: new Set(["financial_health"]),
  pricing_power: new Set(["market_position", "financial_health"]),
  // E2 slice 2 archetype metadata (home dimensions) — same metadata-only registration.
  demand_generation_failure: new Set(["market_position"]),
  gtm_channel_mismatch: new Set(["market_position", "financial_health"]),
  inventory_forecasting_mismatch: new Set(["operational_efficiency"]),
  // E2 slice 3 archetype metadata (home dimensions) — same metadata-only registration;
  // the off-archetype check needs each new archetype's home dimension to evaluate it.
  legal_governance_risk: new Set(["process_maturity", "market_position"]),
  key_person_risk: new Set(["team_capability"]),
  strategic_capex_risk: new Set(["financial_health", "market_position"]),
};

/**
 * Causal domains the three operational archetypes CANNOT represent. Category-
 * based stems (general business vocabulary, not probe-specific phrasings).
 */
const OUT_OF_MODEL_CAUSE_STEMS: string[] = [
  // market / strategic / competitive
  "competitor", "competition", "free tier", "market share", "substitute",
  // financial-structural
  "negative margin", "negative unit", "insolven", "runway", "cash burn", "below cost",
  // legal / regulatory
  "regulation", "regulatory", "banned", "ban on", "lawsuit", "compliance ban",
  // people / key-person
  "resigned", "quit", "key person", "key-person", "sole ", "founder", "only master", "left the",
  // external / macro
  "recession", "macro", "demand collapse", "demand fell", "pandemic", "seasonal",
  "temporary surge", "supply chain", "disruption", "overproduction",
  // integrity / systems
  "fraud", "theft", "shrinkage", "embezzle", "double-charged", "overcharged",
  "billing bug", "billing-system", "system bug",
  // capital allocation
  "capex", "factory investment", "build a new factory", "major investment",
];

/** Adverse-polarity tokens for evidence findings. */
const ADVERSE_STEMS: string[] = [
  "down ", "drop", "fell", "falling", "decline", "declin", "negative", "loss",
  "losing", "shrinkage", "fraud", "theft", "stolen", "banned", "refund", "collapse",
  "deficit", "below cost", "disrupt", "overproduc", "plummet", "worsen", "deteriorat",
];

/** Benign-polarity guard tokens. */
const BENIGN_STEMS: string[] = [
  "healthy", "positive", "stable", "strong", "growing", "grew", "improv", "up sharply",
  "unchanged", "flat",
];

function hasStem(text: string, stems: string[]): boolean {
  const t = text.toLowerCase();
  return stems.some((s) => t.includes(s));
}

function numericAdverse(ev: CausalEvidence): boolean {
  if (!ev.supportingData) return false;
  return Object.values(ev.supportingData).some(
    (v) => typeof v === "number" && v < 0
  );
}

/** Is this finding adverse (and not dominated by a benign signal)? */
function isAdverseFinding(ev: CausalEvidence): boolean {
  const adverse = hasStem(ev.finding, ADVERSE_STEMS) || numericAdverse(ev);
  if (!adverse) return false;
  // A clearly-benign, non-numeric-negative finding is not adverse.
  const benign = hasStem(ev.finding, BENIGN_STEMS) && !numericAdverse(ev);
  return !benign;
}

// ─── Adverse-off-archetype NARROWING (this slice; out-of-model arm untouched) ──
// The blanket rule "any off-home adverse evidence ⇒ abstain" over-abstained cases
// whose committed diagnosis is correct and whose off-home adverse signal is merely a
// SECONDARY / downstream / low-severity symptom. The narrowed rule abstains only when
// an off-home adverse item is genuinely high-severity or contradictory:
//   - it must be CRITICAL (non-critical off-home adverse is secondary), AND
//   - it must NOT be a downstream symptom the committed diagnosis already explains
//     (customer-retention churn under a churn-driver diagnosis — R2 models these as
//     upstream causes of churn), AND
//   - it must carry a HIGH-SEVERITY signal: a protected-danger family phrase, or a
//     severe adverse numeric (negative margin/contribution, or ≤3-month runway).
// Protected-danger families ALWAYS hold. This only ever REDUCES abstention; it can
// never create a proceed (the gate stays fail-closed elsewhere) and is independent of
// the out-of-model arm above.

/** Diagnoses for which customer-retention churn is a known DOWNSTREAM symptom. */
const CHURN_DRIVER_DIAGNOSES = new Set<string>([
  "quality_control_failure",
  "operational_bottleneck",
  "customer_retention_erosion",
  "key_person_risk",
  "pricing_power",
  "demand_generation_failure",
]);

/** Protected-danger families that must always hold (legal/fraud/capex/liquidity/owner-scaling-a-loss). */
const PROTECTED_OFF_ARCHETYPE =
  /regulat|complian|\bfraud\b|misconduct|governance|lawsuit|sanction|consent order|\bcapex\b|irreversible|automation line|facility expansion|expansion commitment|scale[\w ]*(?:spend|acquisition)[\w ]*(?:loss|losing)|grow out of the loss|insolven|out of cash|cannot make payroll|missed payroll/;

/**
 * Structural-commitment terms within PROTECTED_OFF_ARCHETYPE that represent
 * genuinely dangerous commitments regardless of diagnosis type. These always hold
 * even for financial-distress diagnoses.
 */
const PROTECTED_STRUCTURAL_COMMITMENT =
  /\bcapex\b|irreversible|automation line|facility expansion|expansion commitment|scale[\w ]*(?:spend|acquisition)[\w ]*(?:loss|losing)|grow out of the loss/;

/**
 * Financial-distress diagnoses for which governance/regulatory/insolvency evidence in
 * off-home dimensions is an EXPECTED co-occurrence rather than a contradiction. In
 * real-world multi-dimensional corporate crises, governance scrutiny, regulatory
 * proceedings, fraud allegations, and insolvency filings routinely accompany cash and
 * debt crises without contradicting the financial diagnosis. The bypass applies only
 * when the off-archetype finding has no numeric corroboration (empty/absent
 * supportingData) — a quantified governance finding (e.g. complianceGapCount set)
 * retains the full PROTECTED_OFF_ARCHETYPE hold.
 */
const FINANCIAL_DISTRESS_DIAGNOSES = new Set<string>([
  "cash_liquidity_crisis",
  "debt_solvency_pressure",
  "working_capital_stress",
]);

/**
 * Legal-governance diagnoses for which governance/regulatory/fraud evidence in
 * off-home dimensions (e.g. raw "governance", "finance", "operations") is the
 * SAME signal that triggered the diagnosis, not a contradiction of it. When the
 * committed diagnosis is legal_governance_risk and the off-home finding matches
 * PROTECTED_OFF_ARCHETYPE only via the governance/legal/fraud vocabulary below
 * (LEGAL_GOVERNANCE_HOME_SIGNAL), it is consistent co-reporting, not an adverse
 * contradiction. Structural-commitment terms (capex/irreversible/expansion) and
 * insolvency/cash terms always hold regardless.
 */
const LEGAL_GOVERNANCE_DIAGNOSES = new Set<string>(["legal_governance_risk"]);

/**
 * The governance/regulatory/fraud/compliance vocabulary that is the home signal
 * of legal_governance_risk. Finding this in off-home dimensions does not contradict
 * a committed legal_governance_risk — it is the very signal that produced the diagnosis.
 * Structural commitment (capex/irreversible) and insolvency/cash terms are deliberately
 * excluded so they still hold.
 */
const LEGAL_GOVERNANCE_HOME_SIGNAL =
  /regulat|complian|\bfraud\b|misconduct|governance|lawsuit|sanction|consent order/;

/**
 * Financial-AGGRAVATION language: the off-home critical evidence shows the owner's
 * plan deepening/worsening an already-critical core problem (a high-severity
 * contradiction, not a stable secondary symptom) — must always hold.
 */
const AGGRAVATION_OFF_ARCHETYPE =
  /deepen|worsen|trade through|low[- ]?margin|below cost|loss-?making|bid(?:ding)?[\w ]*low|back-?loaded|dig[\w ]*deeper|covenant breach|near covenant|deepens the hole/;

/** Negative-margin / contribution distress stated in text (the numeric may be absent or unrecognized). */
const SEVERE_FINANCIAL_TEXT =
  /negative (?:unit )?(?:contribution|gross )?margin|contribution[\w ]*negative|margin[\w ]*negative|below cost|loss-?making/;

function offArchetypeText(ev: CausalEvidence): string {
  return `${ev.finding} ${JSON.stringify(ev.supportingData ?? {})}`.toLowerCase();
}

/** A severe adverse numeric on an off-home item: negative margin/contribution, or ≤3-month runway. */
function offArchetypeNumericSevere(ev: CausalEvidence): boolean {
  const d = ev.supportingData ?? {};
  const negFinancial = [
    "marginPct",
    "operatingMargin",
    "contribution",
    "contributionMargin",
    "grossMarginPct",
  ].some((k) => typeof d[k] === "number" && (d[k] as number) < 0);
  const runway =
    typeof d.cashRunwayMonths === "number"
      ? (d.cashRunwayMonths as number)
      : typeof d.runwayMonths === "number"
        ? (d.runwayMonths as number)
        : undefined;
  return negFinancial || (runway !== undefined && runway <= 3);
}

/**
 * Should this off-home item HOLD the diagnosis (⇒ abstain), as opposed to a
 * secondary / downstream / low-severity symptom (⇒ release)? It holds only when the
 * item is CRITICAL, is not a downstream churn symptom the diagnosis already explains,
 * and carries a genuinely high-severity / contradictory signal: a protected-danger
 * family phrase, financial-aggravation language (owner's plan deepening the core
 * problem — these adverse signals are missed by the base adverse-stem list), or a
 * severe adverse numeric (negative margin/contribution, or ≤3-month runway). The
 * protected / aggravation phrases hold regardless of base adverse polarity because
 * they ARE the adverse signal; the numeric branch additionally requires a base
 * adverse finding so a stray negative field cannot over-hold a benign item.
 */
function isHoldWorthyOffArchetype(ev: CausalEvidence, diagnosisType: string): boolean {
  if (!ev.isCritical) return false; // non-critical off-home adverse is secondary
  if (ev.dimension === "customer_retention" && CHURN_DRIVER_DIAGNOSES.has(diagnosisType)) {
    return false; // downstream churn the diagnosis already explains
  }
  const t = offArchetypeText(ev);
  // Protected-danger, financial-aggravation, and explicit negative-margin/severe-runway
  // signals are inherently high-severity and hold regardless of base adverse polarity.
  //
  // P1 co-occurrence bypass: for committed financial-distress diagnoses
  // (cash_liquidity_crisis, debt_solvency_pressure, working_capital_stress), governance/
  // regulatory/fraud/insolvency terms in PROTECTED_OFF_ARCHETYPE describe EXPECTED
  // secondary context of a financial crisis, not contradictions of the committed
  // diagnosis. The bypass is conditional on the finding having no numeric corroboration
  // (empty/absent supportingData) — a quantified governance finding retains the full
  // hold. Structural-commitment terms (capex/irreversible/expansion) always hold.
  if (PROTECTED_OFF_ARCHETYPE.test(t)) {
    const isFinancialDistress = FINANCIAL_DISTRESS_DIAGNOSES.has(diagnosisType);
    const hasNumericCorroboration =
      !!ev.supportingData && Object.keys(ev.supportingData).length > 0;
    const isStructuralCommitment = PROTECTED_STRUCTURAL_COMMITMENT.test(t);
    if (isFinancialDistress && !hasNumericCorroboration && !isStructuralCommitment) {
      // P1 bypass: governance/regulatory/fraud/insolvency co-occurrence without numeric
      // corroboration for a committed financial-distress diagnosis — do not hold
    } else if (
      LEGAL_GOVERNANCE_DIAGNOSES.has(diagnosisType) &&
      !hasNumericCorroboration &&
      !isStructuralCommitment &&
      LEGAL_GOVERNANCE_HOME_SIGNAL.test(t)
    ) {
      // P2 bypass: the off-home finding contains the same governance/regulatory/fraud
      // vocabulary that triggered the committed legal_governance_risk diagnosis. Governance
      // and fraud language in raw "operations"/"finance"/"governance" dimensions is
      // consistent with the diagnosis, not a contradiction of it.
    } else {
      return true;
    }
  }
  if (AGGRAVATION_OFF_ARCHETYPE.test(t)) return true;
  if (SEVERE_FINANCIAL_TEXT.test(t)) return true;
  if (offArchetypeNumericSevere(ev)) return true;
  return false;
}

// ─── Out-of-model arm NARROWING (this slice; adverse-off-archetype arm untouched) ──
// The blanket rule "any OUT_OF_MODEL_CAUSE_STEMS token in the problem ⇒ abstain" was
// written when the engine had only three operational archetypes. After R5 slices 1–3
// most of those domains (cash/WC/debt/pricing/unit-econ/margin/demand/gtm/inventory/
// legal/key-person/capex) are COVERED, so a stem naming the very cause the engine now
// diagnoses is no longer "out of model". The narrowed rule holds the out-of-model arm
// ONLY when a matched stem belongs to a PROTECTED-DANGER family (liquidity / capex /
// legal-fraud) that the committed diagnosis does NOT subsume — i.e. an unresolved
// dangerous primary cause the chosen diagnosis ignores (e.g. a capex diagnosis that
// ignores a thin-runway liquidity threat, as in ADV-02). Now-covered non-dangerous
// domains (key-person/demand/market/unit-econ) and incidental macro/temporal/integrity
// mentions no longer abstain on this arm. Severe off-archetype financial/legal evidence
// is independently caught by the (untouched) adverse-off-archetype arm and the
// owner-action danger detector, so this only ever REDUCES abstention.

/** Protected-danger stem families: proceeding on an unresolved instance of these is dangerous. */
const PROTECTED_STEM_DOMAINS: { domain: string; stems: string[] }[] = [
  { domain: "liquidity", stems: ["runway", "insolven", "cash burn", "out of cash", "cannot make payroll", "missed payroll"] },
  { domain: "capex", stems: ["capex", "factory investment", "build a new factory", "major investment"] },
  { domain: "legal", stems: ["regulation", "regulatory", "lawsuit", "compliance ban", "banned", "ban on"] },
  { domain: "integrity", stems: ["fraud", "theft", "embezzle"] },
];

/** Which protected-danger domains a committed covered diagnosis SUBSUMES (so they no longer hold). */
const DIAGNOSIS_SUBSUMES_DOMAIN: Record<string, Set<string>> = {
  // cash and debt crises subsume liquidity AND legal/regulatory proceedings —
  // regulatory scrutiny and insolvency proceedings are expected co-occurrences of
  // financial distress, not out-of-model primary causes that contradict the diagnosis.
  cash_liquidity_crisis: new Set(["liquidity", "legal"]),
  working_capital_stress: new Set(["liquidity"]),
  debt_solvency_pressure: new Set(["liquidity", "legal"]),
  strategic_capex_risk: new Set(["capex"]),
  // legal_governance_risk subsumes liquidity in addition to legal and integrity:
  // insolvency proceedings and liquidity collapse are frequent downstream consequences
  // of governance/fraud failures (Byju's-style), not independent causal domains that
  // contradict a committed governance diagnosis.
  legal_governance_risk: new Set(["legal", "integrity", "liquidity"]),
};

// A dangerous owner-proposed deep/broad discount stated alongside negative unit
// economics in the PROBLEM text is a protected danger that NO diagnosis subsumes — it
// must always hold. (This mirrors the owner-action danger detector, which reads the
// case EVIDENCE; this catches the same danger when it is stated in the problem text.)
const PROBLEM_DEEP_DISCOUNT =
  /(deep|aggressive|sitewide|site-wide|across[- ]the[- ]board|broad|blanket|steep|heavy|large)[\w ,'-]{0,40}?(discount|price cut|markdown|promotion)|discount(?:ing)? (?:deeply|hard|aggressively|heavily)|deep discount/;
const PROBLEM_NEGATIVE_ECON =
  /unit economics[\w ]*(?:already )?negativ|negative (?:unit )?(?:economics|margin|contribution)|below cost|contribution[\w ]*negativ|margin[\w ]*negativ|losing money (?:per|on each)/;

function problemNegativeMarginDiscount(t: string): boolean {
  return PROBLEM_DEEP_DISCOUNT.test(t) && PROBLEM_NEGATIVE_ECON.test(t);
}

/**
 * Narrowed out-of-model detection: an out-of-model cause holds only when a matched
 * stem is a protected-danger family the committed diagnosis does not subsume, or the
 * problem states a dangerous deep-discount-on-negative-economics owner action.
 */
function outOfModelProtectedDanger(businessProblem: string, diagnosisType: string): boolean {
  const t = businessProblem.toLowerCase();
  if (problemNegativeMarginDiscount(t)) return true; // never subsumed
  const subsumed = DIAGNOSIS_SUBSUMES_DOMAIN[diagnosisType] ?? new Set<string>();
  return PROTECTED_STEM_DOMAINS.some(
    (g) => !subsumed.has(g.domain) && g.stems.some((s) => s.trim().length > 0 && t.includes(s))
  );
}


/**
 * Run the causal challenge. Deterministic and pure.
 */
export function runCausalChallenge(input: CausalChallengeInput): CausalChallengeSignal {
  const reasons: string[] = [];
  if (!input.committed) {
    return {
      committed: false,
      challenged: false,
      outOfModelCauseInProblem: false,
      adverseOffArchetypeEvidence: false,
      reasons: [],
      abstention_hint: null,
    };
  }

  // (1) Does the stated problem reference an out-of-model causal domain? NARROWED to a
  // protected-danger family (liquidity/capex/legal-fraud) the committed diagnosis does
  // not subsume (see outOfModelProtectedDanger). Covered non-dangerous domains and
  // incidental macro/temporal mentions no longer abstain on this arm.
  const outOfModelCauseInProblem = outOfModelProtectedDanger(
    input.businessProblem,
    input.diagnosisType
  );
  if (outOfModelCauseInProblem) {
    reasons.push(
      "stated problem references a cause outside the engine's operational archetypes (market/financial/legal/people/macro/integrity)"
    );
  }

  // (2) Adverse evidence in a dimension the chosen archetype ignores — NARROWED to
  // genuinely high-severity / contradictory off-home signals (see helpers above);
  // secondary/downstream/low-severity off-home adverse evidence no longer abstains.
  const archDims = ARCHETYPE_DIMENSIONS[input.diagnosisType] ?? new Set<string>();
  const adverseOff = input.evidence.some(
    (ev) => !archDims.has(ev.dimension) && isHoldWorthyOffArchetype(ev, input.diagnosisType)
  );
  if (adverseOff) {
    reasons.push(
      "strong adverse evidence sits in a dimension the chosen diagnosis ignored (contradictory off-archetype signal)"
    );
  }

  const challenged = outOfModelCauseInProblem || adverseOff;
  // Adverse contradictory evidence -> CONFLICTING_SIGNALS; otherwise scope mismatch.
  const abstention_hint = challenged
    ? adverseOff
      ? "CONFLICTING_SIGNALS"
      : "OUTSIDE_VALID_SCOPE"
    : null;

  return {
    committed: true,
    challenged,
    outOfModelCauseInProblem,
    adverseOffArchetypeEvidence: adverseOff,
    reasons,
    abstention_hint,
  };
}
