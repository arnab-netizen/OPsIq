import { describe, it, expect } from "vitest";
import {
  assessInputQuality,
  assertAllowsStrongRecommendation,
  assertAllowsHighRiskAction,
  CRITICAL_FIELDS,
  HIGH_RISK_ACTION_BLOCKING_FIELDS,
  type InputFieldValue,
  type InputQualityAssessmentInput,
} from "@/domain/owner-mode/input-quality";

const WS = "00000000-0000-0000-0000-000000000001";

function makeField(
  field: InputFieldValue["field"],
  value: number | null = 100,
  opts: Partial<InputFieldValue> = {}
): InputFieldValue {
  return {
    field,
    value,
    isEstimate: false,
    freshness: "current",
    ...opts,
  };
}

function completeInput(): InputQualityAssessmentInput {
  return {
    workspaceId: WS,
    fields: [
      makeField("revenue", 500000),
      makeField("gross_margin", 45),
      makeField("net_profit", 30000),
      makeField("cash_balance", 120000),
      makeField("cash_runway", 6),
      makeField("leads", 200),
      makeField("conversion_rate", 12),
    ],
  };
}

// ─── Critical field registry ──────────────────────────────────────────────────

describe("CRITICAL_FIELDS and HIGH_RISK_ACTION_BLOCKING_FIELDS", () => {
  it("CRITICAL_FIELDS includes revenue, gross_margin, net_profit, cash_balance, cash_runway", () => {
    expect(CRITICAL_FIELDS.has("revenue")).toBe(true);
    expect(CRITICAL_FIELDS.has("gross_margin")).toBe(true);
    expect(CRITICAL_FIELDS.has("net_profit")).toBe(true);
    expect(CRITICAL_FIELDS.has("cash_balance")).toBe(true);
    expect(CRITICAL_FIELDS.has("cash_runway")).toBe(true);
  });

  it("HIGH_RISK_ACTION_BLOCKING_FIELDS includes cash_balance, cash_runway, debt_emi", () => {
    expect(HIGH_RISK_ACTION_BLOCKING_FIELDS.has("cash_balance")).toBe(true);
    expect(HIGH_RISK_ACTION_BLOCKING_FIELDS.has("cash_runway")).toBe(true);
    expect(HIGH_RISK_ACTION_BLOCKING_FIELDS.has("debt_emi")).toBe(true);
  });
});

// ─── Complete input ───────────────────────────────────────────────────────────

describe("assessInputQuality — complete input", () => {
  it("returns complete status when all required fields are present and fresh", () => {
    const result = assessInputQuality(completeInput());
    expect(result.qualityStatus).toBe("complete");
  });

  it("returns score > 90 for complete input", () => {
    const result = assessInputQuality(completeInput());
    expect(result.overallScore).toBeGreaterThan(90);
  });

  it("allows strong recommendation for complete input", () => {
    const result = assessInputQuality(completeInput());
    expect(result.allowsStrongRecommendation).toBe(true);
  });

  it("allows high-risk action for complete input", () => {
    const result = assessInputQuality(completeInput());
    expect(result.allowsHighRiskAction).toBe(true);
  });

  it("has no missing fields for complete input", () => {
    const result = assessInputQuality(completeInput());
    expect(result.missingFields).toHaveLength(0);
  });
});

// ─── Missing margin ───────────────────────────────────────────────────────────

describe("assessInputQuality — missing gross_margin", () => {
  it("returns critical_missing when gross_margin is absent", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "gross_margin"),
    };
    const result = assessInputQuality(input);
    expect(result.qualityStatus).toBe("critical_missing");
  });

  it("blocks strong recommendation when gross_margin is absent", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "gross_margin"),
    };
    const result = assessInputQuality(input);
    expect(result.allowsStrongRecommendation).toBe(false);
  });

  it("marks gross_margin as critical severity in missing fields", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "gross_margin"),
    };
    const result = assessInputQuality(input);
    const missing = result.missingFields.find((f) => f.field === "gross_margin");
    expect(missing?.severity).toBe("critical");
    expect(missing?.blocksStrongRecommendation).toBe(true);
  });
});

// ─── Missing cash runway ──────────────────────────────────────────────────────

describe("assessInputQuality — missing cash_runway", () => {
  it("returns critical_missing when cash_runway is absent", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "cash_runway"),
    };
    const result = assessInputQuality(input);
    expect(result.qualityStatus).toBe("critical_missing");
  });

  it("blocks high-risk action when cash_runway is absent", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "cash_runway"),
    };
    const result = assessInputQuality(input);
    expect(result.allowsHighRiskAction).toBe(false);
  });

  it("marks cash_runway as blocksHighRiskAction in missing fields", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "cash_runway"),
    };
    const result = assessInputQuality(input);
    const missing = result.missingFields.find((f) => f.field === "cash_runway");
    expect(missing?.blocksHighRiskAction).toBe(true);
  });
});

// ─── Stale data ───────────────────────────────────────────────────────────────

describe("assessInputQuality — stale data", () => {
  it("marks data_limited or stale when critical field is stale", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.map((f) =>
        f.field === "cash_balance"
          ? { ...f, freshness: "stale" as const }
          : f
      ),
    };
    const result = assessInputQuality(input);
    expect(["stale", "data_limited", "partial"]).toContain(result.qualityStatus);
    expect(result.staleFields).toContain("cash_balance");
  });

  it("stale data does not allow high-risk action when stale field blocks it", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.map((f) =>
        f.field === "cash_runway"
          ? { ...f, freshness: "stale" as const }
          : f
      ),
    };
    const result = assessInputQuality(input);
    expect(result.allowsHighRiskAction).toBe(false);
  });

  it("non-critical stale field lowers score but may not block recommendation", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.map((f) =>
        f.field === "leads" ? { ...f, freshness: "stale" as const } : f
      ),
    };
    const result = assessInputQuality(input);
    expect(result.staleFields).toContain("leads");
    // Non-critical stale does not block strong rec
    expect(result.allowsStrongRecommendation).toBe(true);
  });
});

// ─── Conflicting data ─────────────────────────────────────────────────────────

describe("assessInputQuality — conflicting data", () => {
  it("returns conflicting status when a field has conflicting value", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.map((f) =>
        f.field === "revenue"
          ? { ...f, conflictingValue: 999999 }
          : f
      ),
    };
    const result = assessInputQuality(input);
    expect(result.qualityStatus).toBe("conflicting");
    expect(result.conflictFields).toContain("revenue");
  });

  it("blocks strong recommendation when data is conflicting", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.map((f) =>
        f.field === "revenue" ? { ...f, conflictingValue: 1 } : f
      ),
    };
    const result = assessInputQuality(input);
    expect(result.allowsStrongRecommendation).toBe(false);
  });
});

// ─── Owner estimate only ──────────────────────────────────────────────────────

describe("assessInputQuality — owner estimate only", () => {
  it("returns owner_estimate_only when all provided fields are estimates", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.map((f) => ({ ...f, isEstimate: true })),
    };
    const result = assessInputQuality(input);
    expect(result.qualityStatus).toBe("owner_estimate_only");
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("assessInputQuality — workspace scoping", () => {
  it("throws when workspaceId is missing", () => {
    expect(() =>
      assessInputQuality({ workspaceId: "", fields: completeInput().fields })
    ).toThrow();
  });

  it("returns correct workspaceId in result", () => {
    const result = assessInputQuality(completeInput());
    expect(result.workspaceId).toBe(WS);
  });
});

// ─── Guardrail functions ──────────────────────────────────────────────────────

describe("assertAllowsStrongRecommendation", () => {
  it("does not throw for complete input", () => {
    const result = assessInputQuality(completeInput());
    expect(() => assertAllowsStrongRecommendation(result)).not.toThrow();
  });

  it("throws for critical_missing status", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter(
        (f) => f.field !== "revenue" && f.field !== "gross_margin"
      ),
    };
    const result = assessInputQuality(input);
    expect(() => assertAllowsStrongRecommendation(result)).toThrow();
  });
});

describe("assertAllowsHighRiskAction", () => {
  it("does not throw for complete input", () => {
    const result = assessInputQuality(completeInput());
    expect(() => assertAllowsHighRiskAction(result)).not.toThrow();
  });

  it("throws when cash_runway is missing", () => {
    const input: InputQualityAssessmentInput = {
      workspaceId: WS,
      fields: completeInput().fields.filter((f) => f.field !== "cash_runway"),
    };
    const result = assessInputQuality(input);
    expect(() => assertAllowsHighRiskAction(result)).toThrow();
  });
});

// ─── assessedBy invariant ─────────────────────────────────────────────────────

describe("assessedBy invariant", () => {
  it("always returns InputQualityService as assessedBy", () => {
    const result = assessInputQuality(completeInput());
    expect(result.assessedBy).toBe("InputQualityService");
  });
});
