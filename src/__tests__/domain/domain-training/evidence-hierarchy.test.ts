import { describe, it, expect } from "vitest";
import {
  EvidenceType,
  isStrongerThan,
  resolveContradiction,
  canOverride,
  canCloseHighRiskAlone,
  isAcceptableAsProof,
} from "@/domain/domain-training/evidence-hierarchy";

describe("[F3] evidence hierarchy — module contract assertions", () => {
  it("EvidenceType is an object (enum)", () => {
    expect(typeof EvidenceType).toBe("object");
  });
  it("EvidenceType.SYSTEM_TRANSACTION is defined", () => {
    expect(EvidenceType.SYSTEM_TRANSACTION).toBeDefined();
  });
  it("EvidenceType.OWNER_RECOLLECTION is defined", () => {
    expect(EvidenceType.OWNER_RECOLLECTION).toBeDefined();
  });
  it("EvidenceType.STAFF_SELF_REPORT is defined", () => {
    expect(EvidenceType.STAFF_SELF_REPORT).toBeDefined();
  });
  it("EvidenceType.ASSUMPTION is defined", () => {
    expect(EvidenceType.ASSUMPTION).toBeDefined();
  });
  it("EvidenceType.PHOTO_VIDEO is defined", () => {
    expect(EvidenceType.PHOTO_VIDEO).toBeDefined();
  });
  it("isStrongerThan is a function", () => {
    expect(typeof isStrongerThan).toBe("function");
  });
  it("resolveContradiction is a function", () => {
    expect(typeof resolveContradiction).toBe("function");
  });
  it("canOverride is a function", () => {
    expect(typeof canOverride).toBe("function");
  });
  it("canCloseHighRiskAlone is a function", () => {
    expect(typeof canCloseHighRiskAlone).toBe("function");
  });
  it("isAcceptableAsProof is a function", () => {
    expect(typeof isAcceptableAsProof).toBe("function");
  });
  it("isStrongerThan(SYSTEM_TRANSACTION, OWNER_RECOLLECTION) returns true", () => {
    expect(isStrongerThan(EvidenceType.SYSTEM_TRANSACTION, EvidenceType.OWNER_RECOLLECTION)).toBe(true);
  });
  it("isStrongerThan(OWNER_RECOLLECTION, SYSTEM_TRANSACTION) returns false", () => {
    expect(isStrongerThan(EvidenceType.OWNER_RECOLLECTION, EvidenceType.SYSTEM_TRANSACTION)).toBe(false);
  });
  it("isStrongerThan returns a boolean", () => {
    expect(typeof isStrongerThan(EvidenceType.PHOTO_VIDEO, EvidenceType.ESTIMATE)).toBe("boolean");
  });
  it("resolveContradiction returns SYSTEM_TRANSACTION when it wins", () => {
    expect(resolveContradiction(EvidenceType.SYSTEM_TRANSACTION, EvidenceType.OWNER_RECOLLECTION)).toBe(EvidenceType.SYSTEM_TRANSACTION);
  });
});

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
