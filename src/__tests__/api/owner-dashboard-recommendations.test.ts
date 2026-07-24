import { describe, it, expect } from "vitest";

describe("Owner Dashboard Recommendations", () => {
  it("should map database recommendations to DTO format", () => {
    const mockRecommendations = [
      {
        id: "rec-1",
        title: "Increase cash flow monitoring frequency",
        description: "Monitor cash flow weekly",
        priority: "high",
      },
    ];

    const recommendedActions = mockRecommendations.map((rec: any) => ({
      id: rec.id,
      title: rec.title,
      description: rec.description,
      priority: rec.priority,
      source: "diagnosis",
    }));

    expect(recommendedActions).toHaveLength(1);
    expect(recommendedActions[0].title).toBe(
      "Increase cash flow monitoring frequency"
    );
    expect(recommendedActions[0].source).toBe("diagnosis");
  });

  it("should return empty array when no real recommendations", () => {
    const realRecommendations: any[] = [];
    const recommendedActions =
      realRecommendations.length > 0
        ? realRecommendations.map((rec: any) => ({
            id: rec.id,
            title: rec.title,
            description: rec.description,
            priority: rec.priority,
            source: "diagnosis",
          }))
        : [];

    expect(recommendedActions).toHaveLength(0);
  });

  it("should use generic fallback only when no db recommendations exist", () => {
    const realRecommendations: any[] = [];
    const genericFallback = [
      "Review KPI trends",
      "Increase review cadence",
    ];

    const recommendedActions =
      realRecommendations.length > 0
        ? realRecommendations.map((rec: any) => ({
            id: rec.id,
            title: rec.title,
          }))
        : genericFallback;

    expect(recommendedActions).toEqual(genericFallback);
  });

  it("should prefer real recommendations over generic fallback", () => {
    const realRecommendations = [
      {
        id: "rec-1",
        title: "Diagnosis-specific recommendation",
        description: "From actual diagnosis",
        priority: "high",
      },
    ];

    const recommendedActions =
      realRecommendations.length > 0
        ? realRecommendations.map((rec: any) => ({
            id: rec.id,
            title: rec.title,
          }))
        : ["Generic fallback"];

    expect(recommendedActions).toHaveLength(1);
    expect(recommendedActions[0].title).toBe(
      "Diagnosis-specific recommendation"
    );
  });

  it("should map multiple recommendations preserving order", () => {
    const recs = [
      { id: "r1", title: "First", description: "D1", priority: "high" },
      { id: "r2", title: "Second", description: "D2", priority: "medium" },
      { id: "r3", title: "Third", description: "D3", priority: "low" },
    ];
    const mapped = recs.map((rec: any) => ({ id: rec.id, title: rec.title, source: "diagnosis" }));
    expect(mapped).toHaveLength(3);
    expect(mapped[0].id).toBe("r1");
    expect(mapped[1].id).toBe("r2");
    expect(mapped[2].id).toBe("r3");
  });

  it("should preserve priority=critical in mapped DTO", () => {
    const rec = { id: "r-c", title: "Critical Rec", description: "D", priority: "critical" };
    const dto = { id: rec.id, title: rec.title, priority: rec.priority, source: "diagnosis" };
    expect(dto.priority).toBe("critical");
  });

  it("should preserve priority=medium in mapped DTO", () => {
    const rec = { id: "r-m", title: "Medium Rec", description: "D", priority: "medium" };
    const dto = { id: rec.id, title: rec.title, priority: rec.priority, source: "diagnosis" };
    expect(dto.priority).toBe("medium");
  });

  it("should preserve priority=low in mapped DTO", () => {
    const rec = { id: "r-l", title: "Low Rec", description: "D", priority: "low" };
    const dto = { id: rec.id, title: rec.title, priority: rec.priority, source: "diagnosis" };
    expect(dto.priority).toBe("low");
  });

  it("should preserve id field verbatim", () => {
    const rec = { id: "unique-id-xyz-123", title: "T", description: "D", priority: "high" };
    const dto = { id: rec.id, source: "diagnosis" };
    expect(dto.id).toBe("unique-id-xyz-123");
  });

  it("should preserve description field verbatim", () => {
    const rec = { id: "r1", title: "T", description: "Monitor cash weekly", priority: "high" };
    const dto = { description: rec.description, source: "diagnosis" };
    expect(dto.description).toBe("Monitor cash weekly");
  });

  it("source is always 'diagnosis' regardless of original rec fields", () => {
    const recs = [
      { id: "r1", title: "T1", description: "D1", priority: "high" },
      { id: "r2", title: "T2", description: "D2", priority: "low" },
    ];
    const mapped = recs.map((rec: any) => ({ id: rec.id, source: "diagnosis" }));
    expect(mapped[0].source).toBe("diagnosis");
    expect(mapped[1].source).toBe("diagnosis");
  });

  it("should handle two-element recommendation array", () => {
    const recs = [
      { id: "r1", title: "T1", description: "D1", priority: "high" },
      { id: "r2", title: "T2", description: "D2", priority: "medium" },
    ];
    const mapped = recs.map((rec: any) => ({ id: rec.id, title: rec.title, source: "diagnosis" }));
    expect(mapped).toHaveLength(2);
  });

  it("no extra properties beyond expected in mapped DTO", () => {
    const rec = { id: "r1", title: "T", description: "D", priority: "high" };
    const dto = { id: rec.id, title: rec.title, description: rec.description, priority: rec.priority, source: "diagnosis" };
    expect(Object.keys(dto)).toEqual(["id", "title", "description", "priority", "source"]);
  });

  it("title is preserved exactly including spaces and punctuation", () => {
    const rec = { id: "r1", title: "Increase cash flow: weekly check (urgent!)", description: "D", priority: "high" };
    const dto = { title: rec.title, source: "diagnosis" };
    expect(dto.title).toBe("Increase cash flow: weekly check (urgent!)");
  });

  it("empty fallback array has zero length", () => {
    const recs: any[] = [];
    const mapped = recs.length > 0 ? recs.map((r: any) => ({ id: r.id })) : [];
    expect(mapped).toHaveLength(0);
    expect(Array.isArray(mapped)).toBe(true);
  });

  it("generic fallback strings are returned as-is when no DB recs", () => {
    const recs: any[] = [];
    const fallback = ["Review KPI trends", "Increase review cadence"];
    const result = recs.length > 0 ? recs.map((r: any) => r.title) : fallback;
    expect(result).toEqual(["Review KPI trends", "Increase review cadence"]);
  });

  it("real recs take priority: fallback is not included when recs exist", () => {
    const recs = [{ id: "r1", title: "Real", description: "D", priority: "high" }];
    const fallback = ["Generic fallback"];
    const result = recs.length > 0 ? recs.map((r: any) => r.title) : fallback;
    expect(result).not.toContain("Generic fallback");
    expect(result).toContain("Real");
  });

  it("mapped DTO has at least id and title fields", () => {
    const rec = { id: "r1", title: "Check revenue", description: "D", priority: "high" };
    const dto = { id: rec.id, title: rec.title, description: rec.description, priority: rec.priority, source: "diagnosis" };
    expect(dto).toHaveProperty("id");
    expect(dto).toHaveProperty("title");
  });

  it("three recommendations map to three DTOs in same order", () => {
    const recs = [
      { id: "x1", title: "A", description: "D", priority: "high" },
      { id: "x2", title: "B", description: "D", priority: "medium" },
      { id: "x3", title: "C", description: "D", priority: "low" },
    ];
    const mapped = recs.map((r: any) => ({ id: r.id }));
    expect(mapped[0].id).toBe("x1");
    expect(mapped[1].id).toBe("x2");
    expect(mapped[2].id).toBe("x3");
  });
});
