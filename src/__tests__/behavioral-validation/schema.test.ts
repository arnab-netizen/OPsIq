import { describe, it, expect } from "vitest";
import {
  BUSINESS_ARCHETYPES,
  DECISION_CATEGORIES,
  FAILURE_LABELS,
  UNSAFE_RULES,
  RUBRIC_DIMENSIONS,
  behavioralCaseSchema,
  learningArtifactSchema,
  locationContextSchema,
} from "@/behavioral-validation/schema";

describe("behavioral-validation schema — module contract assertions", () => {
  it("BUSINESS_ARCHETYPES is an array of length 12", () => {
    expect(Array.isArray(BUSINESS_ARCHETYPES)).toBe(true);
    expect(BUSINESS_ARCHETYPES.length).toBe(12);
  });
  it("DECISION_CATEGORIES is an array of length 8", () => {
    expect(Array.isArray(DECISION_CATEGORIES)).toBe(true);
    expect(DECISION_CATEGORIES.length).toBe(8);
  });
  it("FAILURE_LABELS is an array of length 20", () => {
    expect(Array.isArray(FAILURE_LABELS)).toBe(true);
    expect(FAILURE_LABELS.length).toBe(20);
  });
  it("UNSAFE_RULES is an array of length 20", () => {
    expect(Array.isArray(UNSAFE_RULES)).toBe(true);
    expect(UNSAFE_RULES.length).toBe(20);
  });
  it("RUBRIC_DIMENSIONS is an object", () => {
    expect(typeof RUBRIC_DIMENSIONS).toBe("object");
  });
  it("RUBRIC_DIMENSIONS values sum to 100", () => {
    const total = Object.values(RUBRIC_DIMENSIONS).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });
  it("behavioralCaseSchema is defined", () => {
    expect(behavioralCaseSchema).toBeDefined();
  });
  it("behavioralCaseSchema.parse is a function", () => {
    expect(typeof behavioralCaseSchema.parse).toBe("function");
  });
  it("learningArtifactSchema is defined", () => {
    expect(learningArtifactSchema).toBeDefined();
  });
  it("learningArtifactSchema.parse is a function", () => {
    expect(typeof learningArtifactSchema.parse).toBe("function");
  });
  it("locationContextSchema is defined", () => {
    expect(locationContextSchema).toBeDefined();
  });
  it("locationContextSchema.parse is a function", () => {
    expect(typeof locationContextSchema.parse).toBe("function");
  });
  it("all BUSINESS_ARCHETYPES entries are strings", () => {
    for (const a of BUSINESS_ARCHETYPES) expect(typeof a).toBe("string");
  });
  it("all DECISION_CATEGORIES entries are strings", () => {
    for (const a of DECISION_CATEGORIES) expect(typeof a).toBe("string");
  });
  it("all FAILURE_LABELS entries are strings", () => {
    for (const a of FAILURE_LABELS) expect(typeof a).toBe("string");
  });
});

describe("behavioral-validation schema", () => {
  it("has 12 archetypes, 8 decision categories, 20 failure labels, 20 unsafe rules", () => {
    expect(BUSINESS_ARCHETYPES.length).toBe(12);
    expect(DECISION_CATEGORIES.length).toBe(8);
    expect(FAILURE_LABELS.length).toBe(20);
    expect(UNSAFE_RULES.length).toBe(20);
  });

  it("rubric dimensions sum to exactly 100", () => {
    const total = Object.values(RUBRIC_DIMENSIONS).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });

  it("rejects a location missing required local context", () => {
    expect(() => locationContextSchema.parse({ country: "X" })).toThrow();
  });

  it("rejects a case missing hidden root cause / proof / reassessment", () => {
    expect(() =>
      behavioralCaseSchema.parse({ id: "x", sourceSeedCaseId: "x", title: "t" }),
    ).toThrow();
  });

  it("accepts a fully-formed learning artifact and rejects an empty audit trail", () => {
    const base = {
      id: "a::v1", sourceCaseId: "a", businessType: "laundry", archetype: "laundry_dry_cleaning",
      locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "x",
      correctedBehavior: "y", applicabilityScope: { archetype: "laundry_dry_cleaning", decisionCategory: null, locationKey: null },
      riskLevel: "high", approvalStatus: "pending", scope: "local_only", privacyClassification: "workspace_private",
      workspaceId: "ws", version: 1, supersededByVersion: null, active: true, createdAt: "2026-06-29T00:00:00Z",
      auditTrail: [{ at: "2026-06-29T00:00:00Z", actor: "t", action: "created" }],
    };
    expect(() => learningArtifactSchema.parse(base)).not.toThrow();
    expect(() => learningArtifactSchema.parse({ ...base, auditTrail: [] })).toThrow();
  });
});
