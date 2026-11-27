import { describe, it, expect } from "vitest";
import { applyDecisionContractToSystemAInput, type DecisionContractFacts } from "@/domain/owner-spine/owner-outcome-spine";
import type { OwnerOutcomeInput } from "@/domain/owner-spine/owner-outcome-policy";

const NOW = new Date("2026-11-24T09:00:00Z");
const base = (o: Partial<OwnerOutcomeInput> = {}): OwnerOutcomeInput => ({
  domain: "finance", actionId: "a1", executionStatus: "NOT_STARTED", completedAt: null, verificationMetric: "dataConfidenceScore",
  baselineValue: null, baselineProvenance: "UNKNOWN", afterValue: null, afterProvenance: "NONE", afterMeasuredAt: null,
  direction: "unknown", targetValue: null, windowDays: 7, disputed: false, externalEvent: false, verifierKind: "NONE",
  verificationAttempted: false, verifiedAt: null, newerDiagnosis: null, learningLoop: "FINANCE_BRIDGE", now: NOW, ...o,
});
const dec = (o: Partial<DecisionContractFacts> = {}): DecisionContractFacts => ({
  decisionState: "ACCEPTED", verificationMetric: "dataConfidenceScore", baselineValue: 35, baselineProvenance: "MEASURED",
  targetDirection: "up", targetValue: 45, ...o,
});

describe("applyDecisionContractToSystemAInput", () => {
  it("fills unknown baseline, direction and target from an ACCEPTED commitment, with the recorded provenance", () => {
    const out = applyDecisionContractToSystemAInput(base(), dec());
    expect([out.baselineValue, out.baselineProvenance, out.direction, out.targetValue]).toEqual([35, "MEASURED", "up", 45]);
  });
  it("applies to MODIFIED too", () => {
    expect(applyDecisionContractToSystemAInput(base(), dec({ decisionState: "MODIFIED" })).targetValue).toBe(45);
  });
  it("never applies for REJECTED / DEFERRED decisions or when there is no decision", () => {
    for (const s of ["REJECTED", "DEFERRED"]) expect(applyDecisionContractToSystemAInput(base(), dec({ decisionState: s }))).toEqual(base());
    expect(applyDecisionContractToSystemAInput(base(), null)).toEqual(base());
  });
  it("never overrides a value the System A source already holds", () => {
    const held = base({ baselineValue: 10, baselineProvenance: "OWNER_REPORTED", direction: "down", targetValue: 5 });
    const out = applyDecisionContractToSystemAInput(held, dec());
    expect([out.baselineValue, out.baselineProvenance, out.direction, out.targetValue]).toEqual([10, "OWNER_REPORTED", "down", 5]);
  });
  it("ignores a commitment that names a different metric than the action measures", () => {
    expect(applyDecisionContractToSystemAInput(base(), dec({ verificationMetric: "net_margin_pct" }))).toEqual(base());
  });
  it("unknown stays unknown: null fields, 'unknown' direction and a baseline without provenance are not applied", () => {
    const out = applyDecisionContractToSystemAInput(base(), dec({ baselineValue: null, baselineProvenance: null, targetDirection: "unknown", targetValue: null }));
    expect(out).toEqual(base());
    expect(applyDecisionContractToSystemAInput(base(), dec({ baselineProvenance: null })).baselineValue).toBeNull();
  });
  it("a known zero is applied (zero is not unknown)", () => {
    const out = applyDecisionContractToSystemAInput(base(), dec({ baselineValue: 0, targetValue: 0, targetDirection: "down" }));
    expect([out.baselineValue, out.targetValue, out.direction]).toEqual([0, 0, "down"]);
  });
  it("never touches execution, after-value or verification facts", () => {
    const out = applyDecisionContractToSystemAInput(base(), dec());
    expect([out.executionStatus, out.afterValue, out.afterProvenance, out.verificationAttempted, out.verifierKind, out.learningLoop])
      .toEqual(["NOT_STARTED", null, "NONE", false, "NONE", "FINANCE_BRIDGE"]);
  });
  it("does not mutate its input", () => {
    const input = base();
    applyDecisionContractToSystemAInput(input, dec());
    expect(input).toEqual(base());
  });
});
