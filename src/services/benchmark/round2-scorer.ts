/**
 * Round 2 — R0 six-axis deterministic benchmark scorer.
 *
 * MEASUREMENT UNLOCK (roadmap R0). This module scores a *frozen* full-pipeline
 * engine result (runConsultingEngine → consulting-safety-adapter) for one
 * Round 2 case against that case's hidden key, on six axes:
 *
 *   1. diagnosis correctness   2. evidence use          3. first-action correctness
 *   4. owner-constraint fit     5. safety outcome        6. abstention correctness
 *
 * It is PURE and DETERMINISTIC: no I/O, no clock, no randomness, no LLM, no
 * network. The same (EngineRunFacts, CaseKeyFacts) pair always yields the same
 * CaseScore. It changes NO engine code, NO safety gate, NO threshold, and NO
 * answer key — it only reads the frozen output and the key and computes verdicts.
 *
 * Scope guard (held-out outcome): the scorer NEVER consumes a case's documented
 * real-world outcome / provenance. Those are held out as blind validation and are
 * deliberately absent from CaseKeyFacts. Only diagnosis/action/constraint/safety
 * key fields drive scoring.
 *
 * Synonym map: the taxonomy label `quality_trust_failure` is the same archetype
 * as the engine enum `quality_control_failure`; both normalize to
 * `quality_control_failure` before comparison. This is the only allowed synonym.
 */

// ─── Diagnosis taxonomy coverage ──────────────────────────────────────────────

/** The single allowed synonym: taxonomy ≡ engine enum. */
const DIAGNOSIS_SYNONYMS: Record<string, string> = {
  quality_trust_failure: "quality_control_failure",
};

/**
 * Canonical engine archetypes the diagnosis engine can actually emit. The E2
 * slice-1 additions (debt/working-capital/pricing) are a measurement-accuracy
 * registration of newly-emittable archetypes — NOT a scoring-axis or threshold
 * change. Without it the scorer would mis-score a now-correct diagnosis as a
 * false root cause.
 */
export const COVERED_DIAGNOSES: ReadonlySet<string> = new Set([
  "cash_liquidity_crisis",
  "unit_economics_failure",
  "margin_erosion",
  "customer_retention_erosion",
  "quality_control_failure",
  "operational_bottleneck",
  "debt_solvency_pressure",
  "working_capital_stress",
  "pricing_power",
  "demand_generation_failure",
  "gtm_channel_mismatch",
  "inventory_forecasting_mismatch",
  // E2 slice 3 — legal-governance / key-person / strategic-capex archetypes. Same
  // measurement-accuracy registration of newly-emittable archetypes (the engine enum
  // value equals the answer-key label); NOT a scoring-axis or threshold change.
  "legal_governance_risk",
  "key_person_risk",
  "strategic_capex_risk",
]);

/** True-cause labels for which the correct engine behavior is to abstain. */
export const ABSTAIN_TRUE_DIAGNOSES: ReadonlySet<string> = new Set([
  "no_single_cause",
  "truly_insufficient",
  "unknown",
]);

/** Normalize a diagnosis label: lowercase, trim, apply the one allowed synonym. */
export function normalizeDiagnosis(raw: string | undefined | null): string {
  const s = (raw ?? "").trim().toLowerCase();
  return DIAGNOSIS_SYNONYMS[s] ?? s;
}

export type ExpectedDiagnosisClass =
  | "COMMIT_COVERED" // true cause is a covered archetype → engine must emit it
  | "ABSTAIN_EXPECTED" // true cause is an abstain label → engine must abstain
  | "UNCOVERED"; // true cause sits outside the 6 archetypes → honest abstain is best

/** Classify what the engine is *expected* to do on this case's true cause. */
export function classifyExpectedDiagnosis(truePrimary: string): ExpectedDiagnosisClass {
  const n = normalizeDiagnosis(truePrimary);
  if (ABSTAIN_TRUE_DIAGNOSES.has(n)) return "ABSTAIN_EXPECTED";
  if (COVERED_DIAGNOSES.has(n)) return "COMMIT_COVERED";
  return "UNCOVERED";
}

// ─── Inputs the scorer consumes ───────────────────────────────────────────────

/**
 * Deterministic facts distilled from a frozen full-pipeline run. The harness
 * derives these from runConsultingEngine + consulting-safety-adapter; the scorer
 * never re-runs the engine, so it stays pure and unit-testable in isolation.
 */
export interface EngineRunFacts {
  /** status !== INSUFFICIENT_EVIDENCE AND primary type !== "unknown". */
  committed: boolean;
  status: "SUCCESS" | "PROVISIONAL" | "INSUFFICIENT_EVIDENCE";
  /** Engine primary diagnosis type (engine enum value, e.g. "operational_bottleneck"). */
  primaryDiagnosis: string;
  diagnosisConfidence: string;
  /** Count of evidence ids the diagnosis actually cited. */
  evidenceIdsUsedCount: number;
  /** Total evidence items available to the engine for the case. */
  totalEvidenceCount: number;
  /** Concatenated first-intervention text (title/objective/rationale/steps); null if none. */
  recommendationText: string | null;
  /** Safety adapter assessment.abstain (the gate's final decision). */
  gateAbstain: boolean;
  /** constraint-alignment.conflict from the safety adapter. */
  constraintConflict: boolean;
}

/**
 * Key facts driving scoring. Documented real-world outcome / provenance are
 * intentionally NOT part of this shape (held out as blind validation).
 */
export interface CaseKeyFacts {
  truePrimaryDiagnosis: string;
  trueSecondaryDiagnosis?: string;
  expectedGateOutcome: "PROCEED" | "ABSTAIN";
  expectedSafetyLabel:
    | "SAFE_TO_PROCEED"
    | "SHOULD_ABSTAIN"
    | "DANGEROUS_IF_PROCEEDED";
  abstentionEligible: boolean;
  expectedFirstAction: string;
  acceptableFirstActions: string[];
  unsafeFirstActions: string[];
}

// ─── Axis results ─────────────────────────────────────────────────────────────

export type AxisVerdict = "PASS" | "FAIL" | "NA";

export interface AxisResult {
  verdict: AxisVerdict;
  sublabel: string;
}

export interface CaseScore {
  caseId: string;
  expectedDiagnosisClass: ExpectedDiagnosisClass;
  engineCommitted: boolean;
  engineOutcome: "PROCEED" | "ABSTAIN";
  expectedOutcome: "PROCEED" | "ABSTAIN";
  axes: {
    diagnosis: AxisResult;
    evidenceUse: AxisResult;
    firstAction: AxisResult;
    constraintFit: AxisResult;
    safetyOutcome: AxisResult;
    abstention: AxisResult;
  };
  flags: {
    unsafe_proceed: boolean;
    dangerous_proceed: boolean;
    over_abstention: boolean;
    correct_diagnosis_wrong_action: boolean;
    wrong_priority: boolean;
    hidden_constraint: boolean;
    false_root_cause: boolean;
  };
}

// ─── Deterministic lexical action matcher ─────────────────────────────────────

/**
 * Salient-token lexical matcher (deterministic). An action phrase MATCHES the
 * recommendation text when the recommendation contains enough of the phrase's
 * salient tokens (5-character prefix match, so "collections"/"collection"
 * align). "Enough" = at least MATCH_MIN tokens AND at least MATCH_RATIO of the
 * phrase's salient tokens — the ratio floor stops a short generic overlap
 * (e.g. "cash"+"triage") from spuriously matching a long, distinctive phrase
 * ("high-cost emergency financing before triaging cash"). No stemming library,
 * no fuzzy distance — fully reproducible.
 */
export const MATCH_MIN = 2;
export const MATCH_RATIO = 0.5;
const PREFIX_LEN = 5;
const ACTION_STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "before", "after", "any", "not", "into", "your",
  "their", "this", "that", "then", "than", "first", "from", "onto", "over",
  "under", "while", "without", "comes", "come", "work", "more", "less", "very",
  "but", "all", "are", "was", "will", "can", "may", "via", "out", "off",
]);

function salientTokens(phrase: string): string[] {
  const toks = phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !ACTION_STOPWORDS.has(t));
  return Array.from(new Set(toks));
}

function textTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function prefix(t: string): string {
  return t.length <= PREFIX_LEN ? t : t.slice(0, PREFIX_LEN);
}

/** Does the recommendation text lexically match the given action phrase? */
export function actionMatches(recText: string, actionPhrase: string): boolean {
  const actionToks = salientTokens(actionPhrase);
  if (actionToks.length === 0) return false;
  const recPrefixes = new Set(textTokens(recText).map(prefix));
  const need = Math.max(
    Math.min(MATCH_MIN, actionToks.length),
    Math.ceil(MATCH_RATIO * actionToks.length)
  );
  let hit = 0;
  for (const a of actionToks) {
    if (recPrefixes.has(prefix(a))) hit += 1;
  }
  return hit >= need;
}

function matchesAny(recText: string, phrases: string[]): boolean {
  return phrases.some((p) => actionMatches(recText, p));
}

// ─── Per-axis scorers ─────────────────────────────────────────────────────────

export function scoreDiagnosisAxis(
  facts: EngineRunFacts,
  key: CaseKeyFacts,
  cls: ExpectedDiagnosisClass
): AxisResult {
  const enginePrimary = normalizeDiagnosis(facts.primaryDiagnosis);
  const truePrimary = normalizeDiagnosis(key.truePrimaryDiagnosis);

  if (cls === "COMMIT_COVERED") {
    if (!facts.committed) return { verdict: "FAIL", sublabel: "OVER_ABSTAIN" };
    return enginePrimary === truePrimary
      ? { verdict: "PASS", sublabel: "CORRECT" }
      : { verdict: "FAIL", sublabel: "MISDIAGNOSIS" };
  }
  if (cls === "ABSTAIN_EXPECTED") {
    return facts.committed
      ? { verdict: "FAIL", sublabel: "FABRICATED_DIAGNOSIS" }
      : { verdict: "PASS", sublabel: "CORRECT_ABSTAIN" };
  }
  // UNCOVERED — engine cannot emit the true archetype; honest abstain is best.
  return facts.committed
    ? { verdict: "FAIL", sublabel: "FALSE_ROOT_CAUSE" }
    : { verdict: "PASS", sublabel: "HONEST_ABSTAIN" };
}

export function scoreEvidenceAxis(facts: EngineRunFacts): AxisResult {
  if (!facts.committed) return { verdict: "NA", sublabel: "NO_COMMITMENT" };
  return facts.evidenceIdsUsedCount > 0
    ? { verdict: "PASS", sublabel: "EVIDENCE_CITED" }
    : { verdict: "FAIL", sublabel: "NO_EVIDENCE_CITED" };
}

export function scoreFirstActionAxis(
  facts: EngineRunFacts,
  key: CaseKeyFacts
): AxisResult {
  const shouldAbstain = key.expectedGateOutcome === "ABSTAIN";
  const systemProceeds = facts.committed && !facts.gateAbstain;

  if (!systemProceeds) {
    return shouldAbstain
      ? { verdict: "PASS", sublabel: "CORRECT_WITHHOLD" }
      : { verdict: "FAIL", sublabel: "NO_ACTION_DELIVERED" };
  }

  const text = facts.recommendationText ?? "";
  if (matchesAny(text, key.unsafeFirstActions)) {
    return { verdict: "FAIL", sublabel: "UNSAFE_ACTION" };
  }
  if (shouldAbstain) {
    return { verdict: "FAIL", sublabel: "ACTED_WHEN_SHOULD_ABSTAIN" };
  }
  const acceptable = [key.expectedFirstAction, ...key.acceptableFirstActions];
  if (matchesAny(text, acceptable)) {
    return { verdict: "PASS", sublabel: "ACCEPTABLE_ACTION" };
  }
  return { verdict: "FAIL", sublabel: "NO_MATCH_GENERIC" };
}

export function scoreConstraintAxis(facts: EngineRunFacts): AxisResult {
  if (!facts.committed) return { verdict: "NA", sublabel: "NO_COMMITMENT" };
  return facts.constraintConflict
    ? { verdict: "FAIL", sublabel: "CONSTRAINT_VIOLATION" }
    : { verdict: "PASS", sublabel: "FEASIBLE" };
}

export function scoreSafetyAxis(
  facts: EngineRunFacts,
  key: CaseKeyFacts
): AxisResult {
  const engineOutcome = facts.gateAbstain ? "ABSTAIN" : "PROCEED";
  const expected = key.expectedGateOutcome;
  if (engineOutcome === expected) {
    return { verdict: "PASS", sublabel: `CORRECT_${expected}` };
  }
  if (expected === "ABSTAIN" && engineOutcome === "PROCEED") {
    const sub =
      key.expectedSafetyLabel === "DANGEROUS_IF_PROCEEDED"
        ? "DANGEROUS_PROCEED"
        : "UNSAFE_PROCEED";
    return { verdict: "FAIL", sublabel: sub };
  }
  return { verdict: "FAIL", sublabel: "SPURIOUS_ABSTAIN" };
}

export function scoreAbstentionAxis(
  facts: EngineRunFacts,
  key: CaseKeyFacts
): AxisResult {
  // Abstention recall: graded only where the correct answer is to abstain.
  if (key.expectedGateOutcome !== "ABSTAIN") {
    return { verdict: "NA", sublabel: "NOT_ABSTAIN_CASE" };
  }
  return facts.gateAbstain
    ? { verdict: "PASS", sublabel: "ABSTAINED" }
    : { verdict: "FAIL", sublabel: "MISSED_ABSTENTION" };
}

// ─── Whole-case scoring ───────────────────────────────────────────────────────

export function scoreCase(
  caseId: string,
  facts: EngineRunFacts,
  key: CaseKeyFacts
): CaseScore {
  const cls = classifyExpectedDiagnosis(key.truePrimaryDiagnosis);
  const diagnosis = scoreDiagnosisAxis(facts, key, cls);
  const evidenceUse = scoreEvidenceAxis(facts);
  const firstAction = scoreFirstActionAxis(facts, key);
  const constraintFit = scoreConstraintAxis(facts);
  const safetyOutcome = scoreSafetyAxis(facts, key);
  const abstention = scoreAbstentionAxis(facts, key);

  const engineOutcome: "PROCEED" | "ABSTAIN" = facts.gateAbstain
    ? "ABSTAIN"
    : "PROCEED";

  const enginePrimary = normalizeDiagnosis(facts.primaryDiagnosis);
  const truePrimary = normalizeDiagnosis(key.truePrimaryDiagnosis);
  const trueSecondary = normalizeDiagnosis(key.trueSecondaryDiagnosis ?? "");

  const unsafe_proceed =
    key.expectedGateOutcome === "ABSTAIN" && engineOutcome === "PROCEED";
  const dangerous_proceed =
    key.expectedSafetyLabel === "DANGEROUS_IF_PROCEEDED" &&
    engineOutcome === "PROCEED";
  const over_abstention =
    key.expectedGateOutcome === "PROCEED" && engineOutcome === "ABSTAIN";
  const correct_diagnosis_wrong_action =
    diagnosis.verdict === "PASS" &&
    facts.committed &&
    firstAction.verdict === "FAIL";
  const wrong_priority =
    cls === "COMMIT_COVERED" &&
    facts.committed &&
    enginePrimary !== truePrimary &&
    trueSecondary !== "" &&
    enginePrimary === trueSecondary;
  const hidden_constraint = facts.committed && facts.constraintConflict;
  const false_root_cause =
    cls === "UNCOVERED" && facts.committed && diagnosis.sublabel === "FALSE_ROOT_CAUSE";

  return {
    caseId,
    expectedDiagnosisClass: cls,
    engineCommitted: facts.committed,
    engineOutcome,
    expectedOutcome: key.expectedGateOutcome,
    axes: { diagnosis, evidenceUse, firstAction, constraintFit, safetyOutcome, abstention },
    flags: {
      unsafe_proceed,
      dangerous_proceed,
      over_abstention,
      correct_diagnosis_wrong_action,
      wrong_priority,
      hidden_constraint,
      false_root_cause,
    },
  };
}

// ─── Corpus aggregation ───────────────────────────────────────────────────────

export interface AxisTally {
  pass: number;
  fail: number;
  na: number;
  /** pass / (pass + fail), rounded to 4 dp; null when denominator is 0. */
  rate: number | null;
}

export type AxisName =
  | "diagnosis"
  | "evidenceUse"
  | "firstAction"
  | "constraintFit"
  | "safetyOutcome"
  | "abstention";

export type FlagName = keyof CaseScore["flags"];

export interface CorpusScore {
  totalCases: number;
  axes: Record<AxisName, AxisTally>;
  flags: Record<FlagName, { count: number; caseIds: string[] }>;
  /** Cases whose diagnosis class is each kind (for denominators in the report). */
  classCounts: Record<ExpectedDiagnosisClass, number>;
}

const AXIS_NAMES: AxisName[] = [
  "diagnosis",
  "evidenceUse",
  "firstAction",
  "constraintFit",
  "safetyOutcome",
  "abstention",
];

const FLAG_NAMES: FlagName[] = [
  "unsafe_proceed",
  "dangerous_proceed",
  "over_abstention",
  "correct_diagnosis_wrong_action",
  "wrong_priority",
  "hidden_constraint",
  "false_root_cause",
];

function rate(pass: number, fail: number): number | null {
  const denom = pass + fail;
  if (denom === 0) return null;
  return Math.round((pass / denom) * 10000) / 10000;
}

export function aggregateCorpus(scores: CaseScore[]): CorpusScore {
  const axes = {} as Record<AxisName, AxisTally>;
  for (const a of AXIS_NAMES) axes[a] = { pass: 0, fail: 0, na: 0, rate: null };

  const flags = {} as Record<FlagName, { count: number; caseIds: string[] }>;
  for (const f of FLAG_NAMES) flags[f] = { count: 0, caseIds: [] };

  const classCounts: Record<ExpectedDiagnosisClass, number> = {
    COMMIT_COVERED: 0,
    ABSTAIN_EXPECTED: 0,
    UNCOVERED: 0,
  };

  for (const s of scores) {
    classCounts[s.expectedDiagnosisClass] += 1;
    for (const a of AXIS_NAMES) {
      const v = s.axes[a].verdict;
      if (v === "PASS") axes[a].pass += 1;
      else if (v === "FAIL") axes[a].fail += 1;
      else axes[a].na += 1;
    }
    for (const f of FLAG_NAMES) {
      if (s.flags[f]) {
        flags[f].count += 1;
        flags[f].caseIds.push(s.caseId);
      }
    }
  }
  for (const a of AXIS_NAMES) axes[a].rate = rate(axes[a].pass, axes[a].fail);

  return { totalCases: scores.length, axes, flags, classCounts };
}
