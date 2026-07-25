import { describe, it, expect } from "vitest";
import {
  DataConfidenceStatus,
  assessDataConfidence,
  confidenceCeiling,
  canTreatAsFact,
  allowsHighConfidence,
  reversibleActionsOnly,
  type DataPoint,
} from "@/domain/domain-training/data-confidence";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";

const dp = (key: string, status: DataConfidenceStatus, critical = true): DataPoint => ({ key, status, critical });

describe("[F2] data confidence engine — module contract assertions", () => {
  it("DataConfidenceStatus is an object", () => { expect(typeof DataConfidenceStatus).toBe("object"); });
  it("assessDataConfidence is a function", () => { expect(typeof assessDataConfidence).toBe("function"); });
  it("confidenceCeiling is a function", () => { expect(typeof confidenceCeiling).toBe("function"); });
  it("canTreatAsFact is a function", () => { expect(typeof canTreatAsFact).toBe("function"); });
  it("allowsHighConfidence is a function", () => { expect(typeof allowsHighConfidence).toBe("function"); });
  it("reversibleActionsOnly is a function", () => { expect(typeof reversibleActionsOnly).toBe("function"); });
  it("EvidenceConfidenceLevel is an object", () => { expect(typeof EvidenceConfidenceLevel).toBe("object"); });
  it("DataConfidenceStatus.VERIFIED is defined", () => { expect(DataConfidenceStatus.VERIFIED).toBeDefined(); });
  it("DataConfidenceStatus.MISSING is defined", () => { expect(DataConfidenceStatus.MISSING).toBeDefined(); });
  it("DataConfidenceStatus.STALE is defined", () => { expect(DataConfidenceStatus.STALE).toBeDefined(); });
  it("EvidenceConfidenceLevel.VERIFIED is defined", () => { expect(EvidenceConfidenceLevel.VERIFIED).toBeDefined(); });
  it("dp is a function", () => { expect(typeof dp).toBe("function"); });
  it("dp('cash', DataConfidenceStatus.VERIFIED) returns an object with key field", () => { expect(dp("cash", DataConfidenceStatus.VERIFIED)).toHaveProperty("key"); });
  it("canTreatAsFact(DataConfidenceStatus.VERIFIED) is true", () => { expect(canTreatAsFact(DataConfidenceStatus.VERIFIED)).toBe(true); });
});

describe("[F2] data confidence engine", () => {
  it("verified data allows higher (VERIFIED) confidence", () => {
    const a = assessDataConfidence([dp("cash", DataConfidenceStatus.VERIFIED), dp("oblig", DataConfidenceStatus.VERIFIED)]);
    expect(a.ceiling).toBe(EvidenceConfidenceLevel.VERIFIED);
    expect(allowsHighConfidence(a)).toBe(true);
  });

  it("missing critical data blocks high confidence", () => {
    const a = assessDataConfidence([dp("cash", DataConfidenceStatus.VERIFIED), dp("oblig", DataConfidenceStatus.MISSING)]);
    expect(a.ceiling).toBe(EvidenceConfidenceLevel.INSUFFICIENT);
    expect(a.missingCritical).toContain("oblig");
    expect(allowsHighConfidence(a)).toBe(false);
  });

  it("contradictory critical data blocks confident recommendation", () => {
    const a = assessDataConfidence([dp("cash", DataConfidenceStatus.CONTRADICTORY)]);
    expect(a.blockedByContradiction).toBe(true);
    expect(a.ceiling).toBe(EvidenceConfidenceLevel.INSUFFICIENT);
    expect(allowsHighConfidence(a)).toBe(false);
    expect(reversibleActionsOnly(a)).toBe(true);
  });

  it("stale data downgrades confidence one step", () => {
    const a = assessDataConfidence([dp("cash", DataConfidenceStatus.VERIFIED), dp("rev", DataConfidenceStatus.STALE)]);
    // weakest = STALE → WEAK, then stale downgrade → INSUFFICIENT
    expect(a.staleDowngradeApplied).toBe(true);
    expect(a.ceiling).toBe(EvidenceConfidenceLevel.INSUFFICIENT);
  });

  it("estimated data only allows conservative/reversible recommendations", () => {
    const a = assessDataConfidence([dp("cash", DataConfidenceStatus.ESTIMATED)]);
    expect(a.ceiling).toBe(EvidenceConfidenceLevel.WEAK);
    expect(allowsHighConfidence(a)).toBe(false);
    expect(reversibleActionsOnly(a)).toBe(true);
  });

  it("only VERIFIED is treated as fact; reported/estimated are not", () => {
    expect(canTreatAsFact(DataConfidenceStatus.VERIFIED)).toBe(true);
    expect(canTreatAsFact(DataConfidenceStatus.OWNER_REPORTED)).toBe(false);
    expect(canTreatAsFact(DataConfidenceStatus.ESTIMATED)).toBe(false);
    expect(confidenceCeiling(DataConfidenceStatus.OWNER_REPORTED)).toBe(EvidenceConfidenceLevel.MODERATE);
    expect(confidenceCeiling(DataConfidenceStatus.MANIPULABLE)).toBe(EvidenceConfidenceLevel.INSUFFICIENT);
  });

  it("non-critical weak data still caps the overall ceiling (weakest point wins)", () => {
    const a = assessDataConfidence([dp("cash", DataConfidenceStatus.VERIFIED), dp("note", DataConfidenceStatus.ESTIMATED, false)]);
    expect(a.ceiling).toBe(EvidenceConfidenceLevel.WEAK);
  });
});
