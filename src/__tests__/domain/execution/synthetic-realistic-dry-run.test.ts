import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessDryRunReadiness,
} from "@/domain/execution/owner-data-dry-run";
import type { TrialPackInput } from "@/domain/execution/trial-pack";
import {
  canEnterVerifiedLearning,
  isRealOwnerData,
  diagnoseProgression,
  recommendProcessModernization,
  recommendClientRetention,
  RecoveryStage,
  PROCESS_DEFECT_TO_SOP,
  type DistressFinancials,
  type OpsSignals,
} from "@/domain/execution/dry-run-diagnosis";
import { GrowthClassification, ProgressionMove } from "@/domain/execution/progression-engine";
import { requiresHumanReview, ProofType, ProofRiskLevel } from "@/domain/execution/proof";
import { redactForScope, payloadLeaksForbiddenField, DashboardScope } from "@/domain/workspace/dashboard-access";

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), "owner-data-dry-run", name), "utf8"));
}
const laundry = load("laundry.synthetic-realistic.json");
const housekeeping = load("housekeeping-distressed.synthetic-realistic.json");
const scenarios = [
  { name: "laundry", data: laundry },
  { name: "housekeeping", data: housekeeping },
];

describe("synthetic-realistic-dry-run — module contract assertions", () => {
  it("assessDryRunReadiness is a function", () => { expect(typeof assessDryRunReadiness).toBe("function"); });
  it("canEnterVerifiedLearning is a function", () => { expect(typeof canEnterVerifiedLearning).toBe("function"); });
  it("isRealOwnerData is a function", () => { expect(typeof isRealOwnerData).toBe("function"); });
  it("diagnoseProgression is a function", () => { expect(typeof diagnoseProgression).toBe("function"); });
  it("recommendProcessModernization is a function", () => { expect(typeof recommendProcessModernization).toBe("function"); });
  it("recommendClientRetention is a function", () => { expect(typeof recommendClientRetention).toBe("function"); });
  it("GrowthClassification is an object", () => { expect(typeof GrowthClassification).toBe("object"); });
  it("ProgressionMove is an object", () => { expect(typeof ProgressionMove).toBe("object"); });
  it("requiresHumanReview is a function", () => { expect(typeof requiresHumanReview).toBe("function"); });
  it("ProofType is an object", () => { expect(typeof ProofType).toBe("object"); });
  it("redactForScope is a function", () => { expect(typeof redactForScope).toBe("function"); });
  it("load is a function", () => { expect(typeof load).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[synthetic-dry-run] honesty / data-mode labelling", () => {
  it.each(scenarios)("$name is labelled SYNTHETIC_REALISTIC + NOT_REAL_OWNER_DATA", ({ data }) => {
    const meta = data.metadata as Record<string, unknown>;
    expect(meta.dataMode).toBe("SYNTHETIC_REALISTIC");
    expect(meta.dataTruthStatus).toBe("NOT_REAL_OWNER_DATA");
    expect(meta.forbiddenUse).toEqual(expect.arrayContaining(["real learning database", "real employee pilot proof"]));
  });

  it.each(scenarios)("$name synthetic data can NEVER enter verified learning", ({ data }) => {
    const meta = data.metadata as Record<string, unknown>;
    expect(isRealOwnerData(meta)).toBe(false);
    expect(canEnterVerifiedLearning(meta)).toBe(false);
  });

  it("a hypothetical REAL-data label would be permitted (guard is specific, not blanket)", () => {
    expect(canEnterVerifiedLearning({ dataMode: "REAL", dataTruthStatus: "REAL_OWNER_DATA" })).toBe(true);
  });
});

describe("[synthetic-dry-run] readiness is earned, not faked", () => {
  it.each(scenarios)("$name is READY only with all mandatory fields present", ({ data }) => {
    const r = assessDryRunReadiness(data as unknown as TrialPackInput);
    expect(r.ready).toBe(true);
    expect(r.verdict).toBe("READY_FOR_SUPERVISED_DRY_RUN");
    expect(r.provisional.requiresOwnerApproval).toBe(true);
  });

  it.each(scenarios)("$name drops to BLOCKED if a mandatory section is removed", ({ data }) => {
    const stripped = { ...(data as unknown as TrialPackInput), pricingBoundary: undefined };
    const r = assessDryRunReadiness(stripped);
    expect(r.ready).toBe(false);
    expect(r.blockingGaps.map((g) => g.section)).toContain("pricingBoundary");
  });

  it.each(scenarios)("$name drops to BLOCKED if a required field is blanked", ({ data }) => {
    const bp = { ...(data.businessProfile as Record<string, unknown>), businessName: "" };
    const r = assessDryRunReadiness({ ...(data as unknown as TrialPackInput), businessProfile: bp });
    expect(r.ready).toBe(false);
    expect(r.blockingGaps.map((g) => g.section)).toContain("businessProfile");
  });
});

describe("[synthetic-dry-run] progression gate", () => {
  it("distressed housekeeping BLOCKS expansion and routes to stabilization first", () => {
    const d = diagnoseProgression(housekeeping.financials as DistressFinancials, housekeeping.opsSignals as OpsSignals, ProgressionMove.SECOND_LOCATION);
    expect(d.expansionAllowed).toBe(false);
    expect(d.stage).toBe(RecoveryStage.STABILIZATION_FIRST);
    expect(d.decision.blockedReasons).toEqual(
      expect.arrayContaining(["weak_cash_runway", "complaints_or_rework_rising", "capacity_stressed", "profit_impact_unverified"])
    );
  });

  it("debt/cash stress + client loss keep growth out of the HEALTHY class", () => {
    const d = diagnoseProgression(housekeeping.financials as DistressFinancials, housekeeping.opsSignals as OpsSignals);
    expect(d.classification).not.toBe(GrowthClassification.HEALTHY_GROWTH);
  });

  it("late invoices / cash shortfall flip cashRunwayWeak so expansion cannot pass", () => {
    const fin = { ...(housekeeping.financials as DistressFinancials), netCashShortfall: 130000 };
    const ops = { ...(housekeeping.opsSignals as OpsSignals) };
    const d = diagnoseProgression(fin, ops, ProgressionMove.MARKETING_SCALE);
    expect(d.decision.blockedReasons).toContain("weak_cash_runway");
  });

  it("the healthier laundry scenario MAY consider controlled growth (contrast)", () => {
    const d = diagnoseProgression(laundry.financials as DistressFinancials, laundry.opsSignals as OpsSignals, ProgressionMove.CONTROLLED_GROWTH_EXPERIMENT);
    expect(d.expansionAllowed).toBe(true);
    expect(d.stage).toBe(RecoveryStage.CONTROLLED_GROWTH_OK);
  });
});

describe("[synthetic-dry-run] outdated-process & client diagnosis", () => {
  it("housekeeping outdated-process signals trigger SOP modernization for every defect", () => {
    const defects = housekeeping.processDefects as string[];
    const recs = recommendProcessModernization(defects);
    expect(recs.length).toBe(defects.length);
    expect(recs.every((r) => r.ownerApprovalRequired === true)).toBe(true);
    for (const d of defects) expect(d in PROCESS_DEFECT_TO_SOP).toBe(true);
  });

  it("unknown defect flags are ignored (no fabricated recommendations)", () => {
    expect(recommendProcessModernization(["totally_made_up_defect"])).toHaveLength(0);
  });

  it("commercial client loss triggers recovery + retention workflows", () => {
    const ops = housekeeping.opsSignals as OpsSignals;
    const recs = recommendClientRetention(ops.lostCommercialClients, ops.atRiskCommercialClients);
    expect(recs.map((r) => r.kind)).toEqual(expect.arrayContaining(["RECOVERY", "RETENTION"]));
    expect(recs.every((r) => r.ownerApprovalRequired === true)).toBe(true);
  });

  it("a healthy client base produces no recovery/retention noise", () => {
    expect(recommendClientRetention(0, 0)).toHaveLength(0);
  });
});

describe("[synthetic-dry-run] proof requirements are risk-adjusted", () => {
  it("payment/invoice/customer-confirmation proof always needs human review; low-risk does not", () => {
    expect(requiresHumanReview(ProofType.PAYMENT_CONFIRMATION, ProofRiskLevel.HIGH)).toBe(true);
    expect(requiresHumanReview(ProofType.INVOICE, ProofRiskLevel.MEDIUM)).toBe(true);
    expect(requiresHumanReview(ProofType.SHORT_NOTE, ProofRiskLevel.LOW)).toBe(false);
    expect(requiresHumanReview(ProofType.CHECKLIST_COMPLETION, ProofRiskLevel.LOW)).toBe(false);
  });
});

describe("[synthetic-dry-run] visibility rules still hold for dry-run payloads", () => {
  const ownerView = {
    title: "Commercial client loss diagnosis",
    ownerDiagnosis: "margin not cost-linked; cash shortfall",
    cashRunway: 1,
    profitWeakness: "loss-making contracts",
    privateOwnerNotes: "negotiating debt restructuring",
    aiLearningInternals: { weights: [0.1] },
    otherEmployeePerformance: [{ emp: "x", score: 0.2 }],
    teamTasks: ["job-1", "job-2"],
  };

  it("employee scope strips owner-only AND manager-only fields", () => {
    const v = redactForScope(ownerView, DashboardScope.EMPLOYEE);
    expect(payloadLeaksForbiddenField(v, DashboardScope.EMPLOYEE)).toBe(false);
    for (const k of ["ownerDiagnosis", "cashRunway", "profitWeakness", "privateOwnerNotes", "aiLearningInternals", "otherEmployeePerformance", "teamTasks"]) {
      expect(JSON.stringify(v)).not.toContain(k);
    }
  });

  it("manager scope strips owner-only but keeps team fields", () => {
    const v = redactForScope(ownerView, DashboardScope.MANAGER) as Record<string, unknown>;
    expect(payloadLeaksForbiddenField(v, DashboardScope.MANAGER)).toBe(false);
    expect(JSON.stringify(v)).not.toContain("ownerDiagnosis");
    expect(v.teamTasks).toBeDefined();
  });

  it("owner scope sees everything", () => {
    const v = redactForScope(ownerView, DashboardScope.OWNER) as Record<string, unknown>;
    expect(v.ownerDiagnosis).toBeDefined();
    expect(v.cashRunway).toBeDefined();
  });
});
