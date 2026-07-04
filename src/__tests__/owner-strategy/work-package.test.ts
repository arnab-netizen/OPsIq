/**
 * Phase 7 — Workload Execution Engine + Work Package Generator tests
 * (GAP-005 + GAP-006).
 *
 * Proves the execution.md Phase 7 exit gate:
 *   - recommendations become Work Packages with real prepared artifacts + proof
 *   - the max SAFE workload-transfer level is chosen (0/1/2/5)
 *   - owner-only work is minimized (measurable owner-workload transfer)
 */
import { describe, it, expect } from "vitest";
import {
  generateWorkPackage,
  determineMaxTransferLevel,
} from "@/domain/owner-strategy/work-package";
import type { WorkPackageInput } from "@/domain/owner-strategy/work-package.types";

const REACTIVATION: WorkPackageInput = {
  title: "Win back dormant customers",
  problem: "40 customers have not ordered in 90 days.",
  actionKind: "customer_reactivation",
  evidence: ["repeatCustomers dropped 30%"],
  financialDecision: "APPROVED",
  riskLevel: "low",
  assigneeRole: "staff",
  businessName: "Sparkle Laundry",
};

describe("determineMaxTransferLevel", () => {
  it("assignable role → LEVEL_2 structured task execution", () => {
    expect(determineMaxTransferLevel({ ...REACTIVATION, assigneeRole: "staff" }).level).toBe(
      "LEVEL_2_STRUCTURED_TASK_EXECUTION",
    );
  });
  it("owner-executed → LEVEL_1 prepared work", () => {
    expect(determineMaxTransferLevel({ ...REACTIVATION, assigneeRole: "owner" }).level).toBe(
      "LEVEL_1_PREPARED_WORK",
    );
  });
  it("unsafe/illegal/outside authority → LEVEL_5 blocked", () => {
    expect(determineMaxTransferLevel({ ...REACTIVATION, isLegal: false }).level).toBe("LEVEL_5_BLOCKED");
    expect(determineMaxTransferLevel({ ...REACTIVATION, isSafe: false }).level).toBe("LEVEL_5_BLOCKED");
    expect(determineMaxTransferLevel({ ...REACTIVATION, withinAuthority: false }).level).toBe("LEVEL_5_BLOCKED");
  });
  it("financial governor BLOCKED → LEVEL_5 blocked", () => {
    expect(determineMaxTransferLevel({ ...REACTIVATION, financialDecision: "BLOCKED" }).level).toBe("LEVEL_5_BLOCKED");
  });
});

describe("generateWorkPackage — not advice, real prepared work", () => {
  it("produces prepared artifacts, steps, proof rules, and outcome measurement", () => {
    const wp = generateWorkPackage(REACTIVATION);
    expect(wp.preparedArtifacts.length).toBeGreaterThan(0);
    expect(wp.steps.length).toBeGreaterThan(0);
    expect(wp.requiredProof).toMatch(/tracker|proof|revenue/i);
    expect(wp.completionCriteria).toBeTruthy();
    expect(wp.rejectionCriteria).toMatch(/proof/i);
    expect(wp.measurementWindowDays).toBeGreaterThan(0);
    expect(wp.learningUpdateRule).toMatch(/playbook|reliability/i);
  });

  it("artifacts carry the business name and usable content (not placeholders)", () => {
    const wp = generateWorkPackage(REACTIVATION);
    const script = wp.preparedArtifacts.find((a) => a.kind === "customer_script");
    expect(script).toBeDefined();
    expect(script!.content).toContain("Sparkle Laundry");
    expect(script!.content.length).toBeGreaterThan(30);
    expect(wp.preparedArtifacts.some((a) => a.kind === "tracker")).toBe(true);
  });

  it("assigned to staff → LEVEL_2 and owner workload decreases", () => {
    const wp = generateWorkPackage(REACTIVATION);
    expect(wp.maxTransferLevel).toBe("LEVEL_2_STRUCTURED_TASK_EXECUTION");
    expect(wp.ownerWorkload.burdenChange).toBe("decreased");
    expect(wp.ownerWorkload.estimatedMinutesAfter).toBeLessThan(wp.ownerWorkload.estimatedMinutesBefore);
    expect(wp.ownerWorkload.ownerTaskAvoided).toBeTruthy();
  });

  it("owner-executed still gets prepared work (LEVEL_1) with reduced minutes", () => {
    const wp = generateWorkPackage({ ...REACTIVATION, assigneeRole: "owner" });
    expect(wp.maxTransferLevel).toBe("LEVEL_1_PREPARED_WORK");
    expect(wp.ownerWorkload.estimatedMinutesAfter).toBeLessThan(wp.ownerWorkload.estimatedMinutesBefore);
  });

  it("blocked action prepares nothing and escalates", () => {
    const wp = generateWorkPackage({ ...REACTIVATION, isLegal: false });
    expect(wp.blocked).toBe(true);
    expect(wp.maxTransferLevel).toBe("LEVEL_5_BLOCKED");
    expect(wp.preparedArtifacts).toHaveLength(0);
    expect(wp.warnings.join(" ")).toMatch(/lawful|escalat/i);
  });

  it("high risk / owner-approval action flags approval and shorter deadline", () => {
    const wp = generateWorkPackage({
      title: "Cut prices 20%",
      problem: "Sales slow",
      actionKind: "pricing_change",
      financialDecision: "NEEDS_OWNER_APPROVAL",
      riskLevel: "high",
      assigneeRole: "owner",
    });
    expect(wp.ownerApprovalRequired).toBe(true);
    expect(wp.deadlineDays).toBeLessThanOrEqual(5);
    expect(wp.warnings.join(" ")).toMatch(/approval/i);
  });

  it("generates the right artifact kinds per action kind", () => {
    expect(generateWorkPackage({ title: "t", problem: "p", actionKind: "complaint_recovery" }).preparedArtifacts.some((a) => a.kind === "complaint_recovery")).toBe(true);
    expect(generateWorkPackage({ title: "t", problem: "p", actionKind: "marketing_campaign" }).preparedArtifacts.some((a) => a.kind === "campaign_plan")).toBe(true);
    expect(generateWorkPackage({ title: "t", problem: "p", actionKind: "b2b_outreach" }).preparedArtifacts.some((a) => a.kind === "vendor_script")).toBe(true);
    expect(generateWorkPackage({ title: "t", problem: "p", actionKind: "sop_creation" }).preparedArtifacts.some((a) => a.kind === "sop")).toBe(true);
  });

  it("is deterministic", () => {
    expect(generateWorkPackage(REACTIVATION)).toEqual(generateWorkPackage(REACTIVATION));
  });
});
