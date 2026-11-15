/**
 * Beta integrity BIV-09/BIV-10: outcome evidence policy shared by all owner-domain
 * verifications — no outcome before work starts; measured vs owner-reported baseline
 * provenance is always recorded and a conflicting owner value is never silently
 * presented as measured.
 */
import { describe, it, expect } from "vitest";
import {
  canRecordOutcome,
  measuredBaselineFor,
  resolveVerificationBaseline,
  withMeasuredBaseline,
} from "@/domain/founder-recovery/verification-evidence";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

describe("canRecordOutcome", () => {
  it("allows only statuses in which work has started", () => {
    const allowed = RECOVERY_ACTION_STATUSES.filter(canRecordOutcome);
    expect(allowed).toEqual(["in_progress", "blocked", "completed"]);
    expect(canRecordOutcome("proposed")).toBe(false);
    expect(canRecordOutcome("assigned")).toBe(false);
    expect(canRecordOutcome("cancelled")).toBe(false);
    expect(canRecordOutcome("verified")).toBe(false);
  });
});

describe("measuredBaselineFor", () => {
  it("returns the finding's measured value only for the same metric", () => {
    expect(measuredBaselineFor("discountDependencePct", { sourceMetric: "discountDependencePct", sourceValue: 5.2 })).toBe(5.2);
    expect(measuredBaselineFor("discountDependencePct", { sourceMetric: "repeatRatePct", sourceValue: 5.2 })).toBeNull();
    expect(measuredBaselineFor("x", { sourceMetric: "x", sourceValue: null })).toBeNull();
    expect(measuredBaselineFor("x", { sourceMetric: "x", sourceValue: Number.NaN })).toBeNull();
    expect(measuredBaselineFor("x", null)).toBeNull();
  });

  it("withMeasuredBaseline attaches the derived value without dropping fields", () => {
    const a = withMeasuredBaseline({ id: "a1", verificationMetric: "m", finding: { sourceMetric: "m", sourceValue: 0 } });
    expect(a).toMatchObject({ id: "a1", measuredBaseline: 0 });
  });
});

describe("resolveVerificationBaseline", () => {
  it("blank before + measured value → uses the measured baseline (MEASURED)", () => {
    expect(resolveVerificationBaseline(null, 5.2)).toMatchObject({ ok: true, beforeValue: 5.2, baselineSource: "MEASURED", measuredBeforeValue: 5.2 });
  });

  it("blank before + nothing measured → rejected with an actionable reason", () => {
    const r = resolveVerificationBaseline(undefined, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/before \(baseline\) value/);
  });

  it("owner value equal to measured → MEASURED", () => {
    expect(resolveVerificationBaseline(5.2, 5.2)).toMatchObject({ ok: true, baselineSource: "MEASURED" });
  });

  it("the beta-review case: owner types 50 for a metric measured at 5.2 → kept, flagged OWNER_REPORTED with the measured value", () => {
    const r = resolveVerificationBaseline(50, 5.2);
    expect(r).toMatchObject({ ok: true, beforeValue: 50, baselineSource: "OWNER_REPORTED", measuredBeforeValue: 5.2 });
    if (r.ok) expect(r.provenanceNote).toContain("differs from the measured baseline 5.2");
  });

  it("owner value with nothing measured → OWNER_REPORTED, measured null", () => {
    expect(resolveVerificationBaseline(0, null)).toMatchObject({ ok: true, beforeValue: 0, baselineSource: "OWNER_REPORTED", measuredBeforeValue: null });
  });

  it("measured zero is a real measurement, not missing data", () => {
    expect(resolveVerificationBaseline(null, 0)).toMatchObject({ ok: true, beforeValue: 0, baselineSource: "MEASURED" });
  });
});
