/**
 * Schema validation for OpsIQ Independent Holdout Validation fixtures.
 * Mirrors simulationFixtureSchema.ts but accepts HOL-NN-NNN case IDs
 * and HC-NN category codes.
 *
 * Fails closed — any missing or malformed field throws a descriptive error.
 * Leakage check: sealed_expected_output phrases must not appear verbatim in input_packet.
 */

export const HOLDOUT_CATEGORIES = [
  "HC-01", "HC-02", "HC-03", "HC-04", "HC-05",
  "HC-06", "HC-07", "HC-08", "HC-09", "HC-10",
] as const;

export type HoldoutCategory = (typeof HOLDOUT_CATEGORIES)[number];

export const HOLDOUT_TEST_TYPES = ["TT-1", "TT-2", "TT-3", "TT-4", "TT-5"] as const;

export type HoldoutTestType = (typeof HOLDOUT_TEST_TYPES)[number];

// ── Core sub-interfaces (identical to SimulationFixture) ─────────────────────

export interface HoldoutInputPacket {
  business_description: string;
  facts_known_to_owner: Record<string, unknown>;
  symptoms: string[];
  misleading_signals: string[];
  missing_inputs_opsiq_should_request: string[];
}

export interface HoldoutScoringRubric {
  must_identify: string[];
  must_not_claim: string[];
  ideal_depth: string[];
  required_missing_input_requests?: string[];
  required_conflict_flags?: string[];
  disqualified_diagnoses?: string[];
}

export interface HoldoutSealedExpectedOutput {
  primary_root_cause: string;
  secondary_causes: string[];
  expected_first_action: string;
  bad_recommendations_to_flag: string[];
  scoring_rubric: HoldoutScoringRubric;
}

export interface HoldoutLeakageControls {
  author_read_benchmark_fixtures: false;
  author_read_composer_source: false;
  leakage_check_passed: boolean;
}

export interface HoldoutMeta {
  author_id: string;
  construction_date: string;
  industry: string;
  intervention_mode: "diagnostic" | "turnaround" | "optimisation" | "monitoring";
  business_condition_hypothesis: string;
  consulting_lifecycle_stage: string;
}

export interface HoldoutFixture {
  /** Pattern: /^HOL-\d{2}-\d{3}$/ */
  case_id: string;
  title: string;
  category: HoldoutCategory;
  test_type: HoldoutTestType;
  segment: string;
  business_context: string;
  input_packet: HoldoutInputPacket;
  sealed_expected_output: HoldoutSealedExpectedOutput;
  source_basis: string[];
  leakage_controls: HoldoutLeakageControls;
  holdout_meta: HoldoutMeta;
}

// ── Validation helpers ───────────────────────────────────────────────────────

const CASE_ID_PATTERN = /^HOL-\d{2}-\d{3}$/;

function requireNonBlankString(val: unknown, path: string): string {
  if (typeof val !== "string" || val.trim() === "") {
    throw new Error(`${path} must be a non-blank string`);
  }
  return val;
}

function requireNonEmptyStringArray(val: unknown, path: string): string[] {
  if (!Array.isArray(val) || val.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== "string" || (val[i] as string).trim() === "") {
      throw new Error(`${path}[${i}] must be a non-blank string`);
    }
  }
  return val as string[];
}

function requireStringArrayBounded(
  val: unknown,
  path: string,
  min: number,
  max: number
): string[] {
  const arr = requireNonEmptyStringArray(val, path);
  if (arr.length < min || arr.length > max) {
    throw new Error(`${path} must have ${min}–${max} items, got ${arr.length}`);
  }
  return arr;
}

function requireObject(val: unknown, path: string): Record<string, unknown> {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    throw new Error(`${path} must be a non-null object`);
  }
  return val as Record<string, unknown>;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function checkLeakage(
  inputPacket: HoldoutInputPacket,
  sealedOutput: HoldoutSealedExpectedOutput,
  caseId: string
): void {
  const inputTexts = [
    inputPacket.business_description,
    ...inputPacket.symptoms,
    ...inputPacket.misleading_signals,
    ...inputPacket.missing_inputs_opsiq_should_request,
    ...Object.values(inputPacket.facts_known_to_owner).map(String),
  ].map(normalize);

  const phrasesToCheck = [
    ...sealedOutput.scoring_rubric.must_identify,
    ...sealedOutput.bad_recommendations_to_flag,
  ];

  for (const phrase of phrasesToCheck) {
    const normPhrase = normalize(phrase);
    for (const inputText of inputTexts) {
      if (inputText.includes(normPhrase)) {
        throw new Error(
          `Leakage detected in ${caseId}: answer-key phrase "${phrase}" appears verbatim in input_packet`
        );
      }
    }
  }
}

export function validateHoldoutFixture(raw: unknown, index: number): HoldoutFixture {
  const obj = requireObject(raw, `fixture[${index}]`);

  const case_id = requireNonBlankString(obj["case_id"], `fixture[${index}].case_id`);
  if (!CASE_ID_PATTERN.test(case_id)) {
    throw new Error(
      `fixture[${index}].case_id "${case_id}" does not match required pattern /^HOL-\\d{2}-\\d{3}$/`
    );
  }

  const title = requireNonBlankString(obj["title"], `fixture[${index}].title`);

  const category = requireNonBlankString(obj["category"], `fixture[${index}].category`);
  if (!(HOLDOUT_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(
      `fixture[${index}].category "${category}" is not a valid holdout category. ` +
        `Valid: ${HOLDOUT_CATEGORIES.join(", ")}`
    );
  }

  const test_type = requireNonBlankString(obj["test_type"], `fixture[${index}].test_type`);
  if (!(HOLDOUT_TEST_TYPES as readonly string[]).includes(test_type)) {
    throw new Error(
      `fixture[${index}].test_type "${test_type}" is not a valid test type. ` +
        `Valid: ${HOLDOUT_TEST_TYPES.join(", ")}`
    );
  }

  const segment = requireNonBlankString(obj["segment"], `fixture[${index}].segment`);
  const business_context = requireNonBlankString(obj["business_context"], `fixture[${index}].business_context`);
  const source_basis = requireNonEmptyStringArray(obj["source_basis"], `fixture[${index}].source_basis`);

  // input_packet
  const ipRaw = requireObject(obj["input_packet"], `fixture[${index}].input_packet`);
  const business_description = requireNonBlankString(ipRaw["business_description"], `fixture[${index}].input_packet.business_description`);
  const facts_known_to_owner = requireObject(ipRaw["facts_known_to_owner"], `fixture[${index}].input_packet.facts_known_to_owner`);
  const symptoms = requireStringArrayBounded(ipRaw["symptoms"], `fixture[${index}].input_packet.symptoms`, 3, Infinity);
  const misleading_signals = requireStringArrayBounded(ipRaw["misleading_signals"], `fixture[${index}].input_packet.misleading_signals`, 2, Infinity);
  const missing_inputs_opsiq_should_request = requireStringArrayBounded(
    ipRaw["missing_inputs_opsiq_should_request"],
    `fixture[${index}].input_packet.missing_inputs_opsiq_should_request`,
    3,
    6
  );
  const input_packet: HoldoutInputPacket = {
    business_description,
    facts_known_to_owner,
    symptoms,
    misleading_signals,
    missing_inputs_opsiq_should_request,
  };

  // sealed_expected_output
  const seoRaw = requireObject(obj["sealed_expected_output"], `fixture[${index}].sealed_expected_output`);
  const primary_root_cause = requireNonBlankString(seoRaw["primary_root_cause"], `fixture[${index}].sealed_expected_output.primary_root_cause`);
  const secondary_causes = requireStringArrayBounded(seoRaw["secondary_causes"], `fixture[${index}].sealed_expected_output.secondary_causes`, 2, 4);
  const expected_first_action = requireNonBlankString(seoRaw["expected_first_action"], `fixture[${index}].sealed_expected_output.expected_first_action`);
  const bad_recommendations_to_flag = requireStringArrayBounded(seoRaw["bad_recommendations_to_flag"], `fixture[${index}].sealed_expected_output.bad_recommendations_to_flag`, 4, 6);

  const rubricRaw = requireObject(seoRaw["scoring_rubric"], `fixture[${index}].sealed_expected_output.scoring_rubric`);
  const must_identify = requireStringArrayBounded(rubricRaw["must_identify"], `fixture[${index}].sealed_expected_output.scoring_rubric.must_identify`, 4, 8);
  const must_not_claim = requireStringArrayBounded(rubricRaw["must_not_claim"], `fixture[${index}].sealed_expected_output.scoring_rubric.must_not_claim`, 2, 4);
  const ideal_depth = requireStringArrayBounded(rubricRaw["ideal_depth"], `fixture[${index}].sealed_expected_output.scoring_rubric.ideal_depth`, 2, 4);
  const scoring_rubric: HoldoutScoringRubric = { must_identify, must_not_claim, ideal_depth };

  const sealed_expected_output: HoldoutSealedExpectedOutput = {
    primary_root_cause,
    secondary_causes,
    expected_first_action,
    bad_recommendations_to_flag,
    scoring_rubric,
  };

  // leakage_controls
  const lcRaw = requireObject(obj["leakage_controls"], `fixture[${index}].leakage_controls`);
  if (lcRaw["author_read_benchmark_fixtures"] !== false) {
    throw new Error(`fixture[${index}].leakage_controls.author_read_benchmark_fixtures must be false`);
  }
  if (lcRaw["author_read_composer_source"] !== false) {
    throw new Error(`fixture[${index}].leakage_controls.author_read_composer_source must be false`);
  }

  checkLeakage(input_packet, sealed_expected_output, case_id);

  const leakage_controls: HoldoutLeakageControls = {
    author_read_benchmark_fixtures: false,
    author_read_composer_source: false,
    leakage_check_passed: true,
  };

  // holdout_meta
  const hmRaw = requireObject(obj["holdout_meta"], `fixture[${index}].holdout_meta`);
  const author_id = requireNonBlankString(hmRaw["author_id"], `fixture[${index}].holdout_meta.author_id`);
  const construction_date = requireNonBlankString(hmRaw["construction_date"], `fixture[${index}].holdout_meta.construction_date`);
  const industry = requireNonBlankString(hmRaw["industry"], `fixture[${index}].holdout_meta.industry`);
  const intervention_mode = requireNonBlankString(hmRaw["intervention_mode"], `fixture[${index}].holdout_meta.intervention_mode`);
  const validModes = ["diagnostic", "turnaround", "optimisation", "monitoring"];
  if (!validModes.includes(intervention_mode)) {
    throw new Error(
      `fixture[${index}].holdout_meta.intervention_mode "${intervention_mode}" must be one of: ${validModes.join(", ")}`
    );
  }
  const business_condition_hypothesis = requireNonBlankString(hmRaw["business_condition_hypothesis"], `fixture[${index}].holdout_meta.business_condition_hypothesis`);
  const consulting_lifecycle_stage = requireNonBlankString(hmRaw["consulting_lifecycle_stage"], `fixture[${index}].holdout_meta.consulting_lifecycle_stage`);

  const holdout_meta: HoldoutMeta = {
    author_id,
    construction_date,
    industry,
    intervention_mode: intervention_mode as HoldoutMeta["intervention_mode"],
    business_condition_hypothesis,
    consulting_lifecycle_stage,
  };

  return {
    case_id,
    title,
    category: category as HoldoutCategory,
    test_type: test_type as HoldoutTestType,
    segment,
    business_context,
    input_packet,
    sealed_expected_output,
    source_basis,
    leakage_controls,
    holdout_meta,
  };
}

export function parseAndValidateHoldoutFixtures(jsonlContent: string): HoldoutFixture[] {
  const lines = jsonlContent.split("\n").filter((l) => l.trim().length > 0);
  const fixtures: HoldoutFixture[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      throw new Error(`Invalid JSON on line ${i + 1}: ${lines[i].substring(0, 80)}`);
    }

    const fixture = validateHoldoutFixture(parsed, i);

    if (seenIds.has(fixture.case_id)) {
      throw new Error(`Duplicate case_id "${fixture.case_id}" found on line ${i + 1}`);
    }
    seenIds.add(fixture.case_id);
    fixtures.push(fixture);
  }

  return fixtures;
}
