/**
 * Recovery Milestone Execution — unit proof (PASS 33).
 *
 * Proves the recovery state machine advances only on proven milestones: no milestone can be skipped, evidence
 * is required, correction/stabilization milestones require a passing reassessment, the stabilization gate opens
 * only when every milestone is proven, the thrive gate stays blocked until stabilization, a worsened
 * reassessment regresses (loops back), the unrecoverable case stays restructure/shutdown (no fake recovery),
 * owner-approval + unsafe-action gates hold, no fabricated financials, no hidden score, clean fabricates nothing.
 */
import { describe, it, expect } from "vitest";
import { planBusinessSurvivalRecovery, type CrisisInput } from "@/domain/owner-mode/business-survival-recovery";
import {
  computeRecoveryExecution, computeAndValidateRecovery, recoveryExecutionViewSchema,
  type MilestoneOutcome,
} from "@/domain/owner-mode/recovery-milestone-execution";

const crisis = (over: Partial<CrisisInput> = {}): CrisisInput => ({
  crisisCaseId: "cr", workspaceArchetype: "laundry_local_service",
  cashPressure: "HIGH", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH",
  operationalPressure: "HIGH", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH",
  legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["unit margin", "capacity"],
  constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true }, ...over,
});
const planOf = (over?: Partial<CrisisInput>) => planBusinessSurvivalRecovery(crisis(over))!;
const done = (order: number, reassessment?: MilestoneOutcome["reassessment"]): MilestoneOutcome =>
  ({ order, executed: true, evidenceProvided: true, reassessment });
// A full 6-milestone pass (corrections + stabilization reassessed IMPROVED).
const allDone = (): MilestoneOutcome[] => [done(1), done(2), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5), done(6, "IMPROVED")];
const recover = (outcomes: MilestoneOutcome[], over?: Partial<CrisisInput>) =>
  computeRecoveryExecution({ recoveryCaseId: "rc", workspaceArchetype: "laundry_local_service", plan: planOf(over), outcomes })!;

describe("recovery-milestone-execution", () => {
  it("1. a milestone cannot advance without evidence (next bottleneck is the un-evidenced milestone)", () => {
    const v = recover([{ order: 1, executed: true, evidenceProvided: false }]);
    expect(v.currentRecoveryState).toBe("STOP_LOSS_PENDING");
    expect(v.nextMilestone!.order).toBe(1);
  });

  it("2. stop-loss must precede stabilization (nothing after m1 counts until m1 is proven)", () => {
    // m2..m6 'done' but m1 not → still blocked at m1, stabilization not open.
    const v = recover([done(2), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5), done(6, "IMPROVED")]);
    expect(v.currentRecoveryState).toBe("STOP_LOSS_PENDING");
    expect(v.stabilizationGateStatus).toBe("BLOCKED");
  });

  it("3. cash data must precede cash-based recovery (m2 is next after m1)", () => {
    const v = recover([done(1)]);
    expect(v.currentRecoveryState).toBe("CASH_DATA_PENDING");
    expect(v.completedMilestones).toEqual([1]);
  });

  it("4. quality correction requires a passing reassessment (pending until IMPROVED)", () => {
    const v = recover([done(1), done(2), { order: 3, executed: true, evidenceProvided: true, reassessment: "PENDING" }]);
    expect(v.currentRecoveryState).toBe("QUALITY_CORRECTION_PENDING");
  });

  it("5. operations correction requires evidence + reassessment", () => {
    const v = recover([done(1), done(2), done(3, "IMPROVED"), { order: 4, executed: true, evidenceProvided: false }]);
    expect(v.currentRecoveryState).toBe("OPERATIONS_CORRECTION_PENDING");
  });

  it("6. workload reduction is a required milestone (m5 pending after m1-4)", () => {
    const v = recover([done(1), done(2), done(3, "IMPROVED"), done(4, "IMPROVED")]);
    expect(v.currentRecoveryState).toBe("WORKLOAD_REDUCTION_PENDING");
  });

  it("7. reassessment is required before the stabilization gate opens (m6 pending)", () => {
    const v = recover([done(1), done(2), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5)]);
    expect(v.currentRecoveryState).toBe("REASSESSMENT_PENDING");
    expect(v.stabilizationGateStatus).toBe("BLOCKED");
  });

  it("8. the thrive gate is blocked until stabilization is proven", () => {
    const partial = recover([done(1), done(2), done(3, "IMPROVED")]);
    expect(partial.thriveGateStatus).toBe("BLOCKED");
    const full = recover(allDone());
    expect(full.stabilizationGateStatus).toBe("OPEN");
    expect(full.thriveGateStatus).toBe("ELIGIBLE");
  });

  it("9. growth validation becomes eligible only after stabilization, and stays owner-gated", () => {
    const v = recover(allDone());
    expect(v.currentRecoveryState).toBe("THRIVE_GATE_ELIGIBLE");
    expect(v.ownerApprovalRequired).toBe(true);
  });

  it("10. a failed reassessment regresses and loops back to correction", () => {
    const v = recover([done(1), done(2), { order: 3, executed: true, evidenceProvided: true, reassessment: "WORSENED" }]);
    expect(v.currentRecoveryState).toBe("RECOVERY_REGRESSED");
    expect(v.regressionDetected).toBe(true);
    expect(v.nextMilestone!.milestone).toMatch(/re-correct/i);
    expect(v.thriveGateStatus).toBe("BLOCKED");
  });

  it("11. the unrecoverable case does not fake recovery", () => {
    const plan = planBusinessSurvivalRecovery(crisis({ cashPressure: "CRITICAL", constraints: { feasibleNearTermRevenue: false, ownerCapitalAvailable: false, capacityFeasible: false } }))!;
    const v = computeRecoveryExecution({ recoveryCaseId: "rc", workspaceArchetype: "laundry_local_service", plan, outcomes: allDone() })!;
    expect(v.currentRecoveryState).toBe("RESTRUCTURE_REVIEW_REQUIRED");
    expect(v.restructureOrShutdownRequired).toBe(true);
    expect(v.thriveGateStatus).toBe("BLOCKED");
    expect(v.stabilizationGateStatus).toBe("BLOCKED");
  });

  it("12. owner-approval gates hold (thrive-eligible requires owner approval)", () => {
    expect(recover(allDone()).ownerApprovalRequired).toBe(true);
  });

  it("13. unsafe actions remain blocked throughout recovery", () => {
    const v = recover([done(1)]);
    expect(v.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
  });

  it("14. no fake financial / runway / ROI claim in the recovery summary", () => {
    for (const outs of [[done(1)], allDone(), [done(1), done(2), { order: 3, executed: true, evidenceProvided: true, reassessment: "WORSENED" as const }]]) {
      const v = recover(outs);
      expect(v.cockpitSummary).not.toMatch(/[$£€]\s?\d|\b\d+(\.\d+)?\s?%|\broi\b|guaranteed (recovery|success|profit)/i);
    }
  });

  it("15. a clean workspace (no plan) fabricates nothing", () => {
    expect(computeRecoveryExecution({ recoveryCaseId: "rc", workspaceArchetype: "laundry_local_service", plan: null })).toBeNull();
  });

  it("16. no hidden score is exposed", () => {
    const v = recover(allDone());
    const walk = (o: unknown): string[] => typeof o === "object" && o ? Object.keys(o).concat(Object.values(o).flatMap(walk)) : [];
    for (const k of walk(v)) expect(k).not.toMatch(/score/i);
  });

  it("17. no milestone can be skipped (a later done milestone never opens the gate over an earlier gap) + schema fail-closed", () => {
    // m1 done, m2 skipped, m3-6 done → stabilization stays blocked (gap at m2).
    const v = recover([done(1), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5), done(6, "IMPROVED")]);
    expect(v.currentRecoveryState).toBe("CASH_DATA_PENDING");
    expect(v.stabilizationGateStatus).toBe("BLOCKED");
    expect(v.blockedMilestones).toContain(2);
    // valid views pass schema
    expect(computeAndValidateRecovery({ recoveryCaseId: "rc", workspaceArchetype: "laundry_local_service", plan: planOf(), outcomes: allDone() }).ok).toBe(true);
    // tampered: thrive eligible while stabilization blocked → fail closed
    const tampered = { ...recover([done(1)]), thriveGateStatus: "ELIGIBLE" as const };
    expect(recoveryExecutionViewSchema.safeParse(tampered).success).toBe(false);
  });
});
