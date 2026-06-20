/**
 * Deterministic scoring contract for OpsIQ SMB case outputs.
 * Evaluates text output against fixture expectations using keyword matching.
 * No external calls. No LLM. Pure string matching against explicit criteria.
 */
import type { SmbFixture } from "./fixtureSchema";

export interface DimensionResult {
  passed: boolean;
  score: number;
  reasons: string[];
  matchedTerms: string[];
  missingTerms: string[];
}

export interface CaseScore {
  case_id: string;
  totalScore: number;
  passed: boolean;
  dimensionResults: {
    ROOT_CAUSE_ALIGNMENT: DimensionResult;
    MISSING_INPUT_REQUESTS: DimensionResult;
    FIRST_ACTION_QUALITY: DimensionResult;
    BAD_RECOMMENDATION_AVOIDANCE: DimensionResult;
  };
  failedDimensions: string[];
  criticalFailures: string[];
}

// Weights must sum to 1.0
const WEIGHTS = {
  ROOT_CAUSE_ALIGNMENT: 0.40,
  MISSING_INPUT_REQUESTS: 0.20,
  FIRST_ACTION_QUALITY: 0.20,
  BAD_RECOMMENDATION_AVOIDANCE: 0.20,
} as const;

const PASS_THRESHOLD = 0.70;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const normHaystack = normalize(haystack);
  const normPhrase = normalize(phrase);
  // Split phrase into tokens; require all tokens to appear (allows word-order flexibility)
  const tokens = normPhrase.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return normHaystack.includes(normPhrase);
  // For short phrases (≤3 tokens) require exact contiguous match
  if (tokens.length <= 3) return normHaystack.includes(normPhrase);
  // For longer phrases require that at least 70% of tokens appear
  const matchCount = tokens.filter((t) => normHaystack.includes(t)).length;
  return matchCount / tokens.length >= 0.7;
}

function scoreRootCauseAlignment(output: string, fixture: SmbFixture): DimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const allTerms = [
    ...fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify,
    fixture.expected_opsiq_diagnosis.primary_root_cause.replace(/_/g, " "),
    ...fixture.expected_opsiq_diagnosis.secondary_causes.slice(0, 2).map((c) =>
      c.replace(/_/g, " ")
    ),
  ];

  for (const term of allTerms) {
    if (containsPhrase(output, term)) {
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  // Require at least 60% of must_identify terms
  const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;
  const mustIdentifyMatched = mustIdentify.filter((t) => containsPhrase(output, t));
  const mustIdentifyRatio = mustIdentifyMatched.length / mustIdentify.length;

  const score = Math.min(1, mustIdentifyRatio * (matchedTerms.length / allTerms.length + 0.5));
  const passed = mustIdentifyRatio >= 0.6;

  if (!passed) {
    reasons.push(
      `Only ${mustIdentifyMatched.length}/${mustIdentify.length} must_identify terms matched (need ≥60%)`
    );
  } else {
    reasons.push(`${mustIdentifyMatched.length}/${mustIdentify.length} must_identify terms matched`);
  }

  return { passed, score: Math.round(score * 100) / 100, reasons, matchedTerms, missingTerms };
}

function scoreMissingInputRequests(output: string, fixture: SmbFixture): DimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const requestTerms = fixture.scenario.missing_inputs_opsiq_should_request;

  // Extract key signals from each missing-input description (first 3-5 words as anchor)
  for (const req of requestTerms) {
    // Take meaningful keywords from the request description
    const words = normalize(req).split(" ").filter((w) => w.length > 4);
    const anchor = words.slice(0, 3).join(" ");
    if (anchor && containsPhrase(output, anchor)) {
      matchedTerms.push(req);
    } else {
      missingTerms.push(req);
    }
  }

  const ratio = matchedTerms.length / requestTerms.length;
  // At least 1 missing input must be requested; each additional improves score
  const passed = matchedTerms.length >= 1;
  const score = Math.round(ratio * 100) / 100;

  if (!passed) {
    reasons.push("Output requests no missing inputs — score reduced");
  } else {
    reasons.push(`${matchedTerms.length}/${requestTerms.length} missing-input categories addressed`);
  }

  return { passed, score, reasons, matchedTerms, missingTerms };
}

function scoreFirstActionQuality(output: string, fixture: SmbFixture): DimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const expectedAction = fixture.expected_opsiq_diagnosis.expected_first_action;
  // Extract key verb+noun phrases from expected action
  const actionWords = normalize(expectedAction)
    .split(" ")
    .filter((w) => w.length > 4);
  const keyTokens = actionWords.slice(0, 6);

  const matched = keyTokens.filter((t) => normalize(output).includes(t));
  const ratio = matched.length / keyTokens.length;

  if (ratio >= 0.5) {
    matchedTerms.push(...matched);
    reasons.push(`First action aligns: ${matched.length}/${keyTokens.length} key tokens matched`);
  } else {
    missingTerms.push(...keyTokens.filter((t) => !matched.includes(t)));
    reasons.push(
      `First action weak: only ${matched.length}/${keyTokens.length} key tokens matched`
    );
  }

  const passed = ratio >= 0.4;
  const score = Math.round(ratio * 100) / 100;

  return { passed, score, reasons, matchedTerms, missingTerms };
}

function scoreBadRecommendationAvoidance(output: string, fixture: SmbFixture): DimensionResult {
  const reasons: string[] = [];
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  const badRecs = fixture.expected_opsiq_diagnosis.bad_recommendations_to_flag;
  const flagged: string[] = [];

  for (const bad of badRecs) {
    if (containsPhrase(output, bad)) {
      flagged.push(bad);
    }
  }

  if (flagged.length > 0) {
    matchedTerms.push(...flagged);
    reasons.push(`CRITICAL: Output contains flagged bad recommendations: ${flagged.join("; ")}`);
    return {
      passed: false,
      score: 0,
      reasons,
      matchedTerms,
      missingTerms,
    };
  }

  reasons.push("No bad recommendations detected");
  return { passed: true, score: 1, reasons, matchedTerms: [], missingTerms: [] };
}

export function scoreOutput(output: string, fixture: SmbFixture): CaseScore {
  const rca = scoreRootCauseAlignment(output, fixture);
  const mir = scoreMissingInputRequests(output, fixture);
  const faq = scoreFirstActionQuality(output, fixture);
  const bra = scoreBadRecommendationAvoidance(output, fixture);

  const totalScore =
    rca.score * WEIGHTS.ROOT_CAUSE_ALIGNMENT +
    mir.score * WEIGHTS.MISSING_INPUT_REQUESTS +
    faq.score * WEIGHTS.FIRST_ACTION_QUALITY +
    bra.score * WEIGHTS.BAD_RECOMMENDATION_AVOIDANCE;

  const roundedTotal = Math.round(totalScore * 100) / 100;

  const criticalFailures: string[] = [];
  if (!rca.passed) criticalFailures.push("ROOT_CAUSE_ALIGNMENT");
  if (!bra.passed) criticalFailures.push("BAD_RECOMMENDATION_AVOIDANCE");

  const failedDimensions: string[] = [];
  if (!rca.passed) failedDimensions.push("ROOT_CAUSE_ALIGNMENT");
  if (!mir.passed) failedDimensions.push("MISSING_INPUT_REQUESTS");
  if (!faq.passed) failedDimensions.push("FIRST_ACTION_QUALITY");
  if (!bra.passed) failedDimensions.push("BAD_RECOMMENDATION_AVOIDANCE");

  // Must pass both critical dimensions and meet score threshold
  const passed =
    rca.passed &&
    bra.passed &&
    roundedTotal >= PASS_THRESHOLD;

  return {
    case_id: fixture.case_id,
    totalScore: roundedTotal,
    passed,
    dimensionResults: {
      ROOT_CAUSE_ALIGNMENT: rca,
      MISSING_INPUT_REQUESTS: mir,
      FIRST_ACTION_QUALITY: faq,
      BAD_RECOMMENDATION_AVOIDANCE: bra,
    },
    failedDimensions,
    criticalFailures,
  };
}
