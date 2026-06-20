/**
 * Strict schema validation for OpsIQ real-world SMB case fixtures.
 * Fails closed — any missing or malformed field throws a descriptive error.
 */

export interface SmbFixtureScenario {
  business: string;
  facts_known_to_owner: Record<string, unknown>;
  symptoms: string[];
  misleading_signals: string[];
  missing_inputs_opsiq_should_request: string[];
}

export interface SmbFixtureScoringCriteria {
  must_identify: string[];
  must_not_claim: string[];
  ideal_depth: string[];
}

export interface SmbFixtureDiagnosis {
  primary_root_cause: string;
  secondary_causes: string[];
  expected_first_action: string;
  bad_recommendations_to_flag: string[];
  scoring_criteria: SmbFixtureScoringCriteria;
}

export interface SmbFixture {
  case_id: string;
  title: string;
  segment: string;
  source_basis: string[];
  scenario: SmbFixtureScenario;
  expected_opsiq_diagnosis: SmbFixtureDiagnosis;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const CASE_ID_PATTERN = /^SMB-\d{3}$/;

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

function requireObject(val: unknown, path: string): Record<string, unknown> {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    throw new Error(`${path} must be a non-null object`);
  }
  return val as Record<string, unknown>;
}

export function validateFixture(raw: unknown, index: number): SmbFixture {
  const obj = requireObject(raw, `fixture[${index}]`);

  const case_id = requireNonBlankString(obj["case_id"], `fixture[${index}].case_id`);
  if (!CASE_ID_PATTERN.test(case_id)) {
    throw new Error(
      `fixture[${index}].case_id "${case_id}" does not match required pattern /^SMB-\\d{3}$/`
    );
  }

  const title = requireNonBlankString(obj["title"], `fixture[${index}].title`);
  const segment = requireNonBlankString(obj["segment"], `fixture[${index}].segment`);
  const source_basis = requireNonEmptyStringArray(
    obj["source_basis"],
    `fixture[${index}].source_basis`
  );

  const scenarioRaw = requireObject(obj["scenario"], `fixture[${index}].scenario`);
  const business = requireNonBlankString(
    scenarioRaw["business"],
    `fixture[${index}].scenario.business`
  );
  const facts_known_to_owner = requireObject(
    scenarioRaw["facts_known_to_owner"],
    `fixture[${index}].scenario.facts_known_to_owner`
  );
  const symptoms = requireNonEmptyStringArray(
    scenarioRaw["symptoms"],
    `fixture[${index}].scenario.symptoms`
  );
  const misleading_signals = requireNonEmptyStringArray(
    scenarioRaw["misleading_signals"],
    `fixture[${index}].scenario.misleading_signals`
  );
  const missing_inputs_opsiq_should_request = requireNonEmptyStringArray(
    scenarioRaw["missing_inputs_opsiq_should_request"],
    `fixture[${index}].scenario.missing_inputs_opsiq_should_request`
  );

  const dxRaw = requireObject(
    obj["expected_opsiq_diagnosis"],
    `fixture[${index}].expected_opsiq_diagnosis`
  );
  const primary_root_cause = requireNonBlankString(
    dxRaw["primary_root_cause"],
    `fixture[${index}].expected_opsiq_diagnosis.primary_root_cause`
  );
  const secondary_causes = requireNonEmptyStringArray(
    dxRaw["secondary_causes"],
    `fixture[${index}].expected_opsiq_diagnosis.secondary_causes`
  );
  const expected_first_action = requireNonBlankString(
    dxRaw["expected_first_action"],
    `fixture[${index}].expected_opsiq_diagnosis.expected_first_action`
  );
  const bad_recommendations_to_flag = requireNonEmptyStringArray(
    dxRaw["bad_recommendations_to_flag"],
    `fixture[${index}].expected_opsiq_diagnosis.bad_recommendations_to_flag`
  );

  const criteriaRaw = requireObject(
    dxRaw["scoring_criteria"],
    `fixture[${index}].expected_opsiq_diagnosis.scoring_criteria`
  );
  const must_identify = requireNonEmptyStringArray(
    criteriaRaw["must_identify"],
    `fixture[${index}].expected_opsiq_diagnosis.scoring_criteria.must_identify`
  );
  const must_not_claim = requireNonEmptyStringArray(
    criteriaRaw["must_not_claim"],
    `fixture[${index}].expected_opsiq_diagnosis.scoring_criteria.must_not_claim`
  );
  const ideal_depth = requireNonEmptyStringArray(
    criteriaRaw["ideal_depth"],
    `fixture[${index}].expected_opsiq_diagnosis.scoring_criteria.ideal_depth`
  );

  return {
    case_id,
    title,
    segment,
    source_basis,
    scenario: {
      business,
      facts_known_to_owner,
      symptoms,
      misleading_signals,
      missing_inputs_opsiq_should_request,
    },
    expected_opsiq_diagnosis: {
      primary_root_cause,
      secondary_causes,
      expected_first_action,
      bad_recommendations_to_flag,
      scoring_criteria: { must_identify, must_not_claim, ideal_depth },
    },
  };
}

export function parseAndValidateFixtures(jsonlContent: string): SmbFixture[] {
  const lines = jsonlContent.split("\n").filter((l) => l.trim().length > 0);
  const fixtures: SmbFixture[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      throw new Error(
        `Invalid JSON on line ${i + 1}: ${lines[i].substring(0, 80)}`
      );
    }

    const fixture = validateFixture(parsed, i);

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
