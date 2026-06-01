import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

// Replicate the parser to test it
const querySchema = z.object({
  includeKPIs: z.enum(["true", "false"]).optional().default("true"),
  daysOfHistory: z.string().optional().default("30"),
});

function parseOwnerDashboardQuery(searchParams: URLSearchParams) {
  return querySchema.parse({
    includeKPIs: searchParams.get("includeKPIs") || undefined,
    daysOfHistory: searchParams.get("daysOfHistory") || undefined,
  });
}

describe("Owner Dashboard Query Parsing", () => {
  it("should apply defaults when no query params are provided", () => {
    const params = new URLSearchParams("");
    const result = parseOwnerDashboardQuery(params);

    expect(result.includeKPIs).toBe("true");
    expect(result.daysOfHistory).toBe("30");
  });

  it("should parse includeKPIs=true", () => {
    const params = new URLSearchParams("includeKPIs=true");
    const result = parseOwnerDashboardQuery(params);

    expect(result.includeKPIs).toBe("true");
    expect(result.daysOfHistory).toBe("30");
  });

  it("should parse includeKPIs=false", () => {
    const params = new URLSearchParams("includeKPIs=false");
    const result = parseOwnerDashboardQuery(params);

    expect(result.includeKPIs).toBe("false");
    expect(result.daysOfHistory).toBe("30");
  });

  it("should parse valid daysOfHistory=30", () => {
    const params = new URLSearchParams("daysOfHistory=30");
    const result = parseOwnerDashboardQuery(params);

    expect(result.includeKPIs).toBe("true");
    expect(result.daysOfHistory).toBe("30");
  });

  it("should parse both params together", () => {
    const params = new URLSearchParams("includeKPIs=false&daysOfHistory=60");
    const result = parseOwnerDashboardQuery(params);

    expect(result.includeKPIs).toBe("false");
    expect(result.daysOfHistory).toBe("60");
  });

  it("should reject invalid includeKPIs value", () => {
    const params = new URLSearchParams("includeKPIs=invalid");

    expect(() => parseOwnerDashboardQuery(params)).toThrow(z.ZodError);
  });

  it("should accept any string for daysOfHistory (validation deferred to service layer)", () => {
    const params = new URLSearchParams("daysOfHistory=not-a-number");

    // Schema accepts any string; service layer will validate it's a safe positive integer
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("not-a-number");
  });

  it("should convert null from searchParams.get() to undefined for defaults", () => {
    const params = new URLSearchParams("");

    // Verify searchParams.get() returns null when param is missing
    expect(params.get("includeKPIs")).toBeNull();
    expect(params.get("daysOfHistory")).toBeNull();

    // Verify our parser converts null to undefined and applies defaults
    const result = parseOwnerDashboardQuery(params);
    expect(result.includeKPIs).toBe("true");
    expect(result.daysOfHistory).toBe("30");
  });

  it("should handle partial query params correctly", () => {
    const params = new URLSearchParams("includeKPIs=false");

    expect(params.get("includeKPIs")).toBe("false");
    expect(params.get("daysOfHistory")).toBeNull();

    const result = parseOwnerDashboardQuery(params);
    expect(result.includeKPIs).toBe("false");
    expect(result.daysOfHistory).toBe("30");
  });
});
