/**
 * MinimumOwnerCockpit — Business condition headline is truthful about partial evidence.
 *
 * The collapsed summary must never present a rating among the KNOWN dimensions as an overall conclusion while
 * other dimensions are unassessed: no known dimension → no risk rating; partial evidence → "highest known risk"
 * with the unknown count visible before expansion; only complete evidence → "highest risk". Unknown is never LOW.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const route = (): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence"], completionCriteria: "Owner records a decision.",
  reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds",
  ownerVisibleSummary: "Approve the process correction", notActionableReason: null,
  evidenceRefs: ["proof-1"], severity: "CRITICAL", priorityRank: 1, status: "PROPOSED",
});
const bridge = (): ProcessExecutionBridgeView => ({ routes: [route()], topRoute: route(), summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } });

const ALL_UNKNOWN: DerivedBusinessConditionSignals = {
  cashPressureLevel: "unknown", marginPressureLevel: "unknown", clientConcentrationRisk: "unknown", ownerDependencyRisk: "unknown",
  keyPersonDependencyRisk: "unknown", processMaturityLevel: "unknown", managementMaturityLevel: "unknown", executionCapacityLevel: "unknown",
  moralFragilityLevel: "unknown", resilienceLevel: "unknown", growthReadinessLevel: "unknown",
};
const ALL_KNOWN_LOW: DerivedBusinessConditionSignals = {
  cashPressureLevel: "LOW", marginPressureLevel: "LOW", clientConcentrationRisk: "LOW", ownerDependencyRisk: "LOW",
  keyPersonDependencyRisk: "LOW", processMaturityLevel: "HIGH", managementMaturityLevel: "HIGH", executionCapacityLevel: "HIGH",
  moralFragilityLevel: "LOW", resilienceLevel: "HIGH", growthReadinessLevel: "HIGH",
};
const summaryText = (c: DerivedBusinessConditionSignals) => {
  const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} businessCondition={c} onAction={() => {}} />);
  return getByTestId("cockpit-business-condition-group").querySelector("summary")!.textContent ?? "";
};

describe("MinimumOwnerCockpit — Business condition summary", () => {
  it("PARTIAL_EVIDENCE: healthy maturity known, cash/margin unknown → scoped 'highest known risk' with the unknown count, never a bare 'highest risk: Low'", () => {
    const t = summaryText({ ...ALL_UNKNOWN, processMaturityLevel: "HIGH", managementMaturityLevel: "HIGH" });
    expect(t).toMatch(/highest known risk: Low/i);
    expect(t).toMatch(/9 dimensions need data/i);
    expect(t).not.toMatch(/highest risk: Low/i);
  });
  it("NO_KNOWN_DIMENSIONS_NEVER_SHOWS_RISK_RATING: all unknown → no rating at all", () => {
    const t = summaryText(ALL_UNKNOWN);
    expect(t).toMatch(/not enough data yet/i);
    expect(t).not.toMatch(/highest/i);
    expect(t).not.toMatch(/\b(low|medium|high|critical)\b/i);
  });
  it("COMPLETE_EVIDENCE_CAN_SHOW_OVERALL_RISK: every dimension known → ordinary 'highest risk'", () => {
    const t = summaryText(ALL_KNOWN_LOW);
    expect(t).toMatch(/highest risk: Low/i);
    expect(t).not.toMatch(/highest known/i);
    expect(t).not.toMatch(/need data/i);
  });
  it("partial evidence with genuine HIGH cash risk shows 'highest known risk: High' — not suppressed", () => {
    const t = summaryText({ ...ALL_UNKNOWN, cashPressureLevel: "HIGH", processMaturityLevel: "HIGH" });
    expect(t).toMatch(/highest known risk: High/i);
    expect(t).toMatch(/9 dimensions need data/i);
  });
  it("partial evidence with genuine CRITICAL margin risk shows 'highest known risk: Critical'", () => {
    const t = summaryText({ ...ALL_UNKNOWN, marginPressureLevel: "CRITICAL" });
    expect(t).toMatch(/highest known risk: Critical/i);
    expect(t).toMatch(/10 dimensions need data/i);
  });
  it("one unknown dimension uses the singular", () => {
    expect(summaryText({ ...ALL_KNOWN_LOW, marginPressureLevel: "unknown" })).toMatch(/1 dimension needs data/i);
  });
  it("unknown is never converted to LOW: the unknown dimensions are not listed as badges", () => {
    const { getByTestId, queryByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} businessCondition={{ ...ALL_UNKNOWN, processMaturityLevel: "HIGH" }} onAction={() => {}} />);
    expect(getByTestId("cockpit-condition-processMaturityLevel")).toBeTruthy();
    expect(queryByTestId("cockpit-condition-cashPressureLevel")).toBeNull();
    expect(queryByTestId("cockpit-condition-marginPressureLevel")).toBeNull();
  });
});
