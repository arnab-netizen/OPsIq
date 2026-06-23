/**
 * Fail-closed validator for Holdout Evidence Hint Sidecar files.
 *
 * Mirrors simulationEvidenceHintValidator.ts but accepts HOL-NN-NNN case IDs
 * and input_packet.* source paths.
 */
import {
  CANONICAL_KEY_DIMENSION_MAP,
  VALID_DIMENSIONS,
  VALID_CONFIDENCE_LEVELS,
} from "../real-world-smb-cases/evidenceHintSidecarValidator";

export { CANONICAL_KEY_DIMENSION_MAP, VALID_DIMENSIONS, VALID_CONFIDENCE_LEVELS };

const HOL_CASE_ID_PATTERN = /^HOL-\d{2}-\d{3}$/;
const MISLEADING_SIGNAL_SOURCE_PATTERN = /^input_packet\.misleading_signals\[\d+\]$/;
const MISLEADING_SIGNAL_PREFIX = "Surface signal (not root cause): ";

export interface HoldoutSidecarValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface HoldoutSidecarValidationResult {
  valid: boolean;
  errors: HoldoutSidecarValidationError[];
}

function err(
  code: string,
  message: string,
  path?: string
): HoldoutSidecarValidationError {
  return { code, message, path };
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function validateHoldoutSidecar(
  raw: unknown
): HoldoutSidecarValidationResult {
  const errors: HoldoutSidecarValidationError[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: [err("NOT_OBJECT", "sidecar must be a non-null object")] };
  }
  const obj = raw as Record<string, unknown>;

  // R1 — case_id
  if (!isNonBlankString(obj["case_id"])) {
    errors.push(err("MISSING_CASE_ID", "case_id must be non-blank", "case_id"));
  } else if (!HOL_CASE_ID_PATTERN.test(obj["case_id"] as string)) {
    errors.push(
      err(
        "INVALID_CASE_ID",
        `case_id "${obj["case_id"]}" does not match HOL-NN-NNN pattern`,
        "case_id"
      )
    );
  }

  // R2 — fixture_version
  if (!isNonBlankString(obj["fixture_version"])) {
    errors.push(
      err("MISSING_FIXTURE_VERSION", "fixture_version must be non-blank", "fixture_version")
    );
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(obj["fixture_version"] as string)) {
    errors.push(
      err("INVALID_FIXTURE_VERSION", "fixture_version must be YYYY-MM-DD", "fixture_version")
    );
  }

  // R3 — engine_archetype_synonym
  if (!("engine_archetype_synonym" in obj)) {
    errors.push(
      err(
        "MISSING_ARCHETYPE_SYNONYM",
        "engine_archetype_synonym must be present (string or null)",
        "engine_archetype_synonym"
      )
    );
  } else {
    const s = obj["engine_archetype_synonym"];
    if (s !== null && typeof s !== "string") {
      errors.push(
        err(
          "INVALID_ARCHETYPE_SYNONYM",
          "engine_archetype_synonym must be string or null",
          "engine_archetype_synonym"
        )
      );
    }
  }

  // R4 — unsupported_expected_archetypes
  if (!isArray(obj["unsupported_expected_archetypes"])) {
    errors.push(
      err(
        "MISSING_UNSUPPORTED_ARCHETYPES",
        "unsupported_expected_archetypes must be an array",
        "unsupported_expected_archetypes"
      )
    );
  } else {
    const arr = obj["unsupported_expected_archetypes"] as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i] as Record<string, unknown>;
      if (!isNonBlankString(u?.["smb_label"])) {
        errors.push(
          err(
            "UNSUPPORTED_MISSING_LABEL",
            `unsupported_expected_archetypes[${i}].smb_label must be non-blank`
          )
        );
      }
      if (!isNonBlankString(u?.["gap_reason"])) {
        errors.push(
          err(
            "UNSUPPORTED_MISSING_GAP_REASON",
            `unsupported_expected_archetypes[${i}].gap_reason must be non-blank`
          )
        );
      }
    }
  }

  // R5 — null synonym rule
  const hasUnsupported =
    isArray(obj["unsupported_expected_archetypes"]) &&
    (obj["unsupported_expected_archetypes"] as unknown[]).length > 0;
  const synonym = obj["engine_archetype_synonym"];
  if (hasUnsupported && synonym !== null) {
    errors.push(
      err(
        "SYNONYM_MUST_BE_NULL_WHEN_UNSUPPORTED",
        "engine_archetype_synonym must be null when unsupported_expected_archetypes is non-empty",
        "engine_archetype_synonym"
      )
    );
  }

  // R6 — evidence_items
  if (!isArray(obj["evidence_items"])) {
    errors.push(
      err("MISSING_EVIDENCE_ITEMS", "evidence_items must be an array", "evidence_items")
    );
  } else if ((obj["evidence_items"] as unknown[]).length === 0) {
    errors.push(
      err("EMPTY_EVIDENCE_ITEMS", "evidence_items must be a non-empty array", "evidence_items")
    );
  } else {
    const items = obj["evidence_items"] as unknown[];
    for (let i = 0; i < items.length; i++) {
      const base = `evidence_items[${i}]`;
      const item = items[i] as Record<string, unknown>;
      if (typeof item !== "object" || item === null) {
        errors.push(err("INVALID_EVIDENCE_ITEM", `${base} must be an object`));
        continue;
      }

      if (!isBoolean(item["no_outcome_leakage"])) {
        errors.push(
          err("MISSING_NO_OUTCOME_LEAKAGE", `${base}.no_outcome_leakage must be boolean`, `${base}.no_outcome_leakage`)
        );
      } else if (item["no_outcome_leakage"] !== true) {
        errors.push(
          err("OUTCOME_LEAKAGE_FLAGGED", `${base}.no_outcome_leakage must be true`, `${base}.no_outcome_leakage`)
        );
      }

      if (!isNonBlankString(item["source_path"])) {
        errors.push(
          err("MISSING_SOURCE_PATH", `${base}.source_path must be non-blank`, `${base}.source_path`)
        );
      } else {
        const sp = item["source_path"] as string;
        if (sp.startsWith("sealed_expected_output")) {
          errors.push(
            err("OUTCOME_PATH_FORBIDDEN", `${base}.source_path references forbidden sealed_expected_output path`, `${base}.source_path`)
          );
        }
      }

      if (!isNonBlankString(item["finding"])) {
        errors.push(err("MISSING_FINDING", `${base}.finding must be non-blank`, `${base}.finding`));
      }

      if (!isNonBlankString(item["dimension"])) {
        errors.push(err("MISSING_DIMENSION", `${base}.dimension must be non-blank`, `${base}.dimension`));
      } else if (!(VALID_DIMENSIONS as readonly string[]).includes(item["dimension"] as string)) {
        errors.push(
          err("INVALID_DIMENSION", `${base}.dimension "${item["dimension"]}" is not a valid dimension`, `${base}.dimension`)
        );
      }

      if (!isBoolean(item["is_critical"])) {
        errors.push(err("MISSING_IS_CRITICAL", `${base}.is_critical must be boolean`, `${base}.is_critical`));
      }

      if (!isNonBlankString(item["confidence"])) {
        errors.push(err("MISSING_CONFIDENCE", `${base}.confidence must be non-blank`, `${base}.confidence`));
      } else if (!(VALID_CONFIDENCE_LEVELS as readonly string[]).includes(item["confidence"] as string)) {
        errors.push(
          err("INVALID_CONFIDENCE", `${base}.confidence "${item["confidence"]}" is not valid`, `${base}.confidence`)
        );
      }

      if (!isNonBlankString(item["rationale"])) {
        errors.push(err("MISSING_RATIONALE", `${base}.rationale must be non-blank`, `${base}.rationale`));
      }

      // Misleading signals must have prefix and be LOW/non-critical
      const sp = item["source_path"] as string | undefined;
      if (sp && MISLEADING_SIGNAL_SOURCE_PATTERN.test(sp)) {
        const finding = item["finding"] as string | undefined;
        if (typeof finding === "string" && !finding.startsWith(MISLEADING_SIGNAL_PREFIX)) {
          errors.push(
            err(
              "MISLEADING_SIGNAL_MISSING_PREFIX",
              `${base}.finding for misleading signal source must start with "${MISLEADING_SIGNAL_PREFIX}"`,
              `${base}.finding`
            )
          );
        }
        if (item["confidence"] !== "LOW") {
          errors.push(
            err("MISLEADING_SIGNAL_MUST_BE_LOW", `${base}.confidence must be LOW for misleading signal items`, `${base}.confidence`)
          );
        }
        if (item["is_critical"] !== false) {
          errors.push(
            err("MISLEADING_SIGNAL_MUST_BE_NON_CRITICAL", `${base}.is_critical must be false for misleading signal items`, `${base}.is_critical`)
          );
        }
      }
    }
  }

  // R18 — metric_key_mappings
  if (!isArray(obj["metric_key_mappings"])) {
    errors.push(
      err("MISSING_METRIC_KEY_MAPPINGS", "metric_key_mappings must be an array", "metric_key_mappings")
    );
  } else {
    const mappings = obj["metric_key_mappings"] as unknown[];
    for (let i = 0; i < mappings.length; i++) {
      const base = `metric_key_mappings[${i}]`;
      const m = mappings[i] as Record<string, unknown>;
      if (typeof m !== "object" || m === null) {
        errors.push(err("INVALID_MAPPING", `${base} must be an object`));
        continue;
      }

      if (!isNonBlankString(m["fixture_key"])) {
        errors.push(err("MISSING_FIXTURE_KEY", `${base}.fixture_key must be non-blank`, `${base}.fixture_key`));
      }

      if (!isNonBlankString(m["canonical_key"])) {
        errors.push(err("MISSING_CANONICAL_KEY", `${base}.canonical_key must be non-blank`, `${base}.canonical_key`));
      } else if (!(m["canonical_key"] as string in CANONICAL_KEY_DIMENSION_MAP)) {
        errors.push(
          err("UNKNOWN_CANONICAL_KEY", `${base}.canonical_key "${m["canonical_key"]}" is not in the canonical key registry`, `${base}.canonical_key`)
        );
      }

      const evItems = isArray(obj["evidence_items"]) ? obj["evidence_items"] as unknown[] : [];
      if (typeof m["evidence_item_index"] !== "number" || !Number.isInteger(m["evidence_item_index"])) {
        errors.push(err("INVALID_EVIDENCE_ITEM_INDEX", `${base}.evidence_item_index must be an integer`, `${base}.evidence_item_index`));
      } else {
        const idx = m["evidence_item_index"] as number;
        if (idx < 0 || idx >= evItems.length) {
          errors.push(
            err("EVIDENCE_ITEM_INDEX_OUT_OF_BOUNDS", `${base}.evidence_item_index ${idx} is out of bounds for evidence_items (length ${evItems.length})`, `${base}.evidence_item_index`)
          );
        }
      }

      if (m["value_override"] !== undefined) {
        if (typeof m["value_override"] !== "number") {
          errors.push(err("INVALID_VALUE_OVERRIDE", `${base}.value_override must be a number`, `${base}.value_override`));
        }
        if (!isNonBlankString(m["transform_note"])) {
          errors.push(
            err("MISSING_TRANSFORM_NOTE", `${base}.transform_note must be non-blank when value_override is provided`, `${base}.transform_note`)
          );
        }
      }

      // canonical_key dimension must match evidence_item dimension
      const idx = typeof m["evidence_item_index"] === "number" ? m["evidence_item_index"] as number : -1;
      const canonKey = isNonBlankString(m["canonical_key"]) ? m["canonical_key"] as string : "";
      if (idx >= 0 && idx < evItems.length && canonKey in CANONICAL_KEY_DIMENSION_MAP) {
        const requiredDim = CANONICAL_KEY_DIMENSION_MAP[canonKey];
        const item = evItems[idx] as Record<string, unknown>;
        const itemDim = item?.["dimension"] as string | undefined;
        if (itemDim && itemDim !== requiredDim) {
          errors.push(
            err(
              "CANONICAL_KEY_DIMENSION_MISMATCH",
              `${base}: canonical_key "${canonKey}" requires dimension "${requiredDim}" but evidence_items[${idx}].dimension is "${itemDim}"`,
              `${base}.canonical_key`
            )
          );
        }
      }
    }
  }

  // R-CL — clarification_requests
  if (!isArray(obj["clarification_requests"])) {
    errors.push(
      err("MISSING_CLARIFICATION_REQUESTS", "clarification_requests must be an array", "clarification_requests")
    );
  }

  return { valid: errors.length === 0, errors };
}
