import { describe, it, expect } from "vitest";
import {
  CaseStudySchema,
  CaseStudySourceSchema,
  CASE_STUDY_LIBRARY,
  filterCaseStudies,
  getCaseStudyById,
  toBlindTestCaseStudy,
  listIndustries,
  listTags,
} from "../../domain/case-studies";

describe("CaseStudySourceSchema", () => {
  it("accepts a valid source with url", () => {
    expect(() =>
      CaseStudySourceSchema.parse({
        title: "NIST MEP Case Studies",
        url: "https://www.nist.gov/mep/success-stories",
        publisher: "NIST",
        year: 2022,
        license_or_allowed_use: "US Government public domain",
      })
    ).not.toThrow();
  });

  it("accepts a valid source without optional url", () => {
    expect(() =>
      CaseStudySourceSchema.parse({
        title: "Manual summary",
        publisher: "Internal",
        license_or_allowed_use: "Internal summary only",
      })
    ).not.toThrow();
  });

  it("rejects source with invalid url", () => {
    expect(() =>
      CaseStudySourceSchema.parse({
        title: "Bad source",
        url: "not-a-url",
        publisher: "X",
        license_or_allowed_use: "public",
      })
    ).toThrow();
  });

  it("rejects source missing required fields", () => {
    expect(() =>
      CaseStudySourceSchema.parse({ title: "Missing publisher" })
    ).toThrow();
  });
});

describe("CaseStudySchema", () => {
  const validCase = {
    case_id: "CS-TEST",
    industry: "retail",
    business_size: "small",
    symptoms: ["declining revenue"],
    available_data: ["bank statements"],
    hidden_root_causes: ["pricing failure"],
    expert_identified_causes: ["pricing failure"],
    actions_taken: ["raised prices"],
    actual_outcome: "Revenue recovered 20%",
    sources: [
      {
        title: "Public Report",
        publisher: "Government",
        license_or_allowed_use: "public domain",
      },
    ],
    confidence: "medium",
  };

  it("accepts a valid case study", () => {
    expect(() => CaseStudySchema.parse(validCase)).not.toThrow();
  });

  it("applies default empty tags array", () => {
    const result = CaseStudySchema.parse(validCase);
    expect(result.tags).toEqual([]);
  });

  it("accepts explicit tags", () => {
    const result = CaseStudySchema.parse({ ...validCase, tags: ["retail", "pricing"] });
    expect(result.tags).toEqual(["retail", "pricing"]);
  });

  it("rejects invalid business_size", () => {
    expect(() =>
      CaseStudySchema.parse({ ...validCase, business_size: "startup" })
    ).toThrow();
  });

  it("rejects invalid confidence", () => {
    expect(() =>
      CaseStudySchema.parse({ ...validCase, confidence: "very-high" })
    ).toThrow();
  });

  it("rejects empty symptoms array", () => {
    expect(() =>
      CaseStudySchema.parse({ ...validCase, symptoms: [] })
    ).toThrow();
  });

  it("rejects missing case_id", () => {
    const { case_id: _, ...rest } = validCase;
    expect(() => CaseStudySchema.parse(rest)).toThrow();
  });

  it("rejects case with no sources", () => {
    expect(() =>
      CaseStudySchema.parse({ ...validCase, sources: [] })
    ).toThrow();
  });
});

describe("CASE_STUDY_LIBRARY", () => {
  it("contains at least 5 case studies", () => {
    expect(CASE_STUDY_LIBRARY.length).toBeGreaterThanOrEqual(5);
  });

  it("all case studies pass schema validation", () => {
    for (const cs of CASE_STUDY_LIBRARY) {
      expect(() => CaseStudySchema.parse(cs)).not.toThrow();
    }
  });

  it("all case_ids are unique", () => {
    const ids = CASE_STUDY_LIBRARY.map((cs) => cs.case_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all case studies have at least one source with license_or_allowed_use", () => {
    for (const cs of CASE_STUDY_LIBRARY) {
      for (const src of cs.sources) {
        expect(src.license_or_allowed_use.length).toBeGreaterThan(0);
      }
    }
  });

  it("all case studies have non-empty hidden_root_causes", () => {
    for (const cs of CASE_STUDY_LIBRARY) {
      expect(cs.hidden_root_causes.length).toBeGreaterThan(0);
    }
  });

  it("all case studies have non-empty expert_identified_causes", () => {
    for (const cs of CASE_STUDY_LIBRARY) {
      expect(cs.expert_identified_causes.length).toBeGreaterThan(0);
    }
  });
});

describe("filterCaseStudies", () => {
  it("returns all studies with empty filter", () => {
    const result = filterCaseStudies({});
    expect(result.length).toBe(CASE_STUDY_LIBRARY.length);
  });

  it("filters by industry", () => {
    const result = filterCaseStudies({ industry: "retail" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((cs) => cs.industry === "retail")).toBe(true);
  });

  it("filters by business_size", () => {
    const result = filterCaseStudies({ business_size: "small" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((cs) => cs.business_size === "small")).toBe(true);
  });

  it("filters by confidence", () => {
    const result = filterCaseStudies({ confidence: "high" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((cs) => cs.confidence === "high")).toBe(true);
  });

  it("filters by tags (single tag)", () => {
    const result = filterCaseStudies({ tags: ["inventory"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((cs) => cs.tags.includes("inventory"))).toBe(true);
  });

  it("filters by multiple tags (AND semantics)", () => {
    const result = filterCaseStudies({ tags: ["cash-flow", "inventory"] });
    expect(result.every((cs) => cs.tags.includes("cash-flow") && cs.tags.includes("inventory"))).toBe(true);
  });

  it("returns empty array for non-existent industry", () => {
    const result = filterCaseStudies({ industry: "aerospace" });
    expect(result).toEqual([]);
  });

  it("combines multiple filters", () => {
    const result = filterCaseStudies({ industry: "restaurant", business_size: "small" });
    expect(result.every((cs) => cs.industry === "restaurant" && cs.business_size === "small")).toBe(true);
  });

  it("works with custom library", () => {
    const miniLibrary = CASE_STUDY_LIBRARY.slice(0, 2);
    const result = filterCaseStudies({}, miniLibrary);
    expect(result.length).toBe(2);
  });
});

describe("getCaseStudyById", () => {
  it("returns the matching case study", () => {
    const cs = getCaseStudyById("CS-001");
    expect(cs).toBeDefined();
    expect(cs?.case_id).toBe("CS-001");
  });

  it("returns undefined for unknown id", () => {
    expect(getCaseStudyById("CS-UNKNOWN")).toBeUndefined();
  });

  it("works with custom library", () => {
    const miniLibrary = [CASE_STUDY_LIBRARY[0]];
    expect(getCaseStudyById("CS-001", miniLibrary)).toBeDefined();
    expect(getCaseStudyById("CS-002", miniLibrary)).toBeUndefined();
  });
});

describe("toBlindTestCaseStudy", () => {
  it("omits hidden_root_causes and actual_outcome", () => {
    const cs = CASE_STUDY_LIBRARY[0];
    const blind = toBlindTestCaseStudy(cs);
    expect(blind).not.toHaveProperty("hidden_root_causes");
    expect(blind).not.toHaveProperty("actual_outcome");
    expect(blind.blind_mode).toBe(true);
  });

  it("retains expert_identified_causes and other fields", () => {
    const cs = CASE_STUDY_LIBRARY[0];
    const blind = toBlindTestCaseStudy(cs);
    expect(blind.expert_identified_causes.length).toBeGreaterThan(0);
    expect(blind.case_id).toBe(cs.case_id);
    expect(blind.symptoms.length).toBeGreaterThan(0);
  });
});

describe("listIndustries", () => {
  it("returns sorted unique industries", () => {
    const industries = listIndustries();
    expect(industries.length).toBeGreaterThan(0);
    expect([...industries].sort()).toEqual(industries);
    expect(new Set(industries).size).toBe(industries.length);
  });

  it("includes known industries from library", () => {
    const industries = listIndustries();
    expect(industries).toContain("retail");
    expect(industries).toContain("restaurant");
  });
});

describe("listTags", () => {
  it("returns sorted unique tags", () => {
    const tags = listTags();
    expect(tags.length).toBeGreaterThan(0);
    expect([...tags].sort()).toEqual(tags);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("includes known tags from library", () => {
    const tags = listTags();
    expect(tags).toContain("inventory");
    expect(tags).toContain("cash-flow");
  });
});
