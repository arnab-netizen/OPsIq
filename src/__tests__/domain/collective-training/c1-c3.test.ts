import { describe, it, expect } from "vitest";
import type { CollectiveDecisionPacket, DomainSignalInput } from "@/domain/collective-training/collective-types";
import { validateCollectivePacket, isCollectivePacketValid } from "@/domain/collective-training/decision-packet";
import { aggregateSignals } from "@/domain/collective-training/signal-aggregator";
import { classifyBusinessStage } from "@/domain/collective-training/stage-classifier";
import { ALL_DOMAIN_KEYS } from "@/domain/collective-training/domain-registry";
import { HarmType } from "@/domain/domain-training/harm-ledger";

function validPacket(): CollectiveDecisionPacket {
  return {
    businessStage: "survival",
    primaryDiagnosis: "Cash is critically low while owner wants to spend on marketing.",
    rankedDomainSignals: [{
      domain: "cash-survival", domainId: "D1", status: "RED", severity: "CRITICAL", confidence: "HIGH",
      priorityLevel: 1, rank: 0, evidenceUsed: ["bank balance"], missingData: [], sideEffectRisks: ["cash runway"],
    }],
    activeVetoes: [{ domain: "cash-survival", reason: "critical cash survival risk", blockedActions: ["paid_marketing"], unlockCondition: "cash positive 2 weeks" }],
    contradictions: [],
    whatNotToDo: { prohibited: ["no paid marketing"], temporarilyBlocked: [], requiresProof: [], requiresExpertEscalation: [] },
    primaryNextAction: "Collect the overdue invoices today and stop all discretionary spend until cash clears.",
    secondaryActions: [],
    whyThisNow: "Cash is the binding survival constraint; nothing else proceeds until it clears.",
    whoShouldDoIt: { who: "owner", authorityOk: true, workloadOk: true, proofResponsibility: "owner records collections", escalation: "accountant" },
    howToDoIt: { steps: ["List overdue invoices", "Call each customer", "Record payments"], checklist: ["invoice list"], escalationPoint: "accountant", commonMistakes: ["discounting to collect"] },
    proofRequired: { evidenceType: "bank statement", sourceStrength: "verified", deadline: "48h", responsiblePerson: "owner" },
    verificationPlan: { baseline: "current cash", successMetric: "cash up", failureMetric: "cash flat", sideEffectMetrics: ["complaints"], reviewWindow: "1 week", proofOwner: "owner" },
    stopRollbackRedesign: { stopCondition: "cash drops further", rollbackCondition: "collections harm relationships", redesignCondition: "collections fail twice", escalationCondition: "insolvency risk" },
    learningStatus: "NOT_ELIGIBLE",
    confidence: "HIGH",
    ownerModeLeanCheck: { avoidsUnnecessaryAdmin: true, avoidsStaffOverload: true, avoidsOwnerOverload: false, protectsProfit: true, protectsQuality: true, protectsSustainableGrowth: true, simplestSafeActionSelected: true },
    unsafeEmitted: [],
  };
}

describe("[C1] collective decision packet contract", () => {
  it("a fully-populated packet is valid", () => {
    expect(validateCollectivePacket(validPacket())).toEqual([]);
    expect(isCollectivePacketValid(validPacket())).toBe(true);
  });
  it("missing active_vetoes fails", () => {
    const p = validPacket(); (p as { activeVetoes: unknown }).activeVetoes = undefined;
    expect(validateCollectivePacket(p)).toContain("missing_active_vetoes");
  });
  it("missing what_not_to_do fails", () => {
    const p = validPacket(); (p as { whatNotToDo: unknown }).whatNotToDo = undefined;
    expect(validateCollectivePacket(p)).toContain("missing_what_not_to_do");
  });
  it("missing proof_required fails", () => {
    const p = validPacket(); p.proofRequired = { evidenceType: "", sourceStrength: "", deadline: "", responsiblePerson: "" };
    expect(validateCollectivePacket(p)).toContain("missing_proof_required");
  });
  it("missing verification_plan fails", () => {
    const p = validPacket(); p.verificationPlan = { ...p.verificationPlan, successMetric: "" };
    expect(validateCollectivePacket(p)).toContain("missing_verification_plan");
  });
  it("missing stop_rollback_redesign fails", () => {
    const p = validPacket(); p.stopRollbackRedesign = { ...p.stopRollbackRedesign, rollbackCondition: "" };
    expect(validateCollectivePacket(p)).toContain("missing_stop_rollback_redesign");
  });
  it("missing owner_mode_lean_check fails", () => {
    const p = validPacket(); (p as { ownerModeLeanCheck: unknown }).ownerModeLeanCheck = undefined;
    expect(validateCollectivePacket(p)).toContain("missing_owner_mode_lean_check");
  });
  it("a generic primary action with no steps fails", () => {
    const p = validPacket(); p.primaryNextAction = "optimize operations"; p.howToDoIt = { ...p.howToDoIt, steps: [] };
    const v = validateCollectivePacket(p);
    expect(v.includes("generic_primary_next_action") || v.includes("missing_how_to_do_it")).toBe(true);
  });
});

describe("[C2] domain signal aggregator", () => {
  const all: DomainSignalInput[] = ALL_DOMAIN_KEYS.map((d) => ({ domain: d, status: "GREEN", severity: "LOW", confidence: "HIGH" }));
  it("aggregates all 24 domain signals", () => {
    const agg = aggregateSignals(all);
    expect(agg.signals.length).toBe(24);
    expect(agg.missingDomains.length).toBe(0);
  });
  it("flags a missing domain", () => {
    const agg = aggregateSignals(all.filter((s) => s.domain !== "quality"));
    expect(agg.missingDomains).toContain("quality");
    expect(agg.presentDomains).not.toContain("quality");
  });
  it("preserves a low-confidence signal (never upgraded)", () => {
    const agg = aggregateSignals([{ domain: "pricing-decisions", status: "AMBER", severity: "MEDIUM", confidence: "LOW" }]);
    expect(agg.byDomain.get("pricing-decisions")?.confidence).toBe("LOW");
  });
  it("preserves domain vetoes when red", () => {
    const agg = aggregateSignals([{ domain: "cash-survival", status: "RED", severity: "CRITICAL", confidence: "HIGH" }]);
    expect(agg.byDomain.get("cash-survival")?.vetoedActions).toContain("paid_marketing");
  });
  it("preserves harm signals", () => {
    const agg = aggregateSignals([{ domain: "quality", status: "RED", severity: "HIGH", confidence: "HIGH", harmSignals: [HarmType.QUALITY_WORSENED] }]);
    expect(agg.byDomain.get("quality")?.harmSignals).toContain(HarmType.QUALITY_WORSENED);
  });
});

describe("[C3] business stage classifier", () => {
  // Strategic readiness domains start UNKNOWN (not assessed) so a clean board is
  // mature_optimization, not accidentally scale/growth ready.
  const base: DomainSignalInput[] = ALL_DOMAIN_KEYS.map((d) => (
    d === "growth-readiness" || d === "scale-readiness"
      ? { domain: d, status: "UNKNOWN", severity: "LOW", confidence: "HIGH" }
      : { domain: d, status: "GREEN", severity: "LOW", confidence: "HIGH" }));
  function withRed(domains: string[], extra: Partial<Record<string, DomainSignalInput>> = {}): DomainSignalInput[] {
    return base.map((s) => domains.includes(s.domain) ? { ...s, status: "RED", severity: "HIGH" } : (extra[s.domain] ?? s));
  }
  it("critical cash → survival", () => {
    expect(classifyBusinessStage(aggregateSignals(withRed(["cash-survival"]))).stage).toBe("survival");
  });
  it("revenue up / profit down → profit repair", () => {
    expect(classifyBusinessStage(aggregateSignals(withRed(["profit-improvement"]))).stage).toBe("profit_repair");
  });
  it("quality/SOP unstable → process control", () => {
    expect(classifyBusinessStage(aggregateSignals(withRed(["quality"]))).stage).toBe("process_control");
    expect(classifyBusinessStage(aggregateSignals(withRed(["sop-process"]))).stage).toBe("process_control");
  });
  it("operating constraint red → stabilization", () => {
    expect(classifyBusinessStage(aggregateSignals(withRed(["capacity"]))).stage).toBe("stabilization");
  });
  it("severe decline (3+ red conditions) → recovery/turnaround", () => {
    expect(classifyBusinessStage(aggregateSignals(withRed(["profit-improvement", "retention", "customer-complaints"]))).stage).toBe("recovery_turnaround");
  });
  it("stable + growth signals → growth readiness", () => {
    const sigs = base.map((s) => s.domain === "growth-readiness" ? { ...s, status: "GREEN" as const } : s);
    expect(classifyBusinessStage(aggregateSignals(sigs)).stage).toBe("growth_readiness");
  });
  it("repeatable owner-independent → scale readiness", () => {
    const sigs = base.map((s) => s.domain === "scale-readiness" ? { ...s, status: "GREEN" as const } : s);
    expect(classifyBusinessStage(aggregateSignals(sigs)).stage).toBe("scale_readiness");
  });
});
