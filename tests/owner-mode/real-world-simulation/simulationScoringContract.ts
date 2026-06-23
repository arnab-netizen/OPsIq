/**
 * Scoring contract for OpsIQ Real-World Simulation Program.
 *
 * 8 scoring dimensions. Evaluates text output against sealed fixture expectations.
 * No external calls. No LLM. No engine execution required at this layer.
 *
 * Dimensions and weights:
 *   rootCause               (30%) — must_identify coverage
 *   prioritization          (10%) — secondary causes and sequencing
 *   firstAction             (15%) — expected_first_action token overlap
 *   missingInputRequests    (15%) — missing_inputs_opsiq_should_request coverage
 *   badRecommendationAvoidance (15%) — zero-tolerance on flagged bad recs
 *   evidenceDiscipline      (10%) — no confident diagnosis without requesting key evidence
 *   reassessmentQuality      (5%) — output acknowledges limits and conditions
 *   learningLoopEligibility  (0%) — metadata flag; does not affect score; affects reporting
 *
 * Pass rule:
 *   totalScore >= 0.70
 *   AND badRecommendationAvoidance.passed
 *   AND evidenceDiscipline.passed
 *   AND criticalFailures.length === 0
 */
import type { SimulationFixture } from "./simulationFixtureSchema";

export interface SimulationDimensionResult {
  passed: boolean;
  score: number;
  reasons: string[];
  matchedTerms: string[];
  missingTerms: string[];
}

export interface SimulationCaseScore {
  case_id: string;
  totalScore: number;
  passed: boolean;
  criticalFailures: string[];
  failedDimensions: string[];
  dimensionResults: {
    rootCause: SimulationDimensionResult;
    prioritization: SimulationDimensionResult;
    firstAction: SimulationDimensionResult;
    missingInputRequests: SimulationDimensionResult;
    badRecommendationAvoidance: SimulationDimensionResult;
    evidenceDiscipline: SimulationDimensionResult;
    reassessmentQuality: SimulationDimensionResult;
    learningLoopEligibility: SimulationDimensionResult;
  };
}

/** TT-2 adversarial resistance result appended to score. */
export interface AdversarialResistanceResult {
  passed: boolean;
  reason: string;
}

/** TT-5 trap resistance result appended to score. */
export interface TrapResistanceResult {
  passed: boolean;
  reason: string;
  trapPhrase: string;
}

const WEIGHTS = {
  rootCause: 0.30,
  prioritization: 0.10,
  firstAction: 0.15,
  missingInputRequests: 0.15,
  badRecommendationAvoidance: 0.15,
  evidenceDiscipline: 0.10,
  reassessmentQuality: 0.05,
  // learningLoopEligibility: 0 — no weight; metadata only
} as const;

const PASS_THRESHOLD = 0.70;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const normHaystack = normalize(haystack);
  const normPhrase = normalize(phrase);
  const tokens = normPhrase.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return normHaystack.includes(normPhrase);
  if (tokens.length <= 3) return normHaystack.includes(normPhrase);
  const matchCount = tokens.filter((t) => normHaystack.includes(t)).length;
  return matchCount / tokens.length >= 0.7;
}

// ── Dimension scorers ────────────────────────────────────────────────────────

function scoreRootCause(output: string, fixture: SimulationFixture): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const mustIdentify = fixture.sealed_expected_output.scoring_rubric.must_identify;
  for (const term of mustIdentify) {
    if (containsPhrase(output, term)) {
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  const ratio = matchedTerms.length / mustIdentify.length;
  const passed = ratio >= 0.6;
  const score = Math.round(Math.min(1, ratio) * 100) / 100;

  if (!passed) {
    reasons.push(
      `Only ${matchedTerms.length}/${mustIdentify.length} must_identify terms matched (need ≥60%)`
    );
  } else {
    reasons.push(`${matchedTerms.length}/${mustIdentify.length} must_identify terms matched`);
  }

  return { passed, score, reasons, matchedTerms, missingTerms };
}

function scorePrioritization(output: string, fixture: SimulationFixture): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const secondary = fixture.sealed_expected_output.secondary_causes;
  for (const cause of secondary) {
    const readable = cause.replace(/_/g, " ");
    if (containsPhrase(output, readable)) {
      matchedTerms.push(readable);
    } else {
      missingTerms.push(readable);
    }
  }

  const ratio = matchedTerms.length / secondary.length;
  const passed = ratio >= 0.5;
  const score = Math.round(ratio * 100) / 100;

  reasons.push(
    `${matchedTerms.length}/${secondary.length} secondary causes addressed`
  );

  return { passed, score, reasons, matchedTerms, missingTerms };
}

function scoreFirstAction(output: string, fixture: SimulationFixture): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const expectedAction = fixture.sealed_expected_output.expected_first_action;
  const actionWords = normalize(expectedAction).split(" ").filter((w) => w.length > 4);
  const keyTokens = actionWords.slice(0, 6);

  const matched = keyTokens.filter((t) => normalize(output).includes(t));
  const ratio = matched.length / Math.max(keyTokens.length, 1);

  if (ratio >= 0.5) {
    matchedTerms.push(...matched);
    reasons.push(`First action aligns: ${matched.length}/${keyTokens.length} key tokens matched`);
  } else {
    missingTerms.push(...keyTokens.filter((t) => !matched.includes(t)));
    reasons.push(`First action weak: ${matched.length}/${keyTokens.length} key tokens matched`);
  }

  const passed = ratio >= 0.4;
  const score = Math.round(ratio * 100) / 100;

  return { passed, score, reasons, matchedTerms, missingTerms };
}

function scoreMissingInputRequests(
  output: string,
  fixture: SimulationFixture
): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const requestTerms = fixture.input_packet.missing_inputs_opsiq_should_request;
  for (const req of requestTerms) {
    const words = normalize(req).split(" ").filter((w) => w.length > 4);
    const anchor = words.slice(0, 3).join(" ");
    if (anchor && containsPhrase(output, anchor)) {
      matchedTerms.push(req);
    } else {
      missingTerms.push(req);
    }
  }

  const ratio = matchedTerms.length / requestTerms.length;
  const passed = matchedTerms.length >= 1;
  const score = Math.round(ratio * 100) / 100;

  if (!passed) {
    reasons.push("Output requests no missing inputs");
  } else {
    reasons.push(`${matchedTerms.length}/${requestTerms.length} missing-input categories addressed`);
  }

  return { passed, score, reasons, matchedTerms, missingTerms };
}

function scoreBadRecommendationAvoidance(
  output: string,
  fixture: SimulationFixture
): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const badRecs = fixture.sealed_expected_output.bad_recommendations_to_flag;
  const flagged: string[] = [];
  for (const bad of badRecs) {
    if (containsPhrase(output, bad)) {
      flagged.push(bad);
    }
  }

  if (flagged.length > 0) {
    matchedTerms.push(...flagged);
    reasons.push(`CRITICAL: Bad recommendations present: ${flagged.join("; ")}`);
    return { passed: false, score: 0, reasons, matchedTerms, missingTerms };
  }

  reasons.push("No bad recommendations detected");
  return { passed: true, score: 1, reasons, matchedTerms: [], missingTerms: [] };
}

/**
 * Evidence discipline: output must not be confident without requesting evidence.
 * Heuristic: if output contains ≥1 missing-input request, discipline is present.
 * If output makes assertions without any conditional language or evidence requests,
 * penalise the dimension.
 */
function scoreEvidenceDiscipline(
  output: string,
  fixture: SimulationFixture
): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const normOutput = normalize(output);

  // Evidence request signals
  const evidenceSignals = [
    "need to see", "require", "should provide", "missing", "without knowing",
    "before diagnosing", "request", "what is your", "can you share",
    "i would need", "we need", "first step is to obtain", "obtain",
  ];
  const hasEvidenceRequest = evidenceSignals.some((s) => normOutput.includes(s));

  // Overconfident signals — confident conclusions without conditionals
  const confidentSignals = [
    "the problem is definitely", "you must immediately", "the root cause is clearly",
    "obviously the issue is", "without doubt",
  ];
  const isOverconfident = confidentSignals.some((s) => normOutput.includes(s));

  // Check at least 1 missing input from the fixture is addressed
  const requestTerms = fixture.input_packet.missing_inputs_opsiq_should_request;
  const anyInputRequested = requestTerms.some((req) => {
    const words = normalize(req).split(" ").filter((w) => w.length > 4);
    const anchor = words.slice(0, 3).join(" ");
    return anchor && containsPhrase(output, anchor);
  });

  const passed = (hasEvidenceRequest || anyInputRequested) && !isOverconfident;
  const score = passed ? 1 : 0;

  if (isOverconfident) {
    reasons.push("CRITICAL: Output contains overconfident language without evidence qualification");
    missingTerms.push("evidence qualification");
  } else if (!hasEvidenceRequest && !anyInputRequested) {
    reasons.push("Output makes no evidence requests — confidence without evidence qualification");
    missingTerms.push("missing input requests");
  } else {
    reasons.push("Output demonstrates appropriate evidence discipline");
    matchedTerms.push("evidence request present");
  }

  return { passed, score, reasons, matchedTerms, missingTerms };
}

/**
 * Reassessment quality: output acknowledges that findings may change with new evidence.
 * Light heuristic — signals like "if", "once", "pending", "subject to", "assuming",
 * "this analysis assumes" indicate conditional framing.
 */
function scoreReassessmentQuality(output: string): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const normOutput = normalize(output);
  const conditionalSignals = [
    "if ", "once ", "pending ", "assuming ", "subject to", "this may change",
    "provided that", "once we have", "after reviewing", "depending on",
  ];
  const hasConditional = conditionalSignals.some((s) => normOutput.includes(s));

  const passed = hasConditional;
  const score = passed ? 1 : 0.5; // Partial credit — not a critical dimension

  if (hasConditional) {
    reasons.push("Output includes conditional framing appropriate for preliminary diagnosis");
    matchedTerms.push("conditional language");
  } else {
    reasons.push("Output lacks conditional framing — reassessment triggers not acknowledged");
    missingTerms.push("conditional framing");
  }

  return { passed, score, reasons, matchedTerms, missingTerms };
}

/**
 * Learning-loop eligibility: metadata flag — does not affect score.
 * A case is eligible for learning-loop feedback if it fails on rootCause
 * and the failure type is ENGINE_GAP or INPUT_MODEL_GAP (not SCORING_LIMITATION/HONEST_CEILING).
 * At scoring time, this is approximated by: rootCause failed AND score > 0 (i.e., some terms matched).
 * Full classification requires human review.
 */
function scoreLearningLoopEligibility(
  rootCauseResult: SimulationDimensionResult
): SimulationDimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  // Eligible if: rootCause failed but some terms were matched (potential INPUT_MODEL_GAP)
  // Not eligible if: rootCause failed with 0 matches (potential ENGINE_GAP — different process)
  const provisionallyEligible =
    !rootCauseResult.passed && rootCauseResult.matchedTerms.length > 0;
  const provisionallyEngineGap =
    !rootCauseResult.passed && rootCauseResult.matchedTerms.length === 0;

  if (rootCauseResult.passed) {
    reasons.push("Case passed — learning loop not applicable");
  } else if (provisionallyEligible) {
    reasons.push(
      "Provisionally eligible for INPUT_MODEL_GAP learning loop — human classification required"
    );
    matchedTerms.push("provisional_input_model_gap");
  } else if (provisionallyEngineGap) {
    reasons.push(
      "Provisionally ENGINE_GAP — learning loop requires engine work, not vocabulary addition"
    );
    missingTerms.push("engine_gap_requires_separate_process");
  }

  // score: 1 = eligible, 0 = not applicable or engine gap; does not affect totalScore
  const score = provisionallyEligible ? 1 : 0;
  const passed = true; // Never a failure criterion — metadata only

  return { passed, score, reasons, matchedTerms, missingTerms };
}

// ── Main scorer ──────────────────────────────────────────────────────────────

export function scoreSimulationOutput(
  output: string,
  fixture: SimulationFixture
): SimulationCaseScore {
  const rootCause = scoreRootCause(output, fixture);
  const prioritization = scorePrioritization(output, fixture);
  const firstAction = scoreFirstAction(output, fixture);
  const missingInputRequests = scoreMissingInputRequests(output, fixture);
  const badRecommendationAvoidance = scoreBadRecommendationAvoidance(output, fixture);
  const evidenceDiscipline = scoreEvidenceDiscipline(output, fixture);
  const reassessmentQuality = scoreReassessmentQuality(output);
  const learningLoopEligibility = scoreLearningLoopEligibility(rootCause);

  const totalScore =
    rootCause.score * WEIGHTS.rootCause +
    prioritization.score * WEIGHTS.prioritization +
    firstAction.score * WEIGHTS.firstAction +
    missingInputRequests.score * WEIGHTS.missingInputRequests +
    badRecommendationAvoidance.score * WEIGHTS.badRecommendationAvoidance +
    evidenceDiscipline.score * WEIGHTS.evidenceDiscipline +
    reassessmentQuality.score * WEIGHTS.reassessmentQuality;

  const roundedTotal = Math.round(totalScore * 100) / 100;

  const criticalFailures: string[] = [];
  if (!badRecommendationAvoidance.passed) criticalFailures.push("badRecommendationAvoidance");
  if (!evidenceDiscipline.passed) criticalFailures.push("evidenceDiscipline");
  if (!rootCause.passed) criticalFailures.push("rootCause");

  const failedDimensions: string[] = [];
  if (!rootCause.passed) failedDimensions.push("rootCause");
  if (!prioritization.passed) failedDimensions.push("prioritization");
  if (!firstAction.passed) failedDimensions.push("firstAction");
  if (!missingInputRequests.passed) failedDimensions.push("missingInputRequests");
  if (!badRecommendationAvoidance.passed) failedDimensions.push("badRecommendationAvoidance");
  if (!evidenceDiscipline.passed) failedDimensions.push("evidenceDiscipline");

  const passed =
    badRecommendationAvoidance.passed &&
    evidenceDiscipline.passed &&
    rootCause.passed &&
    roundedTotal >= PASS_THRESHOLD;

  return {
    case_id: fixture.case_id,
    totalScore: roundedTotal,
    passed,
    criticalFailures,
    failedDimensions,
    dimensionResults: {
      rootCause,
      prioritization,
      firstAction,
      missingInputRequests,
      badRecommendationAvoidance,
      evidenceDiscipline,
      reassessmentQuality,
      learningLoopEligibility,
    },
  };
}

/**
 * Check adversarial resistance (TT-2 only).
 * Returns failed if output contains the expected_misclassification phrase.
 */
export function checkAdversarialResistance(
  output: string,
  expectedMisclassification: string
): AdversarialResistanceResult {
  if (containsPhrase(output, expectedMisclassification)) {
    return {
      passed: false,
      reason: `Output contains the expected misclassification: "${expectedMisclassification}"`,
    };
  }
  return {
    passed: true,
    reason: "Output does not contain the expected misclassification",
  };
}

/**
 * Check trap resistance (TT-5 only).
 * Returns failed if output attributes causality to the primary_trap phrase.
 */
export function checkTrapResistance(
  output: string,
  primaryTrap: string
): TrapResistanceResult {
  if (containsPhrase(output, primaryTrap)) {
    return {
      passed: false,
      reason: `Output attributes causality to the signal trap: "${primaryTrap}"`,
      trapPhrase: primaryTrap,
    };
  }
  return {
    passed: true,
    reason: "Output does not attribute causality to the signal trap",
    trapPhrase: primaryTrap,
  };
}
