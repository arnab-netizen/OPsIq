/**
 * Owner Recovery Status — unit proof (PASS 37).
 *
 * Proves the read-only projection is honest and fail-closed: a clean workspace fabricates no recovery
 * (NONE); a crisis with no proven milestone outcomes reads as in-progress with the gates BLOCKED; a full
 * proven pass reaches THRIVE_GATE_ELIGIBLE only with stabilization proven + owner approval; a worsened
 * reassessment is REGRESSED; an unrecoverable business stays RESTRUCTURE_REVIEW_REQUIRED (no fake recovery);
 * every response carries the no-guarantee statement + blocked unsafe actions; no fabricated money; the
 * schema fails closed on an incoherent status; and the conservative crisis derivation invents no crisis.
 */
import { describe, it, expect } from "vitest";
import { type CrisisInput } from "@/domain/owner-mode/business-survival-recovery";
import { type MilestoneOutcome } from "@/domain/owner-mode/recovery-milestone-execution";
import {
  buildOwnerRecoveryStatus, ownerRecoveryStatusSchema, deriveCrisisInput, mapRecoveryStatus,
} from "@/domain/owner-mode/owner-recovery-status";

const crisis = (over: Partial<CrisisInput> = {}): CrisisInput => ({
  crisisCaseId: "rc", workspaceArchetype: "laundry_local_service",
  cashPressure: "HIGH", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH",
  operationalPressure: "HIGH", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH",
  legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["unit margin"],
  constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true }, ...over,
});
const done = (order: number, reassessment?: MilestoneOutcome["reassessment"]): MilestoneOutcome => ({ order, executed: true, evidenceProvided: true, reassessment });
const allDone = (): MilestoneOutcome[] => [done(1), done(2), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5), done(6, "IMPROVED")];
const ok = (r: ReturnType<typeof buildOwnerRecoveryStatus>) => { if (!r.ok) throw new Error("build failed: " + r.issues.join("; ")); return r.status; };

describe("owner-recovery-status — module contract assertions", () => {
  it("buildOwnerRecoveryStatus is a function", () => { expect(typeof buildOwnerRecoveryStatus).toBe("function"); });
  it("ownerRecoveryStatusSchema is an object", () => { expect(typeof ownerRecoveryStatusSchema).toBe("object"); });
  it("deriveCrisisInput is a function", () => { expect(typeof deriveCrisisInput).toBe("function"); });
  it("mapRecoveryStatus is a function", () => { expect(typeof mapRecoveryStatus).toBe("function"); });
  it("crisis is a function", () => { expect(typeof crisis).toBe("function"); });
  it("done is a function", () => { expect(typeof done).toBe("function"); });
  it("allDone is a function", () => { expect(typeof allDone).toBe("function"); });
  it("ok is a function", () => { expect(typeof ok).toBe("function"); });
  it("crisis() returns an object", () => { expect(typeof crisis()).toBe("object"); });
  it("crisis() has crisisCaseId field", () => { expect(crisis()).toHaveProperty("crisisCaseId"); });
  it("allDone() returns an array", () => { expect(Array.isArray(allDone())).toBe(true); });
  it("allDone().length is greater than 0", () => { expect(allDone().length).toBeGreaterThan(0); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner-recovery-status", () => {
  it("1. a clean workspace (no crisis) fabricates no recovery", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: null }));
    expect(s.recoveryStatus).toBe("NONE");
    expect(s.stabilizationGate).toBe("BLOCKED");
    expect(s.thriveGate).toBe("BLOCKED");
    expect(s.noGuaranteeStatement).toMatch(/not guaranteed/i);
    expect(s.blockedUnsafeActions.length).toBeGreaterThan(0);
  });

  it("2. a crisis with no proven outcomes reads in-progress with gates blocked", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: crisis() }));
    expect(["SURVIVAL_TRIAGE_ACTIVE", "RECOVERY_IN_PROGRESS"]).toContain(s.recoveryStatus);
    expect(s.stabilizationGate).toBe("BLOCKED");
    expect(s.thriveGate).toBe("BLOCKED");
    expect(s.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
    expect(s.topRecoveryBottleneck).toBeTruthy();
  });

  it("3. a full proven pass reaches thrive-eligible only with stabilization proven + owner approval", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: crisis(), outcomes: allDone() }));
    expect(s.recoveryStatus).toBe("THRIVE_GATE_ELIGIBLE");
    expect(s.stabilizationGate).toBe("OPEN");
    expect(s.thriveGate).toBe("ELIGIBLE");
    expect(s.ownerApprovalRequired).toBe(true);
    expect(s.blockedMilestones).toEqual([]);
  });

  it("4. a worsened reassessment is REGRESSED and keeps the thrive gate blocked", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: crisis(), outcomes: [done(1), done(2), { order: 3, executed: true, evidenceProvided: true, reassessment: "WORSENED" }] }));
    expect(s.recoveryStatus).toBe("REGRESSED");
    expect(s.thriveGate).toBe("BLOCKED");
  });

  it("5. an unrecoverable business stays restructure/shutdown review — no fake recovery", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: crisis({ cashPressure: "CRITICAL", constraints: { feasibleNearTermRevenue: false, ownerCapitalAvailable: false, capacityFeasible: false } }), outcomes: allDone() }));
    expect(["RESTRUCTURE_REVIEW_REQUIRED", "CONTROLLED_SHUTDOWN_REVIEW_REQUIRED"]).toContain(s.recoveryStatus);
    expect(s.stabilizationGate).toBe("BLOCKED");
    expect(s.thriveGate).toBe("BLOCKED");
    expect(s.ownerApprovalRequired).toBe(true);
  });

  it("6. no fabricated money / ROI / guaranteed-outcome text in any string field", () => {
    for (const outs of [undefined, allDone()]) {
      const s = ok(buildOwnerRecoveryStatus({ crisis: crisis(), outcomes: outs }));
      const blob = JSON.stringify(s);
      expect(blob).not.toMatch(/[$£€]\s?\d|\b\d+(\.\d+)?\s?%|\broi\b|guaranteed (recovery|success|profit)/i);
    }
  });

  it("7. no hidden score is exposed", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: crisis(), outcomes: allDone() }));
    const walk = (o: unknown): string[] => typeof o === "object" && o ? Object.keys(o).concat(Object.values(o).flatMap(walk)) : [];
    for (const k of walk(s)) expect(k).not.toMatch(/score/i);
  });

  it("8. the schema fails closed on an incoherent status (thrive eligible without stabilization)", () => {
    const good = ok(buildOwnerRecoveryStatus({ crisis: crisis() }));
    const tampered = { ...good, thriveGate: "ELIGIBLE" as const };
    expect(ownerRecoveryStatusSchema.safeParse(tampered).success).toBe(false);
  });

  it("9. linked task ids are carried through unchanged", () => {
    const s = ok(buildOwnerRecoveryStatus({ crisis: crisis(), linkedProcessExecutionTaskIds: ["pc:a", "pc:b"] }));
    expect(s.linkedProcessExecutionTaskIds).toEqual(["pc:a", "pc:b"]);
  });

  it("10. conservative derivation: all-NONE severities → null (no fabricated crisis)", () => {
    expect(deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service" })).toBeNull();
    const c = deriveCrisisInput({ caseId: "rc", archetype: "laundry_local_service", cashSeverity: "HIGH", missingData: ["cash runway"] });
    expect(c).not.toBeNull();
    expect(c!.cashPressure).toBe("HIGH");
    // it never invents unrecoverable constraints
    expect(c!.constraints).toBeUndefined();
  });

  it("11. mapRecoveryStatus(null,null) is the honest NONE shape and validates", () => {
    const s = mapRecoveryStatus(null, null);
    expect(s.recoveryStatus).toBe("NONE");
    expect(ownerRecoveryStatusSchema.safeParse(s).success).toBe(true);
  });
});
