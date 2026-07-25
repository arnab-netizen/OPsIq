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

  it("should parse daysOfHistory=7 as string '7'", () => {
    const params = new URLSearchParams("daysOfHistory=7");
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("7");
  });

  it("should parse daysOfHistory=90 as string '90'", () => {
    const params = new URLSearchParams("daysOfHistory=90");
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("90");
  });

  it("should parse daysOfHistory=365 as string '365'", () => {
    const params = new URLSearchParams("daysOfHistory=365");
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("365");
  });

  it("should parse daysOfHistory=1 as string '1' (boundary)", () => {
    const params = new URLSearchParams("daysOfHistory=1");
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("1");
  });

  it("should reject includeKPIs=TRUE (enum is case-sensitive)", () => {
    const params = new URLSearchParams("includeKPIs=TRUE");
    expect(() => parseOwnerDashboardQuery(params)).toThrow(z.ZodError);
  });

  it("should reject includeKPIs=FALSE (enum is case-sensitive)", () => {
    const params = new URLSearchParams("includeKPIs=FALSE");
    expect(() => parseOwnerDashboardQuery(params)).toThrow(z.ZodError);
  });

  it("should reject includeKPIs=1 (not a valid enum value)", () => {
    const params = new URLSearchParams("includeKPIs=1");
    expect(() => parseOwnerDashboardQuery(params)).toThrow(z.ZodError);
  });

  it("should accept daysOfHistory=0 as string '0' (service-layer validates range)", () => {
    const params = new URLSearchParams("daysOfHistory=0");
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("0");
  });

  it("empty daysOfHistory param converts to default via falsy coercion", () => {
    const params = new URLSearchParams("daysOfHistory=");
    const result = parseOwnerDashboardQuery(params);
    expect(result.daysOfHistory).toBe("30");
  });

  it("should parse both explicit params: includeKPIs=true and daysOfHistory=7", () => {
    const params = new URLSearchParams("includeKPIs=true&daysOfHistory=7");
    const result = parseOwnerDashboardQuery(params);
    expect(result.includeKPIs).toBe("true");
    expect(result.daysOfHistory).toBe("7");
  });

  it("result has exactly includeKPIs and daysOfHistory keys", () => {
    const params = new URLSearchParams("");
    const result = parseOwnerDashboardQuery(params);
    expect(Object.keys(result).sort()).toEqual(["daysOfHistory", "includeKPIs"]);
  });
});
