/**
 * Schema validation for OpsIQ Real-World Simulation Program fixtures.
 * Fails closed — any missing or malformed field throws a descriptive error.
 * Leakage check: sealed_expected_output phrases must not appear verbatim in input_packet.
 *
 * Case ID pattern: SIM-{nn}-{nnn}  e.g. SIM-01-001
 */

// ── Category and test-type enumerations ─────────────────────────────────────

export const SIMULATION_CATEGORIES = [
  "SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06",
  "SC-07", "SC-08", "SC-09", "SC-10", "SC-11", "SC-12",
] as const;

export type SimulationCategory = (typeof SIMULATION_CATEGORIES)[number];

export const SIMULATION_TEST_TYPES = ["TT-1", "TT-2", "TT-3", "TT-4", "TT-5"] as const;

export type SimulationTestType = (typeof SIMULATION_TEST_TYPES)[number];

// ── Core sub-interfaces ──────────────────────────────────────────────────────

export interface SimulationInputPacket {
  /** Plain-language description of the business (owner voice, no diagnostic vocabulary). */
  business_description: string;
  /** Numeric KPIs the owner knows and has stated. */
  facts_known_to_owner: Record<string, unknown>;
  /** Min 3 symptoms in owner language. */
  symptoms: string[];
  /** Min 2 facts that point toward a wrong conclusion. */
  misleading_signals: string[];
  /** 3–6 inputs OpsIQ should request. */
  missing_inputs_opsiq_should_request: string[];
}

export interface SimulationScoringRubric {
  /** 4–8 standard consulting vocabulary terms a correct diagnosis would contain. */
  must_identify: string[];
  /** 2–4 phrases that indicate a wrong diagnosis. */
  must_not_claim: string[];
  /** 2–4 thoroughness indicators above minimum. */
  ideal_depth: string[];
  /** TT-3: inputs that must be flagged as missing. */
  required_missing_input_requests?: string[];
  /** TT-4: conflicts that must be flagged. */
  required_conflict_flags?: string[];
  /** TT-2, TT-5: diagnoses that indicate the adversarial trap was taken. */
  disqualified_diagnoses?: string[];
}

export interface SimulationSealedExpectedOutput {
  primary_root_cause: string;
  secondary_causes: string[];
  expected_first_action: string;
  bad_recommendations_to_flag: string[];
  scoring_rubric: SimulationScoringRubric;
}

export interface SimulationLeakageControls {
  /** Author confirms they have not read existing SMB benchmark fixtures. */
  author_read_benchmark_fixtures: false;
  /** Author confirms they have not read smbOutputComposer.ts. */
  author_read_composer_source: false;
  /**
   * Leakage check record. Populated by the validator — not authored manually.
   * Validator will reject if any must_identify phrase appears verbatim in input_packet.
   */
  leakage_check_passed: boolean;
}

export interface SimulationHoldoutMeta {
  author_id: string;
  construction_date: string;
  industry: string;
  /** Author's hypothesis about which intervention mode this case represents. */
  intervention_mode: "diagnostic" | "turnaround" | "optimisation" | "monitoring";
  /** Author's hypothesis about the OpsIQ BusinessCondition. Does not affect scoring. */
  business_condition_hypothesis: string;
  /** Author's hypothesis about consulting lifecycle stage. Does not affect scoring. */
  consulting_lifecycle_stage: string;
}

// ── TT-2 / TT-5 specific fields ─────────────────────────────────────────────

export interface AdversarialLayer {
  /** Description of the heuristic or pattern being tested. */
  adversarial_layer: string;
  /** What a pattern-matching system would wrongly conclude. */
  expected_misclassification: string;
  /** Why genuine reasoning reaches a different conclusion. */
  why_correct_diagnosis_differs: string;
}

export interface SignalTrapAnalysis {
  /** The misleading signal that dominates the symptom picture. */
  primary_trap: string;
  /** Why attributing causality to the trap is wrong. */
  why_trap_is_wrong: string;
  /** What correct reasoning must identify instead. */
  correct_escape: string;
}

// ── TT-3 specific fields ─────────────────────────────────────────────────────

export interface DataGap {
  withheld: string;
  why_withheld: string;
  expected_opsiq_response: string;
}

// ── TT-4 specific fields ─────────────────────────────────────────────────────

export interface DataConflict {
  data_point_a: string;
  data_point_b: string;
  correct_response: string;
}

// ── Top-level fixture interface ──────────────────────────────────────────────

export interface SimulationFixture {
  /** Pattern: /^SIM-\d{2}-\d{3}$/ */
  case_id: string;
  title: string;
  category: SimulationCategory;
  test_type: SimulationTestType;
  segment: string;
  /** Narrative context about this business (2–5 sentences, owner voice). */
  business_context: string;
  /** Engine-visible input only. Must not contain diagnostic vocabulary. */
  input_packet: SimulationInputPacket;
  /** Sealed before first run. Cannot be modified after sealing. */
  sealed_expected_output: SimulationSealedExpectedOutput;
  /** Source basis for constructing the case. */
  source_basis: string[];
  leakage_controls: SimulationLeakageControls;
  holdout_meta: SimulationHoldoutMeta;
  // TT-2 optional
  adversarial?: AdversarialLayer;
  // TT-5 optional
  signal_trap_analysis?: SignalTrapAnalysis;
  // TT-3 optional
  deliberate_data_gaps?: DataGap[];
  // TT-4 optional
  data_conflicts?: DataConflict[];
}

// ── Validation helpers ───────────────────────────────────────────────────────

const CASE_ID_PATTERN = /^SIM-\d{2}-\d{3}$/;

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

/**
 * Checks that no must_identify or bad_recommendations_to_flag phrase from
 * sealed_expected_output appears verbatim (case-insensitive) in the input_packet fields.
 */
function checkLeakage(
  inputPacket: SimulationInputPacket,
  sealedOutput: SimulationSealedExpectedOutput,
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

// ── Main validator ───────────────────────────────────────────────────────────

export function validateSimulationFixture(raw: unknown, index: number): SimulationFixture {
  const obj = requireObject(raw, `fixture[${index}]`);

  const case_id = requireNonBlankString(obj["case_id"], `fixture[${index}].case_id`);
  if (!CASE_ID_PATTERN.test(case_id)) {
    throw new Error(
      `fixture[${index}].case_id "${case_id}" does not match required pattern /^SIM-\\d{2}-\\d{3}$/`
    );
  }

  const title = requireNonBlankString(obj["title"], `fixture[${index}].title`);

  const category = requireNonBlankString(obj["category"], `fixture[${index}].category`);
  if (!(SIMULATION_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(
      `fixture[${index}].category "${category}" is not a valid category. ` +
        `Valid: ${SIMULATION_CATEGORIES.join(", ")}`
    );
  }

  const test_type = requireNonBlankString(obj["test_type"], `fixture[${index}].test_type`);
  if (!(SIMULATION_TEST_TYPES as readonly string[]).includes(test_type)) {
    throw new Error(
      `fixture[${index}].test_type "${test_type}" is not a valid test type. ` +
        `Valid: ${SIMULATION_TEST_TYPES.join(", ")}`
    );
  }

  const segment = requireNonBlankString(obj["segment"], `fixture[${index}].segment`);
  const business_context = requireNonBlankString(
    obj["business_context"],
    `fixture[${index}].business_context`
  );
  const source_basis = requireNonEmptyStringArray(
    obj["source_basis"],
    `fixture[${index}].source_basis`
  );

  // input_packet
  const ipRaw = requireObject(obj["input_packet"], `fixture[${index}].input_packet`);
  const business_description = requireNonBlankString(
    ipRaw["business_description"],
    `fixture[${index}].input_packet.business_description`
  );
  const facts_known_to_owner = requireObject(
    ipRaw["facts_known_to_owner"],
    `fixture[${index}].input_packet.facts_known_to_owner`
  );
  const symptoms = requireStringArrayBounded(
    ipRaw["symptoms"],
    `fixture[${index}].input_packet.symptoms`,
    3,
    Infinity
  );
  const misleading_signals = requireStringArrayBounded(
    ipRaw["misleading_signals"],
    `fixture[${index}].input_packet.misleading_signals`,
    2,
    Infinity
  );
  const missing_inputs_opsiq_should_request = requireStringArrayBounded(
    ipRaw["missing_inputs_opsiq_should_request"],
    `fixture[${index}].input_packet.missing_inputs_opsiq_should_request`,
    3,
    6
  );
  const input_packet: SimulationInputPacket = {
    business_description,
    facts_known_to_owner,
    symptoms,
    misleading_signals,
    missing_inputs_opsiq_should_request,
  };

  // sealed_expected_output
  const seoRaw = requireObject(
    obj["sealed_expected_output"],
    `fixture[${index}].sealed_expected_output`
  );
  const primary_root_cause = requireNonBlankString(
    seoRaw["primary_root_cause"],
    `fixture[${index}].sealed_expected_output.primary_root_cause`
  );
  const secondary_causes = requireStringArrayBounded(
    seoRaw["secondary_causes"],
    `fixture[${index}].sealed_expected_output.secondary_causes`,
    2,
    4
  );
  const expected_first_action = requireNonBlankString(
    seoRaw["expected_first_action"],
    `fixture[${index}].sealed_expected_output.expected_first_action`
  );
  const bad_recommendations_to_flag = requireStringArrayBounded(
    seoRaw["bad_recommendations_to_flag"],
    `fixture[${index}].sealed_expected_output.bad_recommendations_to_flag`,
    4,
    6
  );

  const rubricRaw = requireObject(
    seoRaw["scoring_rubric"],
    `fixture[${index}].sealed_expected_output.scoring_rubric`
  );
  const must_identify = requireStringArrayBounded(
    rubricRaw["must_identify"],
    `fixture[${index}].sealed_expected_output.scoring_rubric.must_identify`,
    4,
    8
  );
  const must_not_claim = requireStringArrayBounded(
    rubricRaw["must_not_claim"],
    `fixture[${index}].sealed_expected_output.scoring_rubric.must_not_claim`,
    2,
    4
  );
  const ideal_depth = requireStringArrayBounded(
    rubricRaw["ideal_depth"],
    `fixture[${index}].sealed_expected_output.scoring_rubric.ideal_depth`,
    2,
    4
  );
  const scoring_rubric: SimulationScoringRubric = { must_identify, must_not_claim, ideal_depth };
  if (rubricRaw["required_missing_input_requests"] !== undefined) {
    scoring_rubric.required_missing_input_requests = requireNonEmptyStringArray(
      rubricRaw["required_missing_input_requests"],
      `fixture[${index}].sealed_expected_output.scoring_rubric.required_missing_input_requests`
    );
  }
  if (rubricRaw["required_conflict_flags"] !== undefined) {
    scoring_rubric.required_conflict_flags = requireNonEmptyStringArray(
      rubricRaw["required_conflict_flags"],
      `fixture[${index}].sealed_expected_output.scoring_rubric.required_conflict_flags`
    );
  }
  if (rubricRaw["disqualified_diagnoses"] !== undefined) {
    scoring_rubric.disqualified_diagnoses = requireNonEmptyStringArray(
      rubricRaw["disqualified_diagnoses"],
      `fixture[${index}].sealed_expected_output.scoring_rubric.disqualified_diagnoses`
    );
  }

  const sealed_expected_output: SimulationSealedExpectedOutput = {
    primary_root_cause,
    secondary_causes,
    expected_first_action,
    bad_recommendations_to_flag,
    scoring_rubric,
  };

  // leakage_controls
  const lcRaw = requireObject(
    obj["leakage_controls"],
    `fixture[${index}].leakage_controls`
  );
  if (lcRaw["author_read_benchmark_fixtures"] !== false) {
    throw new Error(
      `fixture[${index}].leakage_controls.author_read_benchmark_fixtures must be false`
    );
  }
  if (lcRaw["author_read_composer_source"] !== false) {
    throw new Error(
      `fixture[${index}].leakage_controls.author_read_composer_source must be false`
    );
  }

  // Run leakage check — will throw if answer-key vocab appears in input
  checkLeakage(input_packet, sealed_expected_output, case_id);

  const leakage_controls: SimulationLeakageControls = {
    author_read_benchmark_fixtures: false,
    author_read_composer_source: false,
    leakage_check_passed: true,
  };

  // holdout_meta
  const hmRaw = requireObject(obj["holdout_meta"], `fixture[${index}].holdout_meta`);
  const author_id = requireNonBlankString(hmRaw["author_id"], `fixture[${index}].holdout_meta.author_id`);
  const construction_date = requireNonBlankString(
    hmRaw["construction_date"],
    `fixture[${index}].holdout_meta.construction_date`
  );
  const industry = requireNonBlankString(hmRaw["industry"], `fixture[${index}].holdout_meta.industry`);
  const intervention_mode = requireNonBlankString(
    hmRaw["intervention_mode"],
    `fixture[${index}].holdout_meta.intervention_mode`
  );
  const validModes = ["diagnostic", "turnaround", "optimisation", "monitoring"];
  if (!validModes.includes(intervention_mode)) {
    throw new Error(
      `fixture[${index}].holdout_meta.intervention_mode "${intervention_mode}" must be one of: ${validModes.join(", ")}`
    );
  }
  const business_condition_hypothesis = requireNonBlankString(
    hmRaw["business_condition_hypothesis"],
    `fixture[${index}].holdout_meta.business_condition_hypothesis`
  );
  const consulting_lifecycle_stage = requireNonBlankString(
    hmRaw["consulting_lifecycle_stage"],
    `fixture[${index}].holdout_meta.consulting_lifecycle_stage`
  );
  const holdout_meta: SimulationHoldoutMeta = {
    author_id,
    construction_date,
    industry,
    intervention_mode: intervention_mode as SimulationHoldoutMeta["intervention_mode"],
    business_condition_hypothesis,
    consulting_lifecycle_stage,
  };

  const fixture: SimulationFixture = {
    case_id,
    title,
    category: category as SimulationCategory,
    test_type: test_type as SimulationTestType,
    segment,
    business_context,
    input_packet,
    sealed_expected_output,
    source_basis,
    leakage_controls,
    holdout_meta,
  };

  // TT-2 optional fields
  if (obj["adversarial"] !== undefined) {
    const aRaw = requireObject(obj["adversarial"], `fixture[${index}].adversarial`);
    fixture.adversarial = {
      adversarial_layer: requireNonBlankString(
        aRaw["adversarial_layer"],
        `fixture[${index}].adversarial.adversarial_layer`
      ),
      expected_misclassification: requireNonBlankString(
        aRaw["expected_misclassification"],
        `fixture[${index}].adversarial.expected_misclassification`
      ),
      why_correct_diagnosis_differs: requireNonBlankString(
        aRaw["why_correct_diagnosis_differs"],
        `fixture[${index}].adversarial.why_correct_diagnosis_differs`
      ),
    };
  }

  // TT-5 optional fields
  if (obj["signal_trap_analysis"] !== undefined) {
    const stRaw = requireObject(
      obj["signal_trap_analysis"],
      `fixture[${index}].signal_trap_analysis`
    );
    fixture.signal_trap_analysis = {
      primary_trap: requireNonBlankString(
        stRaw["primary_trap"],
        `fixture[${index}].signal_trap_analysis.primary_trap`
      ),
      why_trap_is_wrong: requireNonBlankString(
        stRaw["why_trap_is_wrong"],
        `fixture[${index}].signal_trap_analysis.why_trap_is_wrong`
      ),
      correct_escape: requireNonBlankString(
        stRaw["correct_escape"],
        `fixture[${index}].signal_trap_analysis.correct_escape`
      ),
    };
  }

  return fixture;
}

export function parseAndValidateSimulationFixtures(jsonlContent: string): SimulationFixture[] {
  const lines = jsonlContent.split("\n").filter((l) => l.trim().length > 0);
  const fixtures: SimulationFixture[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      throw new Error(`Invalid JSON on line ${i + 1}: ${lines[i].substring(0, 80)}`);
    }

    const fixture = validateSimulationFixture(parsed, i);

    if (seenIds.has(fixture.case_id)) {
      throw new Error(
        `Duplicate case_id "${fixture.case_id}" found on line ${i + 1}`
      );
    }
    seenIds.add(fixture.case_id);
    fixtures.push(fixture);
  }

  return fixtures;
}
