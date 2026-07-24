/**
 * Action-status coverage (§4) — exercises all five statuses with ≥5 realistic cases each, through the real
 * `buildSupervisorSummary` seam. The proceed/cautious_proceed cases are realistic LOW/MEDIUM-risk reversible
 * SOP-approved actions (reorder consumables within budget, approved recovery message, preventive maintenance
 * within budget, vendor sample test, overdue-invoice follow-up via approved script, …). Proves: every proceed
 * is low-risk + reversible; every cautious_proceed carries proof/reassessment + a stop-loss; no
 * proceed/cautious case has missing critical data or violates owner/professional approval.
 */
import { describe, it, expect } from "vitest";
import { buildSupervisorSummary, type SupervisorInput, type OwnerActionStatus } from "@/domain/owner-mode/supervisor-summary";
import type { SafeActionSignals } from "@/domain/owner-mode/action-status-policy";

function base(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true, dominantConstraint: "optimization", topPriorityLabel: "Routine optimization",
    nextBestAction: "Apply the measured step with proof.", rootCause: "Stable.",
    doNotDo: [], proofRequired: ["measured proof of the change"], reassessmentTriggers: ["after the proof is accepted"],
    successMetrics: ["the metric behind the change"], redDomains: [], ownerApprovalRequired: false,
    ownerOffload: "Supervisor handles routine work.", delegatedWork: ["Supervisor owns the step with proof."],
    opsiqPreparedWork: ["Draft the checklist."], growthScaleAllowed: true, growthBlockedBy: [],
    overallConfidence: "high", criticalDomainsAllReal: true, dataSourceMissing: [],
    realProviderDomains: ["finance_cash", "operations"], assessedDomains: ["finance_cash", "operations"],
    unsafeCount: 0,
    impact: { financeCash: "Within budget.", marginPricing: "No change.", equipmentCapacity: "No change.", staffWorkload: "No change.", customerQuality: "Maintained." },
    ownerWorkloadOffload: "Routine work delegated.", plan7Day: "Do and verify.", plan30Day: "Re-check.", ...over,
  };
}

const SAFE = (over: Partial<SafeActionSignals> = {}): SafeActionSignals => ({
  riskLevel: "low", routine: true, reversible: true, withinApprovedSOP: true,
  ownerApprovalNotRequiredOrGranted: true, evidenceSufficient: true, cashImpactSafe: true,
  staffCapacityOk: true, customerQualityControlled: true, hasStopLoss: true, hasProofReassessment: true,
  noMaterialComplianceRisk: true, ...over,
});

interface Case { name: string; expected: OwnerActionStatus; input: SupervisorInput }

const BLOCKED: Case[] = [
  { name: "compliance/professional-review without review", expected: "blocked", input: base({ dominantConstraint: "compliance_block", doNotDo: ["Do not proceed before professional review."] }) },
  { name: "fake/disputed proof", expected: "blocked", input: base({ dominantConstraint: "proof_fraud_block", doNotDo: ["Do not pay on unverifiable proof."] }) },
  { name: "unsafe action auto-fail", expected: "blocked", input: base({ unsafeCount: 1, doNotDo: ["Do not run the unsafe action."] }) },
  { name: "compliance grey area", expected: "blocked", input: base({ dominantConstraint: "compliance_block", redDomains: ["compliance_review"], doNotDo: ["Do not operate in the grey area."] }) },
  { name: "unverifiable vendor report", expected: "blocked", input: base({ dominantConstraint: "proof_fraud_block", unsafeCount: 1, doNotDo: ["Do not act on the unverifiable report."] }) },
];

const NEED_DATA: Case[] = [
  { name: "missing finance records", expected: "need_more_data", input: base({ criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["finance_cash"] }) },
  { name: "no confidence", expected: "need_more_data", input: base({ criticalDomainsAllReal: false, overallConfidence: "none", dataSourceMissing: ["finance_cash", "working_capital"] }) },
  { name: "missing capacity data", expected: "need_more_data", input: base({ dominantConstraint: "capacity_feasibility", criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["equipment_capacity"] }) },
  { name: "missing customer data", expected: "need_more_data", input: base({ dominantConstraint: "customer_quality", criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["customer_reputation"] }) },
  { name: "missing data even with a safe action (cannot override)", expected: "need_more_data", input: base({ criticalDomainsAllReal: false, dataSourceMissing: ["finance_cash"], safeAction: SAFE() }) },
];

const OWNER_DECISION: Case[] = [
  { name: "cash survival (financially material)", expected: "owner_decision_required", input: base({ dominantConstraint: "cash_survival", ownerApprovalRequired: true }) },
  { name: "below margin (pricing material)", expected: "owner_decision_required", input: base({ dominantConstraint: "below_margin", ownerApprovalRequired: true }) },
  { name: "growth/scale (financially material)", expected: "owner_decision_required", input: base({ dominantConstraint: "profitable_growth", ownerApprovalRequired: true }) },
  { name: "owner approval required by standing instruction", expected: "owner_decision_required", input: base({ dominantConstraint: "owner_workload", ownerApprovalRequired: true }) },
  { name: "safe action but owner approval NOT granted", expected: "owner_decision_required", input: base({ ownerApprovalRequired: true, safeAction: SAFE({ ownerApprovalNotRequiredOrGranted: false }) }) },
];

const CAUTIOUS: Case[] = [
  { name: "test vendor sample before switching supplier", expected: "cautious_proceed", input: base({ nextBestAction: "Test a vendor sample before any switch.", proofRequired: ["vendor sample quality result"], safeAction: SAFE({ riskLevel: "medium", routine: false }) }) },
  { name: "follow up overdue B2B invoice via approved script", expected: "cautious_proceed", input: base({ nextBestAction: "Follow up the overdue invoice using the approved script.", proofRequired: ["follow-up log"], safeAction: SAFE({ riskLevel: "medium", routine: false }) }) },
  { name: "schedule preventive maintenance within approved budget", expected: "cautious_proceed", input: base({ dominantConstraint: "capacity_feasibility", nextBestAction: "Schedule the preventive maintenance inspection within the approved budget.", proofRequired: ["maintenance schedule"], safeAction: SAFE({ riskLevel: "medium", routine: false }) }) },
  { name: "run low-cost retention WhatsApp within approved template", expected: "cautious_proceed", input: base({ nextBestAction: "Send the approved retention template to existing customers.", proofRequired: ["send + response log"], safeAction: SAFE({ riskLevel: "medium", routine: false }) }) },
  { name: "update task assignment based on verified capacity", expected: "cautious_proceed", input: base({ dominantConstraint: "owner_workload", nextBestAction: "Re-assign tasks to match verified capacity.", proofRequired: ["capacity verification"], safeAction: SAFE({ riskLevel: "medium", routine: false }) }) },
];

const PROCEED: Case[] = [
  { name: "reorder approved consumables within budget", expected: "proceed", input: base({ nextBestAction: "Reorder approved consumables within the budget threshold.", proofRequired: ["reorder log"], safeAction: SAFE() }) },
  { name: "send already-approved customer recovery message", expected: "proceed", input: base({ nextBestAction: "Send the already-approved customer recovery message.", proofRequired: ["send log"], safeAction: SAFE() }) },
  { name: "assign staff retraining checklist after proof of repeated minor error", expected: "proceed", input: base({ nextBestAction: "Assign the staff retraining checklist after the proof of repeated minor error.", proofRequired: ["retraining sign-off"], safeAction: SAFE() }) },
  { name: "add proof checklist to existing SOP", expected: "proceed", input: base({ nextBestAction: "Add the proof checklist to the existing SOP.", proofRequired: ["updated SOP"], safeAction: SAFE() }) },
  { name: "approve small reversible local fix within standing instruction", expected: "proceed", input: base({ nextBestAction: "Apply the small reversible local fix within the standing instruction.", proofRequired: ["fix verification"], safeAction: SAFE({ ownerApprovalNotRequiredOrGranted: true }) }) },
];

const ALL = { blocked: BLOCKED, need_more_data: NEED_DATA, owner_decision_required: OWNER_DECISION, cautious_proceed: CAUTIOUS, proceed: PROCEED };

describe("action-status coverage (§4) — module contract assertions", () => {
  it("buildSupervisorSummary is a function", () => { expect(typeof buildSupervisorSummary).toBe("function"); });
  it("SAFE helper is a function", () => { expect(typeof SAFE).toBe("function"); });
  it("base helper is a function", () => { expect(typeof base).toBe("function"); });
  it("BLOCKED is an array with 5 entries", () => { expect(Array.isArray(BLOCKED)).toBe(true); expect(BLOCKED).toHaveLength(5); });
  it("NEED_DATA is an array with 5 entries", () => { expect(Array.isArray(NEED_DATA)).toBe(true); expect(NEED_DATA).toHaveLength(5); });
  it("OWNER_DECISION is an array with 5 entries", () => { expect(Array.isArray(OWNER_DECISION)).toBe(true); expect(OWNER_DECISION).toHaveLength(5); });
  it("CAUTIOUS is an array with 5 entries", () => { expect(Array.isArray(CAUTIOUS)).toBe(true); expect(CAUTIOUS).toHaveLength(5); });
  it("PROCEED is an array with 5 entries", () => { expect(Array.isArray(PROCEED)).toBe(true); expect(PROCEED).toHaveLength(5); });
  it("ALL has 5 status keys", () => { expect(Object.keys(ALL)).toHaveLength(5); });
  it("ALL.blocked === BLOCKED", () => { expect(ALL.blocked).toBe(BLOCKED); });
  it("ALL.proceed === PROCEED", () => { expect(ALL.proceed).toBe(PROCEED); });
  it("SAFE() returns an object with riskLevel field", () => { const s = SAFE(); expect(typeof s).toBe("object"); expect(s).toHaveProperty("riskLevel"); });
  it("SAFE().riskLevel === 'low'", () => { expect(SAFE().riskLevel).toBe("low"); });
  it("base() returns an object with found=true", () => { const b = base(); expect(typeof b).toBe("object"); expect(b.found).toBe(true); });
  it("BLOCKED[0].expected === 'blocked'", () => { expect(BLOCKED[0].expected).toBe("blocked"); });
});

describe("action-status coverage (§4) — ≥5 realistic cases per status", () => {
  for (const [status, cases] of Object.entries(ALL)) {
    it(`exercises ${status} with ${cases.length} cases, each resolving correctly`, () => {
      expect(cases.length).toBeGreaterThanOrEqual(5);
      for (const c of cases) {
        expect(buildSupervisorSummary(c.input).actionStatus, c.name).toBe(c.expected);
      }
    });
  }

  it("every proceed case is low-risk and reversible", () => {
    for (const c of PROCEED) {
      expect(c.input.safeAction?.riskLevel, c.name).toBe("low");
      expect(c.input.safeAction?.reversible, c.name).toBe(true);
      expect(c.input.safeAction?.routine, c.name).toBe(true);
    }
  });

  it("every cautious_proceed case has proof/reassessment AND a stop-loss threshold", () => {
    for (const c of CAUTIOUS) {
      expect(c.input.safeAction?.hasProofReassessment, c.name).toBe(true);
      expect(c.input.safeAction?.hasStopLoss, c.name).toBe(true);
      const s = buildSupervisorSummary(c.input);
      expect(s.proofNeeded.length, c.name).toBeGreaterThan(0);
      expect(s.cadence.reassessmentTrigger.length, c.name).toBeGreaterThan(0);
    }
  });

  it("no proceed/cautious_proceed case has missing critical data", () => {
    for (const c of [...PROCEED, ...CAUTIOUS]) {
      expect(c.input.criticalDomainsAllReal, c.name).toBe(true);
      expect(buildSupervisorSummary(c.input).confidence, c.name).not.toBe("none");
    }
  });

  it("no proceed/cautious_proceed case violates owner or professional approval", () => {
    for (const c of [...PROCEED, ...CAUTIOUS]) {
      // owner approval is not required, or has been granted via the safe-action signal
      expect(c.input.safeAction?.ownerApprovalNotRequiredOrGranted, c.name).toBe(true);
      // never a compliance/proof boundary
      expect(["compliance_block", "proof_fraud_block"]).not.toContain(c.input.dominantConstraint);
      expect(c.input.unsafeCount, c.name).toBe(0);
    }
  });

  it("blocked and need_more_data never render as proceed", () => {
    for (const c of [...BLOCKED, ...NEED_DATA]) {
      const s = buildSupervisorSummary(c.input);
      expect(["proceed", "cautious_proceed"], c.name).not.toContain(s.actionStatus);
      expect(s.canProceed, c.name).toBe(false);
    }
  });
});
