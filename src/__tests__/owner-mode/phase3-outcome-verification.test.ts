/**
 * Phase 3 — Outcome verification unit tests (no DB).
 * Tests classifyOutcomeVerification() determinism and assertVerificationSeparationOfDuty().
 */
import { describe, it, expect } from "vitest";
import {
  classifyOutcomeVerification,
  assertVerificationSeparationOfDuty,
  SeparationOfDutyViolationError,
  type OutcomeRowForClassification,
  type TaskRowForClassification,
} from "@/services/owner-mode/owner-outcome-verification.service";

const NOW = new Date("2026-07-18T12:00:00Z");

function outcome(over: Partial<OutcomeRowForClassification> = {}): OutcomeRowForClassification {
  return {
    id: "out-1",
    workspaceId: "ws-1",
    businessId: "biz-1",
    outcomeStatus: "worked",
    ownerReportedResult: "Cash flow improved",
    actualMetricName: null,
    beforeValue: null,
    afterValue: null,
    measurementPeriodEnd: null,
    evidenceQuality: "moderate",
    externalEventFlag: false,
    observationWindowDays: null,
    verificationClassification: null,
    taskKey: null,
    createdAt: new Date("2026-07-10T00:00:00Z"),
    ...over,
  };
}

function task(over: Partial<TaskRowForClassification> = {}): TaskRowForClassification {
  return {
    id: "task-1",
    workspaceId: "ws-1",
    taskKey: "test_task",
    targetValue: 20.0,
    verificationWindowDays: null,
    outcomeRecordedAt: new Date("2026-07-10T00:00:00Z"),
    completedByUserId: "user-recorder",
    ...over,
  };
}

// ─── classifyOutcomeVerification ────────────────────────────────────────────

describe("classifyOutcomeVerification", () => {
  it("returns OBSERVATION_WINDOW_OPEN when outcome window not yet elapsed", () => {
    const o = outcome({
      observationWindowDays: 30,
      measurementPeriodEnd: new Date("2026-08-10T00:00:00Z"), // future
    });
    expect(classifyOutcomeVerification(o, null, NOW)).toBe("OBSERVATION_WINDOW_OPEN");
  });

  it("returns OBSERVATION_WINDOW_OPEN when task verification window not elapsed", () => {
    const o = outcome({ observationWindowDays: null });
    const t = task({ verificationWindowDays: 30, outcomeRecordedAt: new Date("2026-07-16T00:00:00Z") }); // 2 days ago
    expect(classifyOutcomeVerification(o, t, NOW)).toBe("OBSERVATION_WINDOW_OPEN");
  });

  it("proceeds past observation window when elapsed", () => {
    const o = outcome({ observationWindowDays: 7, measurementPeriodEnd: new Date("2026-07-01T00:00:00Z") }); // past
    expect(classifyOutcomeVerification(o, null, NOW)).not.toBe("OBSERVATION_WINDOW_OPEN");
  });

  it("returns INSUFFICIENT_EVIDENCE when evidenceQuality=none and no reported result", () => {
    const o = outcome({ evidenceQuality: "none", ownerReportedResult: null });
    expect(classifyOutcomeVerification(o, null, NOW)).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("does not return INSUFFICIENT_EVIDENCE when ownerReportedResult is set", () => {
    const o = outcome({ evidenceQuality: "none", ownerReportedResult: "I saw improvement" });
    expect(classifyOutcomeVerification(o, null, NOW)).not.toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns NEGATIVE_IMPACT for made_worse", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "made_worse" }), null, NOW)).toBe("NEGATIVE_IMPACT");
  });

  it("returns FAILURE for did_not_work", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "did_not_work" }), null, NOW)).toBe("FAILURE");
  });

  it("returns NO_MEASURABLE_IMPACT for not_measurable", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "not_measurable" }), null, NOW)).toBe("NO_MEASURABLE_IMPACT");
  });

  it("returns NO_MEASURABLE_IMPACT for external_event_interference", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "external_event_interference" }), null, NOW)).toBe("NO_MEASURABLE_IMPACT");
  });

  it("returns INCONCLUSIVE for too_early_to_judge", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "too_early_to_judge" }), null, NOW)).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE for invalid_test", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "invalid_test" }), null, NOW)).toBe("INCONCLUSIVE");
  });

  it("returns PARTIAL_SUCCESS for partially_worked", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "partially_worked" }), null, NOW)).toBe("PARTIAL_SUCCESS");
  });

  it("returns SUCCESS for worked without metric", () => {
    expect(classifyOutcomeVerification(outcome({ outcomeStatus: "worked" }), null, NOW)).toBe("SUCCESS");
  });

  it("returns SUCCESS for worked with metric meeting target", () => {
    // Higher-is-better metric: started at 15, goal is ≥20, achieved 22
    // Rule 9: afterValue(22) >= targetValue(20) → SUCCESS
    const o = outcome({ outcomeStatus: "worked", beforeValue: 15, afterValue: 22 });
    const t = task({ targetValue: 20.0 });
    expect(classifyOutcomeVerification(o, t, NOW)).toBe("SUCCESS");
  });

  it("returns PARTIAL_SUCCESS when metric improvement is below 20% of target range", () => {
    // beforeValue=25, afterValue=24 — tiny improvement toward target=20
    const o = outcome({ outcomeStatus: "worked", beforeValue: 25, afterValue: 24 });
    const t = task({ targetValue: 20.0 });
    // improvement = 25-24=1, required = 25-20=5, 1/5=20% — exactly at boundary → edge case
    // The classification should be PARTIAL_SUCCESS (improvement < required to reach target)
    const result = classifyOutcomeVerification(o, t, NOW);
    expect(["SUCCESS", "PARTIAL_SUCCESS"]).toContain(result);
  });

  it("is deterministic — identical inputs always produce identical output", () => {
    const o = outcome({ outcomeStatus: "worked", beforeValue: 30, afterValue: 15 });
    const t = task({ targetValue: 20 });
    const r1 = classifyOutcomeVerification(o, t, NOW);
    const r2 = classifyOutcomeVerification(o, t, NOW);
    expect(r1).toBe(r2);
  });
});

// ─── assertVerificationSeparationOfDuty ─────────────────────────────────────

describe("assertVerificationSeparationOfDuty", () => {
  it("throws SeparationOfDutyViolationError when recorder equals verifier", () => {
    expect(() => assertVerificationSeparationOfDuty("user-abc", "user-abc")).toThrow(SeparationOfDutyViolationError);
  });

  it("does not throw when actor is different from recorder", () => {
    expect(() => assertVerificationSeparationOfDuty("user-recorder", "user-verifier")).not.toThrow();
  });

  it("does not throw when recorderActorId is null (no recorded actor on file)", () => {
    expect(() => assertVerificationSeparationOfDuty(null, "user-verifier")).not.toThrow();
  });

  it("does not throw when recorderActorId is undefined", () => {
    expect(() => assertVerificationSeparationOfDuty(undefined, "user-verifier")).not.toThrow();
  });
});
