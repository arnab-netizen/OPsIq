/**
 * Maximum-reliability — persisted expert adjudication queue tests.
 */
import { describe, it, expect } from "vitest";
import { AdjudicationQueue, needsAdjudication, riskOf } from "@/behavioral-validation/max-reliability/adjudication-queue";

const AT = "2026-06-30T00:00:00Z";
const baseItem = {
  caseId: "PC-1", sourceId: "SRC-SCORE-CASHFLOW", domain: "Cash flow", businessCategory: "retail",
  output: "spend now", goldAnswer: "protect cash first", failureLabels: ["bad_cash_advice"],
  assuranceFailures: ["high-impact action without FMEA"], proposedCorrection: "block discretionary spend until margin proof",
  proposedArtifactId: "art-1",
};

describe("adjudication queue", () => {
  it("a low-confidence high-impact case enters the queue", () => {
    const q = new AdjudicationQueue();
    const item = q.enqueueIfNeeded(baseItem, { lowConfidence: true, highImpactAssuranceFailure: true }, AT);
    expect(item).not.toBeNull();
    expect(item!.riskLevel).toBe("high");
    expect(q.report().open).toBe(1);
  });

  it("conflicting artifacts enter the queue", () => {
    const q = new AdjudicationQueue();
    expect(q.enqueueIfNeeded(baseItem, { artifactPlaybookConflict: true }, AT)).not.toBeNull();
  });

  it("a case with no triggers is NOT queued", () => {
    const q = new AdjudicationQueue();
    expect(q.enqueueIfNeeded(baseItem, {}, AT)).toBeNull();
    expect(needsAdjudication({})).toBe(false);
  });

  it("a rejected correction is NOT applied; an approved correction IS", () => {
    const q = new AdjudicationQueue();
    q.enqueueIfNeeded({ ...baseItem, caseId: "PC-R" }, { lowConfidence: true }, AT);
    q.resolve("PC-R", "rejected", "expert", AT);
    expect(q.correctionApplicable("PC-R")).toBe(false);

    q.enqueueIfNeeded({ ...baseItem, caseId: "PC-A" }, { lowConfidence: true }, AT);
    q.resolve("PC-A", "approved", "expert", AT);
    expect(q.correctionApplicable("PC-A")).toBe(true);
  });

  it("an unresolved high-risk item blocks MAX_READY; resolving it unblocks", () => {
    const q = new AdjudicationQueue();
    q.enqueueIfNeeded({ ...baseItem, caseId: "PC-H" }, { contradictionDetected: true }, AT);
    expect(q.blocksMaxReady()).toBe(true);
    q.resolve("PC-H", "approved", "expert", AT);
    expect(q.blocksMaxReady()).toBe(false);
  });

  it("risk classification escalates safety-critical triggers to high", () => {
    expect(riskOf({ complianceUncertainty: true })).toBe("high");
    expect(riskOf({ lowConfidence: true })).toBe("medium");
    expect(riskOf({ domainNearThreshold: true })).toBe("low");
  });

  it("the queue produces a report and is JSON-serialisable (persistable)", () => {
    const q = new AdjudicationQueue();
    q.enqueueIfNeeded({ ...baseItem, caseId: "PC-J" }, { lowConfidence: true }, AT);
    const json = JSON.parse(JSON.stringify(q.toJSON()));
    expect(json.length).toBe(1);
    const rehydrated = new AdjudicationQueue(json);
    expect(rehydrated.report().total).toBe(1);
  });
});
