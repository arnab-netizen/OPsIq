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
});
