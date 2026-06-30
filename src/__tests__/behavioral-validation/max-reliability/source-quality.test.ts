/**
 * Maximum-reliability — source-quality + validity tests.
 */
import { describe, it, expect } from "vitest";
import { scoreSource, validateSourceRef, canGloballyPromote, sourceRegisterReliabilitySummary, markingErrors } from "@/behavioral-validation/max-reliability/source-quality";
import { SOURCE_REGISTER, type SourceRecord } from "@/behavioral-validation/public-cases/source-register";
import { publicCaseMetaSchema } from "@/behavioral-validation/public-cases/schema";

const base: SourceRecord = { ...SOURCE_REGISTER[0] };

describe("source quality + validity assurance", () => {
  it("a hallucinated / malformed source ID fails validation", () => {
    expect(validateSourceRef("SRC-DOES-NOT-EXIST")).toBe(false);
    expect(validateSourceRef("not-a-source-id")).toBe(false);
    expect(validateSourceRef(SOURCE_REGISTER[0].id)).toBe(true);
  });

  it("a low-reliability source cannot globally promote learning on its own", () => {
    expect(canGloballyPromote({ ...base, reliability: "low" })).toBe(false);
    expect(canGloballyPromote({ ...base, reliability: "medium" })).toBe(false);
  });

  it("a high-reliability clean source is globally promotable", () => {
    const highClean = SOURCE_REGISTER.find((r) => r.reliability === "high");
    expect(highClean).toBeDefined();
    expect(canGloballyPromote(highClean!)).toBe(true);
  });

  it("an inferred fact double-claimed as directly-supported fails marking", () => {
    const rec: SourceRecord = { ...base, factsUsed: ["cash ran out in 12 days"], factsInferred: ["cash ran out in 12 days"] };
    expect(markingErrors(rec).length).toBeGreaterThan(0);
    expect(scoreSource(rec).globalPromotionEligible).toBe(false);
  });

  it("a synthetic case variant without lineage fails the schema (synthetic must carry lineage)", () => {
    const meta = { ...publicCaseMetaSchemaSample(), realFlag: "variant", lineageParentId: undefined };
    expect(publicCaseMetaSchema.safeParse(meta).success).toBe(false);
  });

  it("PII in a source fails", () => {
    const rec: SourceRecord = { ...base, factsUsed: ["owner email is jane.doe@example.com"] };
    expect(scoreSource(rec).piiRisk).toBe(true);
    expect(scoreSource(rec).globalPromotionEligible).toBe(false);
  });

  it("long copied text in a source fails", () => {
    const rec: SourceRecord = { ...base, factsUsed: ["x".repeat(400)] };
    expect(scoreSource(rec).longTextRisk).toBe(true);
    expect(scoreSource(rec).globalPromotionEligible).toBe(false);
  });

  it("the register reliability summary is produced (for the report)", () => {
    const s = sourceRegisterReliabilitySummary();
    expect(s.total).toBe(SOURCE_REGISTER.length);
    expect(s.byReliability.low + s.byReliability.medium + s.byReliability.high).toBe(s.total);
    expect(s.piiOrLongText).toBe(0); // the committed register is clean
  });
});

/** Minimal valid meta sample (only used to flip realFlag/lineage for the schema test). */
function publicCaseMetaSchemaSample() {
  return {
    caseId: "PC-X", realFlag: "real", sourceRef: "SRC-SCORE-CASHFLOW", patternId: "p1", businessCategory: "retail",
    businessStage: "established", severity: "normal", dominantConstraint: "cash_survival", domains: ["Cash flow"],
    crossDomainConflicts: [], businessMathRequired: true, plan7Day: "do x", plan30Day: "do y", plan90Day: "do z",
    goldSkeleton: { rootCause: "cash ran out from overtrading", dominantConstraint: "cash_survival", whatNotToDo: ["do not spend"], nextBestAction: "recover receivables now", proofRequired: ["bank statement"], reassessment: "weekly cash review" },
    scoringLabels: [], collective: false, privacyNote: "metadata only", productionRuntimeEligible: true,
    browserRepresentative: false, holdoutProtected: false, split: "training",
  };
}
