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
