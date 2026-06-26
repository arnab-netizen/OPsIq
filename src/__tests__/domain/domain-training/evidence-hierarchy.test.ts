import { describe, it, expect } from "vitest";
import {
  EvidenceType,
  isStrongerThan,
  resolveContradiction,
  canOverride,
  canCloseHighRiskAlone,
  isAcceptableAsProof,
} from "@/domain/domain-training/evidence-hierarchy";

describe("[F3] evidence hierarchy", () => {
  it("stronger evidence overrides weaker contradiction", () => {
    expect(resolveContradiction(EvidenceType.SYSTEM_TRANSACTION, EvidenceType.OWNER_RECOLLECTION)).toBe(EvidenceType.SYSTEM_TRANSACTION);
    expect(isStrongerThan(EvidenceType.UPLOADED_OFFICIAL_RECORD, EvidenceType.STAFF_SELF_REPORT)).toBe(true);
  });

  it("owner recollection cannot override transaction data", () => {
    expect(canOverride(EvidenceType.OWNER_RECOLLECTION, EvidenceType.SYSTEM_TRANSACTION)).toBe(false);
    expect(resolveContradiction(EvidenceType.OWNER_RECOLLECTION, EvidenceType.SYSTEM_TRANSACTION)).toBe(EvidenceType.SYSTEM_TRANSACTION);
  });

  it("staff self-report cannot close a high-risk action alone", () => {
    expect(canCloseHighRiskAlone(EvidenceType.STAFF_SELF_REPORT)).toBe(false);
    expect(canCloseHighRiskAlone(EvidenceType.MANAGER_VERIFICATION)).toBe(true);
    expect(canCloseHighRiskAlone(EvidenceType.SYSTEM_TRANSACTION)).toBe(true);
  });

  it("assumption cannot be accepted as proof", () => {
    expect(isAcceptableAsProof(EvidenceType.ASSUMPTION)).toBe(false);
    expect(isAcceptableAsProof(EvidenceType.ESTIMATE)).toBe(false);
    expect(isAcceptableAsProof(EvidenceType.PHOTO_VIDEO)).toBe(true);
  });

  it("equal-strength contradiction is unresolved (null)", () => {
    expect(resolveContradiction(EvidenceType.PHOTO_VIDEO, EvidenceType.PHOTO_VIDEO)).toBeNull();
  });
});
