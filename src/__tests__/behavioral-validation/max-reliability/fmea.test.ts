/**
 * Maximum-reliability — FMEA assurance tests.
 * Proves high-impact recommendations must carry complete, low-residual-risk failure-mode analysis, that
 * high severity + low detectability escalates/blocks, that owner override needs an audit + risk note, and
 * that FMEA can override a naive "proceed".
 */
import { describe, it, expect } from "vitest";
import { requireFmea, assessFmea, fmeaAdjustedDisposition, isHighImpact, type FmeaInput } from "@/behavioral-validation/max-reliability/fmea";

const lowRisk: FmeaInput = {
  action: "marketing_spend", failureMode: "spend yields no incremental profit", cause: "weak targeting",
  severity: 4, likelihood: 4, detectability: 3, mitigation: "cap spend; track payback weekly",
  proofRequired: ["weekly ROAS after refunds"], stopCondition: "pause if payback > 8 weeks",
  reassessmentMetric: "marketing payback months",
};

describe("FMEA assurance", () => {
  it("a high-impact action WITHOUT an FMEA fails", () => {
    const r = requireFmea("branch_expansion");
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("high-impact action without FMEA");
  });

  it("a complete low-risk FMEA on a high-impact action passes", () => {
    const r = requireFmea("marketing_spend", lowRisk);
    expect(r.ok).toBe(true);
    expect(r.escalate).toBe(false);
  });

  it("high severity + low detectability escalates and requires owner approval", () => {
    const fmea: FmeaInput = { ...lowRisk, action: "loan_emi", severity: 9, likelihood: 5, detectability: 8 };
    const r = requireFmea("loan_emi", fmea); // no owner approval granted
    expect(r.escalate).toBe(true);
    expect(r.entry!.ownerApprovalRequired).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /owner approval required/.test(f))).toBe(true);
  });

  it("a missing stop condition fails", () => {
    const r = requireFmea("discount", { ...lowRisk, action: "discount", stopCondition: "" });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("missing stop condition");
  });

  it("owner override requires a recorded reason + actor (audit) and a risk note", () => {
    const fmea: FmeaInput = { ...lowRisk, action: "owner_override" };
    const noAudit = requireFmea("owner_override", fmea, { ownerApprovalGranted: true });
    expect(noAudit.ok).toBe(false);
    expect(noAudit.failures.some((f) => /audit/.test(f))).toBe(true);
    const withAudit = requireFmea("owner_override", fmea, { ownerApprovalGranted: true, ownerOverrideAudit: { reason: "Owner accepts the documented risk for a strategic client", actor: "owner" } });
    expect(withAudit.ok).toBe(true);
  });

  it("FMEA changes the final decision where residual risk is high", () => {
    const severe: FmeaInput = { ...lowRisk, action: "shutdown_pivot", severity: 9, likelihood: 8, detectability: 8 };
    expect(fmeaAdjustedDisposition("proceed", severe)).toBe("block");
    expect(assessFmea(severe).rpn).toBeGreaterThanOrEqual(400);
  });

  it("a professional-review boundary appears for compliance-sensitive actions", () => {
    expect(assessFmea({ ...lowRisk, action: "compliance_action" }).professionalReviewRequired).toBe(true);
    expect(assessFmea(lowRisk).professionalReviewRequired).toBe(false);
  });

  it("non-high-impact actions are not gated", () => {
    expect(isHighImpact("send_reminder")).toBe(false);
    expect(requireFmea("send_reminder").ok).toBe(true);
  });
});
