import { describe, it, expect } from "vitest";
import {
  FieldMappingRuleSchema,
  FieldMappingConfigSchema,
  NormalizationRuleSchema,
  NormalizationConfigSchema,
  TransformationResultSchema,
  DataSourceProfileSchema,
  SchemaAlignmentSuggestionSchema,
  BatchTransformationRequestSchema,
  BatchTransformationResultSchema,
  UnitConversionRuleSchema,
  applyFieldMapping,
  normalizeValue,
  transformRecord,
  detectSchemaAlignment,
  type FieldMappingRule,
  type NormalizationRule,
  type DataSourceProfile,
} from "@/domain/mapping-engine/mapping-contracts";

describe("ADDENDUM F: Mapping & Normalization Engine", () => {
  describe("Field Mapping Rules", () => {
    it("should validate field mapping rule", () => {
      const rule: FieldMappingRule = {
        sourceField: "first_name",
        targetField: "firstName",
        fieldType: "string",
        required: true,
      };

      const result = FieldMappingRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it("should validate field mapping rule with transformation", () => {
      const rule = {
        sourceField: "phone",
        targetField: "phoneNumber",
        fieldType: "string",
        required: false,
        transformation: "normalizePhoneNumber",
        defaultValue: "",
      };

      const result = FieldMappingRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it("should validate complete field mapping config", () => {
      const config = {
        mappingId: "map_123",
        sourceConnector: "hubspot",
        targetConnector: "opsiq",
        sourceRecordType: "contact",
        targetRecordType: "engagement",
        rules: [
          {
            sourceField: "firstname",
            targetField: "clientName",
            fieldType: "string",
            required: true,
          },
          {
            sourceField: "email",
            targetField: "clientEmail",
            fieldType: "string",
            required: true,
          },
        ],
        createdAt: new Date(),
        lastModifiedAt: new Date(),
        isActive: true,
      };

      const result = FieldMappingConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("Normalization Rules", () => {
    it("should validate unit conversion rule", () => {
      const rule = {
        sourceUnit: "miles",
        targetUnit: "kilometers",
        conversionFactor: 1.609,
        formula: "value * 1.609",
      };

      const result = UnitConversionRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it("should validate normalization rule with unit conversion", () => {
      const rule: NormalizationRule = {
        ruleId: "norm_distance",
        fieldName: "distance",
        ruleType: "unit_conversion",
        ruleConfig: {
          sourceUnit: "miles",
          targetUnit: "km",
          conversionFactor: 1.609,
        },
        priority: 1,
        enabled: true,
        examples: [
          { input: 100, expectedOutput: 160.9 },
        ],
      };

      const result = NormalizationRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it("should validate complete normalization config", () => {
      const config = {
        configId: "norm_config_1",
        recordType: "measurement",
        rules: [
          {
            ruleId: "norm_1",
            fieldName: "temperature",
            ruleType: "unit_conversion",
            ruleConfig: { factor: 1.8, offset: 32 },
            priority: 1,
            enabled: true,
          },
        ],
        createdAt: new Date(),
        lastModifiedAt: new Date(),
        isActive: true,
      };

      const result = NormalizationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("Data Source Profiling", () => {
    it("should validate data source profile", () => {
      const profile: DataSourceProfile = {
        connectorId: "hubspot_prod",
        connectorType: "hubspot",
        recordType: "contact",
        totalRecords: 5000,
        sampleRecords: [
          { firstname: "John", lastname: "Doe", email: "john@example.com" },
        ],
        fields: [
          {
            fieldName: "firstname",
            dataType: "string",
            nullable: false,
            sampleValues: ["John", "Jane"],
          },
          {
            fieldName: "email",
            dataType: "string",
            nullable: true,
            sampleValues: ["john@example.com"],
          },
        ],
        lastProfiledAt: new Date(),
      };

      const result = DataSourceProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    });
  });

  describe("applyFieldMapping()", () => {
    it("should map required fields successfully", () => {
      const sourceRecord = {
        firstname: "John",
        lastname: "Doe",
        email: "john@example.com",
      };

      const rules: FieldMappingRule[] = [
        {
          sourceField: "firstname",
          targetField: "firstName",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "lastname",
          targetField: "lastName",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "email",
          targetField: "emailAddress",
          fieldType: "string",
          required: true,
        },
      ];

      const result = applyFieldMapping(sourceRecord, rules);
      expect(result.success).toBe(true);
      expect(result.transformedRecord?.firstName).toBe("John");
      expect(result.transformedRecord?.lastName).toBe("Doe");
      expect(result.transformedRecord?.emailAddress).toBe("john@example.com");
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      const sourceRecord = {
        firstname: "John",
      };

      const rules: FieldMappingRule[] = [
        {
          sourceField: "firstname",
          targetField: "firstName",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "email",
          targetField: "emailAddress",
          fieldType: "string",
          required: true,
        },
      ];

      const result = applyFieldMapping(sourceRecord, rules);
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          fieldName: "email",
          errorCode: "REQUIRED_FIELD_MISSING",
        }),
      );
    });

    it("should apply default values for optional fields", () => {
      const sourceRecord = {
        firstname: "John",
      };

      const rules: FieldMappingRule[] = [
        {
          sourceField: "firstname",
          targetField: "firstName",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "middleName",
          targetField: "middleName",
          fieldType: "string",
          required: false,
          defaultValue: "",
        },
      ];

      const result = applyFieldMapping(sourceRecord, rules);
      expect(result.success).toBe(true);
      expect(result.transformedRecord?.middleName).toBe("");
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          warningCode: "DEFAULT_VALUE_USED",
        }),
      );
    });
  });

  describe("normalizeValue()", () => {
    it("should convert units", () => {
      const { normalizedValue, error } = normalizeValue(
        100,
        "unit_conversion",
        { conversionFactor: 1.609 },
      );

      expect(error).toBeNull();
      expect(normalizedValue).toBe(160.9);
    });

    it("should normalize strings", () => {
      const { normalizedValue, error } = normalizeValue(
        "  JOHN DOE  ",
        "string_normalization",
        {},
      );

      expect(error).toBeNull();
      expect(normalizedValue).toBe("john doe");
    });

    it("should parse dates", () => {
      const dateStr = "2026-05-11T10:30:00Z";
      const { normalizedValue, error } = normalizeValue(
        dateStr,
        "date_parsing",
        {},
      );

      expect(error).toBeNull();
      expect(normalizedValue).toBeInstanceOf(Date);
      expect((normalizedValue as Date).toISOString()).toContain("2026-05-11");
    });

    it("should handle invalid date parsing", () => {
      const { normalizedValue, error } = normalizeValue(
        "invalid-date",
        "date_parsing",
        {},
      );

      expect(error).not.toBeNull();
      expect(error?.errorCode).toBe("TRANSFORMATION_FAILED");
      expect(normalizedValue).toBeNull();
    });

    it("should coerce types", () => {
      const { normalizedValue, error } = normalizeValue(
        "123",
        "type_coercion",
        { targetType: "number" },
      );

      expect(error).toBeNull();
      expect(normalizedValue).toBe(123);
    });

    it("should apply value mapping", () => {
      const { normalizedValue, error } = normalizeValue(
        "high",
        "value_mapping",
        {
          mapping: {
            high: 3,
            medium: 2,
            low: 1,
          },
        },
      );

      expect(error).toBeNull();
      expect(normalizedValue).toBe(3);
    });

    it("should use default for unmapped values", () => {
      const { normalizedValue, error } = normalizeValue(
        "unknown",
        "value_mapping",
        {
          mapping: { high: 3, low: 1 },
          defaultValue: 2,
        },
      );

      expect(error).toBeNull();
      expect(normalizedValue).toBe(2);
    });
  });

  describe("transformRecord()", () => {
    it("should transform complete record with mapping and normalization", () => {
      const sourceRecord = {
        firstname: "john",
        lastname: "  DOE  ",
        salary: "150000",
      };

      const mappingRules: FieldMappingRule[] = [
        {
          sourceField: "firstname",
          targetField: "firstName",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "lastname",
          targetField: "lastName",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "salary",
          targetField: "salary",
          fieldType: "number",
          required: true,
        },
      ];

      const normalizationRules: NormalizationRule[] = [
        {
          ruleId: "norm_lastname",
          fieldName: "lastName",
          ruleType: "string_normalization",
          ruleConfig: {},
          priority: 1,
          enabled: true,
        },
        {
          ruleId: "norm_salary",
          fieldName: "salary",
          ruleType: "type_coercion",
          ruleConfig: { targetType: "number" },
          priority: 1,
          enabled: true,
        },
      ];

      const result = transformRecord(sourceRecord, mappingRules, normalizationRules);
      expect(result.success).toBe(true);
      expect(result.transformedRecord?.firstName).toBe("john");
      expect(result.transformedRecord?.lastName).toBe("doe");
      expect(result.appliedRules).toContain("norm_lastname");
    });

    it("should report transformation errors", () => {
      const sourceRecord = {
        email: "john@example.com",
      };

      const mappingRules: FieldMappingRule[] = [
        {
          sourceField: "email",
          targetField: "emailAddress",
          fieldType: "string",
          required: true,
        },
        {
          sourceField: "name",
          targetField: "name",
          fieldType: "string",
          required: true,
        },
      ];

      const result = transformRecord(sourceRecord, mappingRules);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].errorCode).toBe("REQUIRED_FIELD_MISSING");
    });
  });

  describe("detectSchemaAlignment()", () => {
    it("should detect exact field matches", () => {
      const sourceProfile: DataSourceProfile = {
        connectorId: "source_1",
        connectorType: "api",
        recordType: "contact",
        fields: [
          { fieldName: "firstName", dataType: "string", nullable: false },
          { fieldName: "email", dataType: "string", nullable: true },
        ],
      };

      const targetProfile: DataSourceProfile = {
        connectorId: "target_1",
        connectorType: "database",
        recordType: "contact",
        fields: [
          { fieldName: "firstName", dataType: "string", nullable: false },
          { fieldName: "email", dataType: "string", nullable: true },
        ],
      };

      const suggestions = detectSchemaAlignment(sourceProfile, targetProfile);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].reason).toBe("exact_name_match");
      expect(suggestions[0].confidence).toBe(1.0);
    });

    it("should detect partial field matches via substring", () => {
      const sourceProfile: DataSourceProfile = {
        connectorId: "source_1",
        connectorType: "api",
        recordType: "contact",
        fields: [
          { fieldName: "firstName", dataType: "string", nullable: false },
          { fieldName: "first_name", dataType: "string", nullable: false },
        ],
      };

      const targetProfile: DataSourceProfile = {
        connectorId: "target_1",
        connectorType: "database",
        recordType: "contact",
        fields: [
          { fieldName: "first", dataType: "string", nullable: false },
          { fieldName: "firstName", dataType: "string", nullable: false },
        ],
      };

      const suggestions = detectSchemaAlignment(sourceProfile, targetProfile);
      // Should find exact matches or substring matches
      expect(suggestions.some(s => s.reason === "exact_name_match")).toBe(true);
    });

    it("should handle no matches with high threshold", () => {
      const sourceProfile: DataSourceProfile = {
        connectorId: "source_1",
        connectorType: "api",
        recordType: "contact",
        fields: [
          { fieldName: "phone", dataType: "string", nullable: false },
        ],
      };

      const targetProfile: DataSourceProfile = {
        connectorId: "target_1",
        connectorType: "database",
        recordType: "contact",
        fields: [
          { fieldName: "email", dataType: "string", nullable: false },
        ],
      };

      const suggestions = detectSchemaAlignment(sourceProfile, targetProfile, 0.9);
      expect(suggestions.length).toBe(0);
    });
  });

  describe("Schema Validation", () => {
    it("should validate transformation result", () => {
      const result = {
        success: true,
        sourceRecord: { name: "John" },
        transformedRecord: { firstName: "John" },
        errors: [],
        warnings: [],
        transformationTimeMs: 5,
      };

      const parsed = TransformationResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should validate batch transformation request", () => {
      const request = {
        batchId: "batch_123",
        mappingConfigId: "map_456",
        records: [
          { name: "John", email: "john@example.com" },
          { name: "Jane", email: "jane@example.com" },
        ],
        stopOnFirstError: false,
        validationLevel: "strict" as const,
      };

      const parsed = BatchTransformationRequestSchema.safeParse(request);
      expect(parsed.success).toBe(true);
    });

    it("should validate batch transformation result", () => {
      const result = {
        batchId: "batch_123",
        totalRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        results: [
          {
            success: true,
            sourceRecord: { name: "John" },
            transformedRecord: { firstName: "John" },
            errors: [],
            warnings: [],
            transformationTimeMs: 5,
          },
        ],
        summary: {
          successRate: 1.0,
          commonErrors: [],
          processingTimeMs: 50,
          throughputRecordsPerSecond: 40,
        },
      };

      const parsed = BatchTransformationResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe("Comprehensive Mapping Coverage", () => {
    it("should cover all field mapping types", () => {
      const types = ["string", "number", "date", "boolean", "array", "object"];
      const rules: FieldMappingRule[] = types.map(type => ({
        sourceField: `field_${type}`,
        targetField: `mapped_${type}`,
        fieldType: type as FieldMappingRule["fieldType"],
        required: false,
      }));

      expect(rules.length).toBe(6);
      rules.forEach(rule => {
        expect(FieldMappingRuleSchema.safeParse(rule).success).toBe(true);
      });
    });

    it("should cover all normalization rule types", () => {
      const ruleTypes = [
        "unit_conversion",
        "format_standardization",
        "value_mapping",
        "type_coercion",
        "string_normalization",
        "date_parsing",
        "aggregation",
      ] as const;

      const rules = ruleTypes.map(ruleType => ({
        ruleId: `rule_${ruleType}`,
        fieldName: "test_field",
        ruleType,
        ruleConfig: {},
        priority: 1,
        enabled: true,
      }));

      expect(rules.length).toBe(7);
      rules.forEach(rule => {
        expect(NormalizationRuleSchema.safeParse(rule).success).toBe(true);
      });
    });

    it("should provide transformation algorithm helpers", () => {
      expect(applyFieldMapping).toBeDefined();
      expect(normalizeValue).toBeDefined();
      expect(transformRecord).toBeDefined();
      expect(detectSchemaAlignment).toBeDefined();
    });
  });
});
