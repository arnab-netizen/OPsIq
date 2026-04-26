import { describe, expect, it } from "vitest";
import { runEnterpriseDiagnosisV2 } from "@/services/diagnosis-v2/enterprise-orchestrator";

describe("enterprise diagnosis v2", () => {
  it("produces governed enterprise outputs beyond the base diagnosis result", () => {
    const result = runEnterpriseDiagnosisV2({
      engagementId: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      nowIso: "2026-04-24T12:00:00.000Z",
      businessName: "LaundryCo",
      businessType: "Laundry Services",
      problemStatement: "Losing money with high electricity cost and weak customer count.",
      monthlyRevenue: 50000,
      monthlyCosts: 80000,
      customerCount: 10,
      cashOnHand: 25000,
      overduePayables: 18000,
      serviceLines: [{ name: "wash-fold", share: 0.65 }],
      evidenceLabels: ["owner intake", "monthly summary"],
    });

    expect(result.enterprise.dataQuality.overall).toBeGreaterThan(0);
    expect(result.enterprise.businessState.status).toMatch(/critical|stressed|recovering|stable/);
    expect(result.enterprise.variables.length).toBeGreaterThan(0);
    expect(result.enterprise.triggers.length).toBeGreaterThan(0);
    expect(result.enterprise.actionPlan.items.length).toBe(result.recommendations.length);
    expect(result.enterprise.explanations.length).toBe(result.recommendations.length);
    expect(result.enterprise.auditEvents.map((event) => event.name)).toContain("diagnosis.v2.completed");
  });

  it("keeps insufficient evidence visible instead of creating false certainty", () => {
    const result = runEnterpriseDiagnosisV2({
      engagementId: "33333333-3333-4333-8333-333333333333",
      nowIso: "2026-04-24T12:00:00.000Z",
      problemStatement: "Business is struggling.",
    });

    expect(result.needsInput).toBe(true);
    expect(result.run.status).toBe("needs_input");
    expect(result.enterprise.dataQuality.band).toBe("weak");
    expect(result.enterprise.triggers.some((trigger) => trigger.action === "block_until_review")).toBe(true);
  });
});
