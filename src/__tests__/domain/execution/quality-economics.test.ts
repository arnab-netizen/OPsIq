import { describe, it, expect } from "vitest";
import {
  incidentCost,
  totalCostOfPoorQuality,
  classifyCopq,
  qualityEconomicsSummary,
  QualityIncidentType,
  type QualityIncident,
} from "@/domain/execution/quality-economics";

const I = (type: QualityIncidentType, over: Partial<QualityIncident> = {}): QualityIncident => ({ type, count: 1, directCost: 100, ...over });

describe("[module15] quality economics (COPQ)", () => {
  it("incident cost = count x (direct + recovery + goodwill)", () => {
    expect(incidentCost(I(QualityIncidentType.REFUND, { count: 3, directCost: 100, recoveryCost: 20, goodwillCost: 30 }))).toBe(3 * 150);
    expect(incidentCost({ type: QualityIncidentType.COMPLAINT })).toBe(0);
  });

  it("aggregates COPQ by type with incident counts", () => {
    const agg = totalCostOfPoorQuality([
      I(QualityIncidentType.REWORK, { count: 2, directCost: 50 }),
      I(QualityIncidentType.REFUND, { count: 1, directCost: 200 }),
    ]);
    expect(agg.byType[QualityIncidentType.REWORK]).toBe(100);
    expect(agg.byType[QualityIncidentType.REFUND]).toBe(200);
    expect(agg.total).toBe(300);
    expect(agg.incidentCount).toBe(3);
  });

  it("classifies COPQ severity by revenue fraction", () => {
    expect(classifyCopq(0.01)).toBe("LOW");
    expect(classifyCopq(0.05)).toBe("MODERATE");
    expect(classifyCopq(0.1)).toBe("HIGH");
    expect(classifyCopq(0.2)).toBe("SEVERE");
  });

  it("summary computes copqPct, severity, dominant type", () => {
    const s = qualityEconomicsSummary(
      [I(QualityIncidentType.REWORK, { count: 5, directCost: 1000 }), I(QualityIncidentType.COMPLAINT, { count: 2, directCost: 500 })],
      100000
    );
    expect(s.copq).toBe(5000 + 1000);
    expect(s.copqPct).toBeCloseTo(0.06, 5);
    expect(s.severity).toBe("MODERATE");
    expect(s.dominantType).toBe(QualityIncidentType.REWORK);
  });

  it("handles zero revenue without dividing by zero", () => {
    const s = qualityEconomicsSummary([I(QualityIncidentType.REFUND, { directCost: 100 })], 0);
    expect(s.copqPct).toBe(0);
    expect(s.severity).toBe("LOW");
  });

  it("no incidents -> zero COPQ, null dominant type", () => {
    const s = qualityEconomicsSummary([], 100000);
    expect(s.copq).toBe(0);
    expect(s.dominantType).toBeNull();
  });
});
