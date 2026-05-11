/**
 * ADDENDUM F: Mapping & Normalization Engine Contracts
 *
 * Defines data transformation, field mapping, and normalization logic
 * for converting between different data source formats and standards.
 *
 * Non-DB: Contains only contracts and transformation algorithms (no persistence).
 * Ready for: Integration with sync service to transform source data into OpsIQ canonical format.
 */

import { z } from "zod";

// ============================================================================
// FIELD MAPPING CONTRACTS
// ============================================================================

/** Field mapping rule (source field → target field + transformation) */
export const FieldMappingRuleSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
  fieldType: z.enum(["string", "number", "date", "boolean", "array", "object"]),
  required: z.boolean().default(false),
  transformation: z.string().optional(), // Name of transformation function
  defaultValue: z.unknown().optional(),
});

export type FieldMappingRule = z.infer<typeof FieldMappingRuleSchema>;

/** Complete field mapping configuration */
export const FieldMappingConfigSchema = z.object({
  mappingId: z.string().min(1),
  sourceConnector: z.string().min(1),
  targetConnector: z.string().min(1),
  sourceRecordType: z.string().min(1), // e.g., "contact", "deal", "invoice"
  targetRecordType: z.string().min(1),
  rules: z.array(FieldMappingRuleSchema).min(1),
  createdAt: z.date(),
  lastModifiedAt: z.date(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export type FieldMappingConfig = z.infer<typeof FieldMappingConfigSchema>;

// ============================================================================
// NORMALIZATION RULES
// ============================================================================

/** Unit conversion specification */
export const UnitConversionRuleSchema = z.object({
  sourceUnit: z.string(),
  targetUnit: z.string(),
  conversionFactor: z.number(),
  formula: z.string().optional(), // e.g., "value * 1.609" for miles to km
});

export type UnitConversionRule = z.infer<typeof UnitConversionRuleSchema>;

/** Value normalization rule */
export const NormalizationRuleSchema = z.object({
  ruleId: z.string().min(1),
  fieldName: z.string().min(1),
  ruleType: z.enum([
    "unit_conversion",
    "format_standardization",
    "value_mapping",
    "type_coercion",
    "string_normalization",
    "date_parsing",
    "aggregation",
  ]),
  ruleConfig: z.record(z.string(), z.any()),
  priority: z.number().min(0),
  enabled: z.boolean().default(true),
  examples: z.array(z.object({
    input: z.unknown(),
    expectedOutput: z.unknown(),
  })).optional(),
});

export type NormalizationRule = z.infer<typeof NormalizationRuleSchema>;

/** Complete normalization configuration */
export const NormalizationConfigSchema = z.object({
  configId: z.string().min(1),
  recordType: z.string().min(1),
  rules: z.array(NormalizationRuleSchema),
  createdAt: z.date(),
  lastModifiedAt: z.date(),
  isActive: z.boolean().default(true),
});

export type NormalizationConfig = z.infer<typeof NormalizationConfigSchema>;

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/** Transformation error detail */
export const TransformationErrorSchema = z.object({
  fieldName: z.string(),
  errorCode: z.enum([
    "INVALID_SOURCE_VALUE",
    "MAPPING_NOT_FOUND",
    "TRANSFORMATION_FAILED",
    "TYPE_COERCION_FAILED",
    "VALIDATION_FAILED",
    "REQUIRED_FIELD_MISSING",
  ]),
  errorMessage: z.string(),
  sourceValue: z.unknown(),
  attemptedTargetType: z.string(),
});

export type TransformationError = z.infer<typeof TransformationErrorSchema>;

/** Result of transformation operation */
export const TransformationResultSchema = z.object({
  success: z.boolean(),
  sourceRecord: z.record(z.string(), z.any()),
  transformedRecord: z.record(z.string(), z.any()).optional(),
  errors: z.array(TransformationErrorSchema),
  warnings: z.array(z.object({
    fieldName: z.string(),
    warningCode: z.enum([
      "MISSING_OPTIONAL_FIELD",
      "DEFAULT_VALUE_USED",
      "TRUNCATED_VALUE",
      "LOSSY_CONVERSION",
    ]),
    warningMessage: z.string(),
  })),
  transformationTimeMs: z.number().min(0),
  mappingId: z.string().optional(),
  appliedRules: z.array(z.string()).optional(),
});

export type TransformationResult = z.infer<typeof TransformationResultSchema>;

// ============================================================================
// DATA SOURCE PROFILING
// ============================================================================

/** Schema information for data source */
export const DataSourceProfileSchema = z.object({
  connectorId: z.string().min(1),
  connectorType: z.enum([
    "hubspot",
    "salesforce",
    "quickbooks",
    "google_sheets",
    "csv",
    "api",
    "database",
  ]),
  recordType: z.string().min(1),
  totalRecords: z.number().min(0).optional(),
  sampleRecords: z.array(z.record(z.string(), z.any())).max(5).optional(),
  fields: z.array(z.object({
    fieldName: z.string(),
    dataType: z.string(),
    nullable: z.boolean(),
    sampleValues: z.array(z.unknown()).optional(),
    frequency: z.record(z.string(), z.number()).optional(), // Value distribution
  })),
  estimatedSizeBytes: z.number().min(0).optional(),
  lastProfiledAt: z.date().optional(),
});

export type DataSourceProfile = z.infer<typeof DataSourceProfileSchema>;

/** Auto-detected schema alignment suggestion */
export const SchemaAlignmentSuggestionSchema = z.object({
  suggestionId: z.string().min(1),
  sourceField: z.string().min(1),
  targetField: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.enum([
    "exact_name_match",
    "semantic_similarity",
    "type_compatibility",
    "usage_pattern_match",
    "historical_mapping",
  ]),
  suggestedTransformation: z.string().optional(),
});

export type SchemaAlignmentSuggestion = z.infer<typeof SchemaAlignmentSuggestionSchema>;

// ============================================================================
// BULK TRANSFORMATION
// ============================================================================

/** Batch transformation request */
export const BatchTransformationRequestSchema = z.object({
  batchId: z.string().min(1),
  mappingConfigId: z.string().min(1),
  normalizationConfigId: z.string().optional(),
  records: z.array(z.record(z.string(), z.any())).min(1),
  stopOnFirstError: z.boolean().default(false),
  validationLevel: z.enum(["strict", "lenient", "none"]).default("strict"),
});

export type BatchTransformationRequest = z.infer<typeof BatchTransformationRequestSchema>;

/** Batch transformation result */
export const BatchTransformationResultSchema = z.object({
  batchId: z.string().min(1),
  totalRecords: z.number().min(0),
  successfulRecords: z.number().min(0),
  failedRecords: z.number().min(0),
  results: z.array(TransformationResultSchema),
  summary: z.object({
    successRate: z.number().min(0).max(1),
    commonErrors: z.array(z.object({
      errorCode: z.string(),
      count: z.number(),
      exampleFields: z.array(z.string()),
    })),
    processingTimeMs: z.number().min(0),
    throughputRecordsPerSecond: z.number().min(0),
  }),
});

export type BatchTransformationResult = z.infer<typeof BatchTransformationResultSchema>;

// ============================================================================
// TRANSFORMATION ALGORITHM HELPERS
// ============================================================================

/**
 * Apply field mapping rules to transform record structure
 */
export function applyFieldMapping(
  sourceRecord: Record<string, unknown>,
  mappingRules: FieldMappingRule[],
): Omit<TransformationResult, "transformationTimeMs" | "mappingId" | "appliedRules"> {
  const startTime = Date.now();
  const errors: TransformationError[] = [];
  const warnings: TransformationResult["warnings"] = [];
  const transformedRecord: Record<string, unknown> = {};

  for (const rule of mappingRules) {
    const sourceValue = sourceRecord[rule.sourceField];

    // Handle missing source field
    if (sourceValue === undefined) {
      if (rule.required) {
        errors.push({
          fieldName: rule.sourceField,
          errorCode: "REQUIRED_FIELD_MISSING",
          errorMessage: `Required field '${rule.sourceField}' not found in source record`,
          sourceValue: undefined,
          attemptedTargetType: rule.fieldType,
        });
      } else if (rule.defaultValue !== undefined) {
        transformedRecord[rule.targetField] = rule.defaultValue;
        warnings.push({
          fieldName: rule.targetField,
          warningCode: "DEFAULT_VALUE_USED",
          warningMessage: `Default value used for '${rule.targetField}'`,
        });
      }
      continue;
    }

    // Basic type checking and coercion
    transformedRecord[rule.targetField] = sourceValue;
  }

  return {
    success: errors.length === 0,
    sourceRecord,
    transformedRecord: errors.length === 0 ? transformedRecord : undefined,
    errors,
    warnings,
  };
}

/**
 * Normalize a single value using normalization rules
 */
export function normalizeValue(
  value: unknown,
  ruleType: NormalizationRule["ruleType"],
  ruleConfig: Record<string, unknown>,
): { normalizedValue: unknown; error: TransformationError | null } {
  try {
    switch (ruleType) {
      case "unit_conversion": {
        if (typeof value !== "number") {
          return {
            normalizedValue: null,
            error: {
              fieldName: "",
              errorCode: "TYPE_COERCION_FAILED",
              errorMessage: "Value must be a number for unit conversion",
              sourceValue: value,
              attemptedTargetType: "number",
            },
          };
        }
        const factor = ruleConfig.conversionFactor as number || 1;
        return { normalizedValue: value * factor, error: null };
      }

      case "string_normalization": {
        if (typeof value !== "string") {
          return {
            normalizedValue: String(value),
            error: null,
          };
        }
        const normalized = value.trim().toLowerCase();
        return { normalizedValue: normalized, error: null };
      }

      case "date_parsing": {
        const dateVal = new Date(value as string);
        if (isNaN(dateVal.getTime())) {
          return {
            normalizedValue: null,
            error: {
              fieldName: "",
              errorCode: "TRANSFORMATION_FAILED",
              errorMessage: "Could not parse value as date",
              sourceValue: value,
              attemptedTargetType: "date",
            },
          };
        }
        return { normalizedValue: dateVal, error: null };
      }

      case "type_coercion": {
        const targetType = ruleConfig.targetType as string || "string";
        try {
          let coerced: unknown = value;
          if (targetType === "number") coerced = Number(value);
          else if (targetType === "boolean") coerced = Boolean(value);
          else if (targetType === "string") coerced = String(value);
          return { normalizedValue: coerced, error: null };
        } catch {
          return {
            normalizedValue: null,
            error: {
              fieldName: "",
              errorCode: "TYPE_COERCION_FAILED",
              errorMessage: `Could not coerce value to ${targetType}`,
              sourceValue: value,
              attemptedTargetType: targetType,
            },
          };
        }
      }

      case "value_mapping": {
        const mapping = ruleConfig.mapping as Record<string, unknown>;
        const mappedValue = mapping[String(value)];
        if (mappedValue === undefined) {
          return {
            normalizedValue: ruleConfig.defaultValue || value,
            error: null,
          };
        }
        return { normalizedValue: mappedValue, error: null };
      }

      case "format_standardization":
      case "aggregation":
      default:
        return { normalizedValue: value, error: null };
    }
  } catch (err) {
    return {
      normalizedValue: null,
      error: {
        fieldName: "",
        errorCode: "TRANSFORMATION_FAILED",
        errorMessage: String(err),
        sourceValue: value,
        attemptedTargetType: ruleType,
      },
    };
  }
}

/**
 * Transform a complete record using mapping and normalization
 */
export function transformRecord(
  sourceRecord: Record<string, unknown>,
  mappingRules: FieldMappingRule[],
  normalizationRules?: NormalizationRule[],
): TransformationResult {
  const startTime = Date.now();

  // Step 1: Apply field mapping
  const mappingResult = applyFieldMapping(sourceRecord, mappingRules);

  if (!mappingResult.success) {
    return {
      ...mappingResult,
      transformationTimeMs: Date.now() - startTime,
    };
  }

  // Step 2: Apply normalization rules
  let normalizedRecord = mappingResult.transformedRecord || {};
  const appliedRules: string[] = [];

  if (normalizationRules) {
    for (const rule of normalizationRules.filter(r => r.enabled)) {
      if (rule.fieldName in normalizedRecord) {
        const { normalizedValue, error } = normalizeValue(
          normalizedRecord[rule.fieldName],
          rule.ruleType,
          rule.ruleConfig,
        );

        if (error) {
          mappingResult.errors.push({ ...error, fieldName: rule.fieldName });
        } else {
          normalizedRecord[rule.fieldName] = normalizedValue;
          appliedRules.push(rule.ruleId);
        }
      }
    }
  }

  return {
    success: mappingResult.errors.length === 0,
    sourceRecord,
    transformedRecord: mappingResult.errors.length === 0 ? normalizedRecord : undefined,
    errors: mappingResult.errors,
    warnings: mappingResult.warnings,
    transformationTimeMs: Date.now() - startTime,
    appliedRules,
  };
}

/**
 * Auto-detect schema alignment between source and target
 */
export function detectSchemaAlignment(
  sourceProfile: DataSourceProfile,
  targetProfile: DataSourceProfile,
  similarityThreshold: number = 0.7,
): SchemaAlignmentSuggestion[] {
  const suggestions: SchemaAlignmentSuggestion[] = [];
  const sourceFields = sourceProfile.fields.map(f => f.fieldName.toLowerCase());
  const targetFields = targetProfile.fields.map(f => ({ name: f.fieldName, lowerName: f.fieldName.toLowerCase() }));

  for (const sourceField of sourceProfile.fields) {
    const sourceFieldLower = sourceField.fieldName.toLowerCase();

    // Exact match
    const exactMatch = targetFields.find(t => t.lowerName === sourceFieldLower);
    if (exactMatch) {
      suggestions.push({
        suggestionId: `${sourceField.fieldName}_${exactMatch.name}`,
        sourceField: sourceField.fieldName,
        targetField: exactMatch.name,
        confidence: 1.0,
        reason: "exact_name_match",
      });
      continue;
    }

    // Partial match (contains logic)
    const partialMatches = targetFields.filter(t =>
      t.lowerName.includes(sourceFieldLower) || sourceFieldLower.includes(t.lowerName)
    );

    if (partialMatches.length > 0) {
      for (const match of partialMatches) {
        const confidence = Math.min(
          Math.max(sourceFieldLower.length, match.lowerName.length) /
          Math.min(sourceFieldLower.length, match.lowerName.length),
          1.0,
        );

        if (confidence >= similarityThreshold) {
          suggestions.push({
            suggestionId: `${sourceField.fieldName}_${match.name}`,
            sourceField: sourceField.fieldName,
            targetField: match.name,
            confidence: 0.5,
            reason: "semantic_similarity",
          });
        }
      }
    }
  }

  return suggestions;
}
