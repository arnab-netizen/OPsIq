import { describe, it, expect } from "vitest";
import { buildFinanceAcceptanceContract, type AcceptanceContractFacts } from "@/domain/owner-first-run/acceptance-contract";
import { financeActionDecisionNote } from "@/domain/owner-finance/action-decision-note";
import { contractGuidance, contractLines, earlyCheckExplanation, type OwnerDecisionRecordDto, type OwnerOutcomeAssessmentDto } from "@/domain/owner-spine/owner-outcome-presentation";

const facts = (o: { action?: Partial<AcceptanceContractFacts["action"]>; readCycle?: Partial<AcceptanceContractFacts["readCycle"]>; authoritativeEvidence?: boolean } = {}): AcceptanceContractFacts => ({
  action: { id: "a1", cycleId: "c1", title: "Improve data completeness", verificationMetric: "dataConfidenceScore", expectedTimeframeDays: 7, findingCode: "FIN_OPP_DATA_QUALITY", ...o.action },
  readCycle: { id: "c1", dataConfidenceScore: 35, ...o.readCycle },
  authoritativeEvidence: o.authoritativeEvidence ?? false,
});

describe("buildFinanceAcceptanceContract", () => {
  it("live case: baseline = the cycle's persisted score (MEASURED), direction from the registry, window from the action, NO target", () => {
    const { contract, missing } = buildFinanceAcceptanceContract(facts());
    expect(contract).toMatchObject({ verificationMetric: "dataConfidenceScore", baselineValue: 35, baselineProvenance: "MEASURED", targetDirection: "up", observationWindowDays: 7, expectedMeasurementSource: "OWNER_ENTERED" });
    expect(contract.targetValue).toBeUndefined();
    expect(missing).toEqual(["target"]);
  });
  it("a baseline is taken only from the action's own cycle: a different cycle yields no baseline", () => {
    const { contract, missing } = buildFinanceAcceptanceContract(facts({ readCycle: { id: "c2" } }));
    expect(contract.baselineValue).toBeUndefined();
    expect(contract.baselineProvenance).toBeUndefined();
    expect(missing).toEqual(["baseline", "target"]);
  });
  it("unregistered metric: baseline stays unknown; a known zero score is a real baseline, not unknown", () => {
    expect(buildFinanceAcceptanceContract(facts({ action: { verificationMetric: "netMarginPct", findingCode: "FIN_OPP_MARGIN_IMPROVEMENT" } })).contract.baselineValue).toBeUndefined();
    expect(buildFinanceAcceptanceContract(facts({ readCycle: { dataConfidenceScore: 0 } })).contract.baselineValue).toBe(0);
  });
  it("missing or non-finite score never becomes a baseline", () => {
    for (const v of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildFinanceAcceptanceContract(facts({ readCycle: { dataConfidenceScore: v as number | null } })).contract.baselineValue).toBeUndefined();
    }
  });
  it("unknown metric direction stays unknown (never guessed from the name) and is reported as missing", () => {
    const { contract, missing } = buildFinanceAcceptanceContract(facts({ action: { verificationMetric: "someNewMetric" } }));
    expect(contract.targetDirection).toBeUndefined();
    expect(missing).toEqual(["baseline", "direction", "target"]);
  });
  it("prototype-pollution style metric names do not hit the registry", () => {
    expect(buildFinanceAcceptanceContract(facts({ action: { verificationMetric: "constructor" } })).contract.baselineValue).toBeUndefined();
  });
  it("evidence stays owner-entered unless authoritative, and is never upgraded by this builder", () => {
    expect(buildFinanceAcceptanceContract(facts({ authoritativeEvidence: false })).contract.expectedMeasurementSource).toBe("OWNER_ENTERED");
    expect(buildFinanceAcceptanceContract(facts({ authoritativeEvidence: true })).contract.expectedMeasurementSource).toBe("AUTHORITATIVE_SNAPSHOT");
  });
  it("window is at least one day", () => {
    expect(buildFinanceAcceptanceContract(facts({ action: { expectedTimeframeDays: 0 } })).contract.observationWindowDays).toBe(1);
  });
});

describe("financeActionDecisionNote", () => {
  it("accepted + proposed says the work has not been started (acceptance never implies progress)", () => {
    expect(financeActionDecisionNote("ACCEPTED", "proposed")).toMatch(/accepted this · the work has not been started/);
    expect(financeActionDecisionNote("ACCEPTED", "completed")).toMatch(/marked done/);
  });
  it("no decision → no note; rejected/deferred carry their own wording", () => {
    expect(financeActionDecisionNote(null, "proposed")).toBeNull();
    expect(financeActionDecisionNote("REJECTED", "proposed")).toBe("You decided not to do this.");
    expect(financeActionDecisionNote("DEFERRED", "proposed")).toBe("You decided to revisit this later.");
  });
});

const decision = (o: Partial<OwnerDecisionRecordDto> = {}): OwnerDecisionRecordDto => ({
  id: "d1", candidateId: "domain_action:finance:x", candidateSource: "domain_action", domain: "finance", decisionState: "ACCEPTED", sequence: 1,
  verificationMetric: "dataConfidenceScore", baselineValue: null, baselineProvenance: null, targetDirection: "unknown", targetValue: null, observationWindowDays: 7,
  commitmentDescription: "Improve data completeness", intendedCompletionAt: null, expectedMeasurementSource: "OWNER_ENTERED",
  ...o,
} as unknown as OwnerDecisionRecordDto);

describe("Results presentation", () => {
  it("never shows the technical metric key", () => {
    const line = contractLines(decision()).find((l) => l.label === "What will be measured");
    expect(line?.value).toBe("data confidence score");
  });
  it("explains each missing part of the contract; an estimate is not a target; nothing for a complete one or a non-committing decision", () => {
    const g = contractGuidance(decision());
    expect(g).toHaveLength(3);
    expect(g.join(" ")).toMatch(/estimate, not a commitment/);
    expect(contractGuidance(decision({ baselineValue: 35, baselineProvenance: "MEASURED", targetDirection: "up", targetValue: 45 }))).toEqual([]);
    expect(contractGuidance(decision({ decisionState: "REJECTED" }))).toEqual([]);
    expect(contractGuidance(decision({ baselineValue: 0, baselineProvenance: "OWNER_REPORTED", targetDirection: "up", targetValue: 0 }))).toEqual([]); // zero is known
  });
  it("early check explains: correction is not completion; plan window vs the time the check was requested", () => {
    const a = { executionStatus: "NOT_STARTED", assessedAt: "2026-11-24T10:00:00.000Z" } as unknown as OwnerOutcomeAssessmentDto;
    const text = earlyCheckExplanation(decision(), a) ?? "";
    expect(text).toMatch(/does not count as doing the work/);
    expect(text).toMatch(/7 days/);
    expect(text).toMatch(/2026-11-24/);
    expect(earlyCheckExplanation(decision(), { ...a, executionStatus: "COMPLETED" } as OwnerOutcomeAssessmentDto)).toBeNull();
    expect(earlyCheckExplanation(decision(), null)).toBeNull();
    expect(earlyCheckExplanation(decision({ decisionState: "DEFERRED" }), a)).toBeNull();
  });
});
