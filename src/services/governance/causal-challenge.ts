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

  // (1) Does the stated problem reference an out-of-model causal domain?
  const outOfModelCauseInProblem = hasStem(input.businessProblem, OUT_OF_MODEL_CAUSE_STEMS);
  if (outOfModelCauseInProblem) {
    reasons.push(
      "stated problem references a cause outside the engine's operational archetypes (market/financial/legal/people/macro/integrity)"
    );
  }

  // (2) Adverse evidence in a dimension the chosen archetype ignores.
  const archDims = ARCHETYPE_DIMENSIONS[input.diagnosisType] ?? new Set<string>();
  const adverseOff = input.evidence.some(
    (ev) => !archDims.has(ev.dimension) && isAdverseFinding(ev)
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
