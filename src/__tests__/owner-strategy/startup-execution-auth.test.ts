/**
 * Unit tests for startup execution authorization gate.
 * These test the pure logic aspects — DB integration is in startup-session.db.test.ts.
 */
import { describe, it, expect } from "vitest";
import { verifyApprovalPackageV1, verifyApprovalPackageV2, computeApprovalPackageHash } from "@/services/owner-strategy/startup-session.service";
import { deriveVerificationWindows } from "@/domain/owner-strategy/startup-verification-windows";

describe("Execution authorization — approval hash dispatch", () => {
  it("v1 does not include snapshot arrays in canonical form", () => {
    const base = { sessionId: "s1", ideaId: "i1" };
    const withArrays = { ...base, evidenceSnapshotIds: ["e1", "e2"], riskSnapshotIds: ["r1"] };
    // v1 is ID-only — arrays do not affect the hash
    expect(verifyApprovalPackageV1(base)).toBe(verifyApprovalPackageV1(withArrays));
  });

  it("v2 includes snapshot arrays and policy terms in canonical form", () => {
    const base = { sessionId: "s1", ideaId: "i1" };
    const withArrays = { ...base, evidenceSnapshotIds: ["e1"] };
    expect(verifyApprovalPackageV2(base)).not.toBe(verifyApprovalPackageV2(withArrays));
  });

  it("missing hashVersion defaults to v2", () => {
    const base = { sessionId: "s2", ideaId: "i2" };
    expect(computeApprovalPackageHash(base)).toBe(verifyApprovalPackageV2(base));
  });

  it("hashVersion=1 dispatches to v1 algorithm", () => {
    const c = { sessionId: "s3", ideaId: "i3", hashVersion: 1 as const };
    expect(computeApprovalPackageHash(c)).toBe(verifyApprovalPackageV1(c));
    expect(computeApprovalPackageHash(c)).not.toBe(verifyApprovalPackageV2(c));
  });

  it("changing policyVersion changes both v1 and v2 hashes", () => {
    const c1 = { sessionId: "s4", ideaId: "i4", policyVersion: "1" };
    const c2 = { sessionId: "s4", ideaId: "i4", policyVersion: "2" };
    expect(verifyApprovalPackageV1(c1)).not.toBe(verifyApprovalPackageV1(c2));
    expect(verifyApprovalPackageV2(c1)).not.toBe(verifyApprovalPackageV2(c2));
  });

  it("v2 hash is deterministic regardless of snapshot array order", () => {
    const c1 = { sessionId: "s5", evidenceSnapshotIds: ["a", "b", "c"] };
    const c2 = { sessionId: "s5", evidenceSnapshotIds: ["c", "a", "b"] };
    const c3 = { sessionId: "s5", evidenceSnapshotIds: ["b", "c", "a"] };
    const hash = verifyApprovalPackageV2(c1);
    expect(verifyApprovalPackageV2(c2)).toBe(hash);
    expect(verifyApprovalPackageV2(c3)).toBe(hash);
  });
});

describe("Execution authorization — verification window derivation", () => {
  it("no inputs produces a fallback minimum window of 14 days", () => {
    const windows = deriveVerificationWindows({ ideaName: "X", hypotheses: [], economics: null, kpis: [], validationPlan: null, taskCount: 1 });
    expect(windows[0].durationDays).toBeGreaterThanOrEqual(14);
  });

  it("30-day placeholder is never returned when a longer hypothesis exists", () => {
    const windows = deriveVerificationWindows({ ideaName: "X", hypotheses: [{ expectedDurationDays: 45, hypothesisType: "DEMAND", requiresOwnerApproval: false }], economics: null, kpis: [], validationPlan: null, taskCount: 2 });
    expect(windows[0].durationDays).toBe(45);
    expect(windows[0].durationDays).not.toBe(30);
  });

  it("3 windows created when hypotheses, break-even, and short runway all provided", () => {
    const windows = deriveVerificationWindows({
      ideaName: "Z",
      hypotheses: [{ expectedDurationDays: 21, hypothesisType: "PRICING", requiresOwnerApproval: false }],
      economics: { breakEvenMonths: 4, cashRunwayMonths: 6, spendingLimitCents: null, fixedMonthlyCostCents: null },
      kpis: [],
      validationPlan: null,
      taskCount: 3,
    });
    expect(windows.length).toBe(3);
    const labels = windows.map((w) => w.windowLabel);
    expect(labels.some((l) => l.includes("Validation"))).toBe(true);
    expect(labels.some((l) => l.includes("Break-Even"))).toBe(true);
    expect(labels.some((l) => l.includes("Cash Survival"))).toBe(true);
  });
});
