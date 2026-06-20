/**
 * Fail-closed validator for Evidence Hint Sidecar files.
 * Implements all rules from EVIDENCE_HINT_SIDECAR_SPEC.md Section 9.
 */

export const VALID_DIMENSIONS = [
  "financial_health",
  "operational_efficiency",
  "quality_delivery",
  "process_maturity",
  "team_capability",
  "market_position",
  "customer_retention",
] as const;

export type EvidenceDimension = (typeof VALID_DIMENSIONS)[number];

export const VALID_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH", "PROVISIONAL"] as const;

export const CANONICAL_KEY_DIMENSION_MAP: Record<string, EvidenceDimension> = {
  // financial_health
  cashRunwayMonths: "financial_health",
  runwayMonths: "financial_health",
  dso: "financial_health",
  cashConversionDays: "financial_health",
  contribution: "financial_health",
  contributionMargin: "financial_health",
  contributionPerMember: "financial_health",
  variableCost: "financial_health",
  price: "financial_health",
  profitChangePercent: "financial_health",
  marginPct: "financial_health",
  operatingMargin: "financial_health",
  leverageRatio: "financial_health",
  covenantHeadroom: "financial_health",
  interestCoverage: "financial_health",
  discountPct: "financial_health",
  realizedPrice: "financial_health",
  listPrice: "financial_health",
  capexAmount: "financial_health",
  reversibility: "financial_health",
  receivablesAging: "financial_health",
  dpo: "financial_health",
  // market_position
  newCustomerRate: "market_position",
  leadVolume: "market_position",
  pipelineValue: "market_position",
  funnelConversionPct: "market_position",
  channelCac: "market_position",
  channelMix: "market_position",
  channelConversionPct: "market_position",
  demandDurabilityMonths: "market_position",
  // operational_efficiency
  forecastErrorPct: "operational_efficiency",
  // team_capability
  keyPersonCount: "team_capability",
  successionReady: "team_capability",
  revenueConcentrationPct: "team_capability",
  // process_maturity
  complianceGapCount: "process_maturity",
  regulatoryDeadlineDays: "process_maturity",
  exposureAmount: "process_maturity",
};

const MISLEADING_SIGNAL_PREFIX = "Surface signal (not root cause): ";
const MISLEADING_SIGNAL_SOURCE_PATTERN = /^scenario\.misleading_signals\[\d+\]$/;

export interface SidecarValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface SidecarValidationResult {
  valid: boolean;
  errors: SidecarValidationError[];
}

function err(code: string, message: string, path?: string): SidecarValidationError {
  return { code, message, path };
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateSidecar(
  raw: unknown,
  fixtureFactsKeys?: Set<string>
): SidecarValidationResult {
  const errors: SidecarValidationError[] = [];

  if (!isPlainObject(raw)) {
    return { valid: false, errors: [err("NOT_OBJECT", "Sidecar must be a non-null object")] };
  }

  // R1 — case_id
  if (!isNonBlankString(raw["case_id"])) {
    errors.push(err("MISSING_CASE_ID", "case_id must be a non-blank string", "case_id"));
  } else if (!/^SMB-\d{3}$/.test(raw["case_id"] as string)) {
    errors.push(
      err("INVALID_CASE_ID_FORMAT", `case_id "${raw["case_id"]}" must match /^SMB-\\d{3}$/`, "case_id")
    );
  }

  // R2 — fixture_version
  if (!isNonBlankString(raw["fixture_version"])) {
    errors.push(
      err("MISSING_FIXTURE_VERSION", "fixture_version must be a non-blank string", "fixture_version")
    );
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw["fixture_version"] as string)) {
    errors.push(
      err(
        "INVALID_FIXTURE_VERSION_FORMAT",
        `fixture_version "${raw["fixture_version"]}" must match YYYY-MM-DD`,
        "fixture_version"
      )
    );
  }

  // R3 — engine_archetype_synonym
  if (raw["engine_archetype_synonym"] !== null && !isNonBlankString(raw["engine_archetype_synonym"])) {
    errors.push(
      err(
        "INVALID_ENGINE_ARCHETYPE_SYNONYM",
        "engine_archetype_synonym must be a non-blank string or null",
        "engine_archetype_synonym"
      )
    );
  }

  // R4 — unsupported_expected_archetypes
  if (!Array.isArray(raw["unsupported_expected_archetypes"])) {
    errors.push(
      err(
        "MISSING_UNSUPPORTED_ARCHETYPES",
        "unsupported_expected_archetypes must be an array",
        "unsupported_expected_archetypes"
      )
    );
  } else {
    const archetypes = raw["unsupported_expected_archetypes"] as unknown[];
    for (let i = 0; i < archetypes.length; i++) {
      const a = archetypes[i];
      if (!isPlainObject(a)) {
        errors.push(
          err(
            "INVALID_ARCHETYPE_ENTRY",
            `unsupported_expected_archetypes[${i}] must be an object`,
            `unsupported_expected_archetypes[${i}]`
          )
        );
        continue;
      }
      if (!isNonBlankString(a["smb_label"])) {
        errors.push(
          err(
            "MISSING_ARCHETYPE_SMB_LABEL",
            `unsupported_expected_archetypes[${i}].smb_label must be non-blank`,
            `unsupported_expected_archetypes[${i}].smb_label`
          )
        );
      }
      if (!isNonBlankString(a["gap_reason"])) {
        errors.push(
          err(
            "MISSING_ARCHETYPE_GAP_REASON",
            `unsupported_expected_archetypes[${i}].gap_reason must be non-blank`,
            `unsupported_expected_archetypes[${i}].gap_reason`
          )
        );
      }
    }

    // R5 — if unsupported_expected_archetypes is non-empty, engine_archetype_synonym must be null
    if (archetypes.length > 0 && raw["engine_archetype_synonym"] !== null) {
      errors.push(
        err(
          "SYNONYM_PRESENT_FOR_GAP_CASE",
          "engine_archetype_synonym must be null when unsupported_expected_archetypes is non-empty",
          "engine_archetype_synonym"
        )
      );
    }
  }

  // R6 — validation_notes
  if (!isNonBlankString(raw["validation_notes"])) {
    errors.push(
      err("MISSING_VALIDATION_NOTES", "validation_notes must be a non-blank string", "validation_notes")
    );
  }

  // R7 — evidence_items
  if (!Array.isArray(raw["evidence_items"]) || (raw["evidence_items"] as unknown[]).length === 0) {
    errors.push(
      err("EMPTY_EVIDENCE_ITEMS", "evidence_items must be a non-empty array", "evidence_items")
    );
  } else {
    const items = raw["evidence_items"] as unknown[];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const base = `evidence_items[${i}]`;

      if (!isPlainObject(item)) {
        errors.push(err("INVALID_EVIDENCE_ITEM", `${base} must be an object`, base));
        continue;
      }

      // R8 — source_path
      if (!isNonBlankString(item["source_path"])) {
        errors.push(
          err("MISSING_SOURCE_PATH", `${base}.source_path must be non-blank`, `${base}.source_path`)
        );
      } else {
        const sp = item["source_path"] as string;
        // R9 — no outcome-side source_path
        if (sp.startsWith("expected_opsiq_diagnosis")) {
          errors.push(
            err(
              "OUTCOME_PATH_FORBIDDEN",
              `${base}.source_path references forbidden expected_opsiq_diagnosis path`,
              `${base}.source_path`
            )
          );
        }
      }

      // R10 — finding non-blank
      if (!isNonBlankString(item["finding"])) {
        errors.push(
          err("MISSING_FINDING", `${base}.finding must be non-blank`, `${base}.finding`)
        );
      }

      // R11 — dimension
      if (!VALID_DIMENSIONS.includes(item["dimension"] as EvidenceDimension)) {
        errors.push(
          err(
            "INVALID_DIMENSION",
            `${base}.dimension "${item["dimension"]}" is not one of the 7 valid dimensions`,
            `${base}.dimension`
          )
        );
      }

      // R12 — is_critical boolean
      if (typeof item["is_critical"] !== "boolean") {
        errors.push(
          err("MISSING_IS_CRITICAL", `${base}.is_critical must be a boolean`, `${base}.is_critical`)
        );
      }

      // R13 — confidence
      if (!VALID_CONFIDENCE_LEVELS.includes(item["confidence"] as (typeof VALID_CONFIDENCE_LEVELS)[number])) {
        errors.push(
          err(
            "INVALID_CONFIDENCE",
            `${base}.confidence "${item["confidence"]}" must be LOW, MEDIUM, HIGH, or PROVISIONAL`,
            `${base}.confidence`
          )
        );
      }

      // R14 — no_outcome_leakage must be true
      if (item["no_outcome_leakage"] !== true) {
        errors.push(
          err(
            "OUTCOME_LEAKAGE_DECLARED",
            `${base}.no_outcome_leakage must be true (got ${JSON.stringify(item["no_outcome_leakage"])})`,
            `${base}.no_outcome_leakage`
          )
        );
      }

      // R15 — rationale min 10 chars
      if (!isNonBlankString(item["rationale"]) || (item["rationale"] as string).trim().length < 10) {
        errors.push(
          err(
            "MISSING_RATIONALE",
            `${base}.rationale must be a string with at least 10 characters`,
            `${base}.rationale`
          )
        );
      }

      // R16 — misleading signal prefix rule
      const sp = item["source_path"] as string | undefined;
      const finding = item["finding"] as string | undefined;
      if (sp && MISLEADING_SIGNAL_SOURCE_PATTERN.test(sp)) {
        if (!finding?.startsWith(MISLEADING_SIGNAL_PREFIX)) {
          errors.push(
            err(
              "MISSING_MISLEADING_PREFIX",
              `${base}.finding for misleading_signal source must start with "${MISLEADING_SIGNAL_PREFIX}"`,
              `${base}.finding`
            )
          );
        }
        // R17 — misleading signals must be non-critical LOW confidence
        if (item["is_critical"] !== false) {
          errors.push(
            err(
              "MISLEADING_SIGNAL_IS_CRITICAL",
              `${base}.is_critical must be false for misleading_signal items`,
              `${base}.is_critical`
            )
          );
        }
        if (item["confidence"] !== "LOW") {
          errors.push(
            err(
              "MISLEADING_SIGNAL_CONFIDENCE_NOT_LOW",
              `${base}.confidence must be LOW for misleading_signal items`,
              `${base}.confidence`
            )
          );
        }
      }
    }
  }

  // R18 — metric_key_mappings
  if (!Array.isArray(raw["metric_key_mappings"])) {
    errors.push(
      err(
        "MISSING_METRIC_KEY_MAPPINGS",
        "metric_key_mappings must be an array",
        "metric_key_mappings"
      )
    );
  } else {
    const mappings = raw["metric_key_mappings"] as unknown[];
    const evidenceItems = Array.isArray(raw["evidence_items"])
      ? (raw["evidence_items"] as unknown[])
      : [];

    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      const base = `metric_key_mappings[${i}]`;

      if (!isPlainObject(m)) {
        errors.push(err("INVALID_MAPPING", `${base} must be an object`, base));
        continue;
      }

      // R19 — fixture_key non-blank
      if (!isNonBlankString(m["fixture_key"])) {
        errors.push(
          err("MISSING_FIXTURE_KEY", `${base}.fixture_key must be non-blank`, `${base}.fixture_key`)
        );
      } else if (fixtureFactsKeys && !fixtureFactsKeys.has(m["fixture_key"] as string)) {
        errors.push(
          err(
            "FIXTURE_KEY_NOT_IN_FACTS",
            `${base}.fixture_key "${m["fixture_key"]}" not found in fixture facts_known_to_owner`,
            `${base}.fixture_key`
          )
        );
      }

      // R20 — canonical_key in registry
      if (!isNonBlankString(m["canonical_key"])) {
        errors.push(
          err(
            "MISSING_CANONICAL_KEY",
            `${base}.canonical_key must be non-blank`,
            `${base}.canonical_key`
          )
        );
      } else if (!(m["canonical_key"] as string in CANONICAL_KEY_DIMENSION_MAP)) {
        errors.push(
          err(
            "UNKNOWN_CANONICAL_KEY",
            `${base}.canonical_key "${m["canonical_key"]}" is not in the canonical key registry`,
            `${base}.canonical_key`
          )
        );
      }

      // R21 — evidence_item_index in range
      const idx = m["evidence_item_index"];
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
        errors.push(
          err(
            "INVALID_ITEM_INDEX",
            `${base}.evidence_item_index must be a non-negative integer`,
            `${base}.evidence_item_index`
          )
        );
      } else if (idx >= evidenceItems.length) {
        errors.push(
          err(
            "ITEM_INDEX_OUT_OF_RANGE",
            `${base}.evidence_item_index ${idx} is out of range (evidence_items has ${evidenceItems.length} items)`,
            `${base}.evidence_item_index`
          )
        );
      } else if (isNonBlankString(m["canonical_key"]) && m["canonical_key"] in CANONICAL_KEY_DIMENSION_MAP) {
        // R22 — dimension compatibility
        const requiredDim = CANONICAL_KEY_DIMENSION_MAP[m["canonical_key"] as string];
        const targetItem = evidenceItems[idx as number];
        if (isPlainObject(targetItem)) {
          const itemDim = targetItem["dimension"];
          if (itemDim !== requiredDim) {
            errors.push(
              err(
                "METRIC_DIMENSION_MISMATCH",
                `${base}: canonical_key "${m["canonical_key"]}" requires dimension "${requiredDim}" but evidence_items[${idx}].dimension is "${itemDim}"`,
                base
              )
            );
          }
        }
      }

      // R23 — value_override requires transform_note
      if ("value_override" in m) {
        if (typeof m["value_override"] !== "number") {
          errors.push(
            err(
              "INVALID_VALUE_OVERRIDE",
              `${base}.value_override must be a number`,
              `${base}.value_override`
            )
          );
        }
        if (!isNonBlankString(m["transform_note"])) {
          errors.push(
            err(
              "MISSING_TRANSFORM_NOTE",
              `${base}.transform_note is required when value_override is present`,
              `${base}.transform_note`
            )
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
