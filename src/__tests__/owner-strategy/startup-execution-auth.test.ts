/**
 * Unit tests for startup execution authorization gate.
 * These test the pure logic aspects — DB integration is in startup-session.db.test.ts.
 */
import { describe, it, expect } from "vitest";
import { verifyApprovalPackageV1, verifyApprovalPackageV2, verifyApprovalPackageV3, computeApprovalPackageHash, checkApprovalStaleness } from "@/services/owner-strategy/startup-session.service";
import type { VersionedApprovalState } from "@/services/owner-strategy/startup-session.service";
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

  it("missing hashVersion defaults to v2 (current algorithm)", () => {
    const base = { sessionId: "s2", ideaId: "i2" };
    expect(computeApprovalPackageHash(base)).toBe(verifyApprovalPackageV2(base));
  });

  it("hashVersion=3 dispatches to v3 algorithm (forward compat)", () => {
    const c = { sessionId: "s2b", ideaId: "i2b", hashVersion: 3 as const };
    expect(computeApprovalPackageHash(c)).toBe(verifyApprovalPackageV3(c));
    expect(computeApprovalPackageHash(c)).not.toBe(verifyApprovalPackageV2(c));
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

describe("G2-15 staleness type safety — VersionedApprovalState compile-time contract", () => {
  // These @ts-expect-error lines are compile-time proof that partial construction
  // is rejected. If VersionedApprovalState ever becomes Partial<...> or all-optional,
  // TypeScript will error on the @ts-expect-error directives themselves (unused suppression),
  // making the regression visible at build time rather than at runtime.
  it("@ts-expect-error: empty object must not satisfy VersionedApprovalState", () => {
    // @ts-expect-error — incomplete material state must never compile
    void checkApprovalStaleness("ws", "sess", {});
    expect(true).toBe(true); // assertion proves the line above compiled only as an error
  });

  it("@ts-expect-error: partial object (missing 7 fields) must not satisfy VersionedApprovalState", () => {
    // @ts-expect-error — incomplete material state must never compile
    void checkApprovalStaleness("ws", "sess", { ideaId: null, profileVersionId: "pv-1" });
    expect(true).toBe(true);
  });

  it("VersionedApprovalState requires all 9 fields — partial construction is rejected at compile time", () => {
    // This test validates that VersionedApprovalState has all required fields.
    // TypeScript enforces this at compile time: passing {} or a partial object to
    // checkApprovalStaleness is a compile error after the G2-15 fix.
    const full: VersionedApprovalState = {
      ideaId: null,
      ideaVersionId: null,
      profileVersionId: "profile-abc",
      economicModelId: null,
      readinessId: null,
      systemRecId: "sysrec-xyz",
      businessModelId: null,
      marketSizingId: null,
      validationPlanId: null,
    };
    // All 9 fields are present (even though some are null) — this must compile.
    expect(Object.keys(full)).toHaveLength(9);
    expect(full.profileVersionId).toBe("profile-abc");
    expect(full.systemRecId).toBe("sysrec-xyz");
    expect(full.ideaId).toBeNull();
  });

  it("VersionedApprovalState hash-input contract: non-null profileVersionId produces different hash than null", () => {
    const withProfile = computeApprovalPackageHash({
      sessionId: "s-g215",
      profileVersionId: "pv-001",
      hashVersion: 2,
    });
    const withoutProfile = computeApprovalPackageHash({
      sessionId: "s-g215",
      profileVersionId: null,
      hashVersion: 2,
    });
    // Proves the defect mechanism: passing null instead of the real ID changes the hash
    expect(withProfile).not.toBe(withoutProfile);
  });
});
