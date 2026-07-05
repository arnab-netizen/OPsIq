/**
 * Runtime Control Correlation — pure, deterministic linkage + latency between a governed source
 * event and the audit/handling record it must produce. No DB, no clock. Asserts real LINKED
 * latency from two persisted timestamps, honest MISSING_TARGET/FAILED with NO fabricated
 * timestamp, partial audit-durability coverage, tamper-signal persistence, and that the
 * genuinely-unpersisted proof→outcome link stays NOT_MEASURABLE.
 */
import { describe, it, expect } from "vitest";
import {
  buildControlCorrelationReport,
  computeReassessmentCorrelations,
  computeShockCorrelations,
  REASSESSMENT_TARGET_MS,
  SHOCK_HANDLING_TARGET_MS,
  type ReassessmentRow,
  type ShockRow,
  type ShockAuditRow,
  type ControlCorrelationInput,
} from "@/domain/owner-mode/control-correlation";

const WS = "ws-1";
const AT = "2026-07-05T00:00:00.000Z";
const NOW = Date.parse(AT);
const H = 3_600_000;
const D = 24 * H;

const reassess = (over: Partial<ReassessmentRow> = {}): ReassessmentRow => ({
  id: "re-1", trigger: "failed_outcome", status: "closed_with_correction",
  createdAt: new Date(NOW - 2 * D), updatedAt: new Date(NOW - 1 * D), ...over,
});
const shock = (over: Partial<ShockRow> = {}): ShockRow => ({
  id: "sh-1", type: "service_breakdown", severity: "high",
  createdAt: new Date(NOW - 10 * 60_000), happenedAt: new Date(NOW - 12 * 60_000), actorId: "actor-1", ...over,
});
const audit = (over: Partial<ShockAuditRow> = {}): ShockAuditRow => ({
  id: "au-1", eventName: "shock.event_recorded", entityId: "sh-1", occurredAt: new Date(NOW - 10 * 60_000), actorId: "actor-1", ...over,
});
const baseInput = (over: Partial<ControlCorrelationInput> = {}): ControlCorrelationInput => ({
  workspaceId: WS, reassessments: [], shocks: [], shockRecordedAudits: [], shockHandlingAudits: [],
  totalProof: 0, tamperSuspectedCount: 0, nowMs: NOW, evaluatedAt: AT, ...over,
});

describe("control-correlation — reassessment latency", () => {
  it("closed reassessment → LINKED with a real measured latency (updatedAt − createdAt)", () => {
    const { correlations, stat } = computeReassessmentCorrelations([reassess()], NOW, WS, AT);
    expect(correlations[0].status).toBe("LINKED");
    expect(correlations[0].latencyMs).toBe(1 * D);
    expect(correlations[0].sourceTimestamp).toBe(new Date(NOW - 2 * D).toISOString());
    expect(correlations[0].targetTimestamp).toBe(new Date(NOW - 1 * D).toISOString());
    expect(stat.measurable).toBe(true);
    expect(stat.medianLatencyMs).toBe(1 * D);
    expect(stat.failedCount).toBe(0);
  });

  it("open reassessment within target → MISSING_TARGET, NO fabricated target timestamp", () => {
    const { correlations, stat } = computeReassessmentCorrelations(
      [reassess({ status: "in_progress", createdAt: new Date(NOW - 1 * H) })], NOW, WS, AT
    );
    expect(correlations[0].status).toBe("MISSING_TARGET");
    expect(correlations[0].targetTimestamp).toBeNull();
    expect(correlations[0].latencyMs).toBeNull();
    expect(stat.openCount).toBe(1);
    expect(stat.failedCount).toBe(0);
  });

  it("open reassessment past target → FAILED (loop not closing)", () => {
    const { correlations, stat } = computeReassessmentCorrelations(
      [reassess({ status: "pending", createdAt: new Date(NOW - (REASSESSMENT_TARGET_MS + D)) })], NOW, WS, AT
    );
    expect(correlations[0].status).toBe("FAILED");
    expect(stat.failedCount).toBe(1);
    expect(correlations[0].missingData[0]).toMatch(/open past target/i);
  });

  it("no reassessments → stat is not measurable (no fake green)", () => {
    const { stat } = computeReassessmentCorrelations([], NOW, WS, AT);
    expect(stat.measurable).toBe(false);
    expect(stat.medianLatencyMs).toBeNull();
  });

  it("median is the middle of the closed latencies", () => {
    const rows = [
      reassess({ id: "a", createdAt: new Date(NOW - 5 * D), updatedAt: new Date(NOW - 4 * D) }), // 1d
      reassess({ id: "b", createdAt: new Date(NOW - 5 * D), updatedAt: new Date(NOW - 2 * D) }), // 3d
      reassess({ id: "c", createdAt: new Date(NOW - 5 * D), updatedAt: new Date(NOW - 0 * D) }), // 5d
    ];
    const { stat } = computeReassessmentCorrelations(rows, NOW, WS, AT);
    expect(stat.medianLatencyMs).toBe(3 * D);
    expect(stat.maxLatencyMs).toBe(5 * D);
  });
});

describe("control-correlation — shock handling + audit durability", () => {
  it("shock with a recorded + handling audit → two LINKED correlations, real handling latency", () => {
    const s = shock({ createdAt: new Date(NOW - 10 * 60_000) });
    const recorded = audit({ id: "rec", eventName: "shock.event_recorded", occurredAt: new Date(NOW - 10 * 60_000) });
    const handling = audit({ id: "cond", eventName: "condition.changed", occurredAt: new Date(NOW - 9 * 60_000) });
    const { correlations, latency, durability } = computeShockCorrelations([s], [recorded], [handling], NOW, WS, AT);
    const dur = correlations.find((c) => c.correlationType === "GOVERNED_MUTATION_AUDIT_CORRELATION")!;
    const handle = correlations.find((c) => c.correlationType === "SHOCK_TO_HANDLING_CORRELATION")!;
    expect(dur.status).toBe("LINKED");
    expect(handle.status).toBe("LINKED");
    expect(handle.latencyMs).toBe(60_000);
    expect(latency.medianLatencyMs).toBe(60_000);
    expect(durability.coveragePct).toBe(100);
  });

  it("shock recorded but NO handling audit, past grace → SHOCK handling FAILED", () => {
    const s = shock({ createdAt: new Date(NOW - 30 * 60_000) });
    const recorded = audit({ occurredAt: new Date(NOW - 30 * 60_000) });
    const { correlations, latency } = computeShockCorrelations([s], [recorded], [], NOW, WS, AT);
    const handle = correlations.find((c) => c.correlationType === "SHOCK_TO_HANDLING_CORRELATION")!;
    expect(handle.status).toBe("FAILED");
    expect(handle.targetTimestamp).toBeNull();
    expect(latency.failedCount).toBe(1);
  });

  it("shock with NO recorded audit → durability breach (coverage < 100%, FAILED link)", () => {
    const s = shock();
    const { correlations, durability } = computeShockCorrelations([s], [], [], NOW, WS, AT);
    const dur = correlations.find((c) => c.correlationType === "GOVERNED_MUTATION_AUDIT_CORRELATION")!;
    expect(dur.status).toBe("FAILED");
    expect(durability.coveragePct).toBe(0);
    expect(durability.unauditedMutationIds).toEqual(["sh-1"]);
  });

  it("uses the server createdAt as source, never the user-supplied happenedAt", () => {
    const s = shock({ createdAt: new Date(NOW - 5 * 60_000), happenedAt: new Date(NOW - 5 * D) });
    const handling = audit({ eventName: "condition.changed", occurredAt: new Date(NOW - 4 * 60_000) });
    const { correlations } = computeShockCorrelations([s], [audit()], [handling], NOW, WS, AT);
    const handle = correlations.find((c) => c.correlationType === "SHOCK_TO_HANDLING_CORRELATION")!;
    // latency = 1 minute (createdAt→handling), NOT ~5 days (happenedAt→handling).
    expect(handle.latencyMs).toBe(60_000);
    expect(handle.sourceTimestamp).toBe(new Date(NOW - 5 * 60_000).toISOString());
  });

  it("no shocks → latency + durability not measurable", () => {
    const { latency, durability } = computeShockCorrelations([], [], [], NOW, WS, AT);
    expect(latency.measurable).toBe(false);
    expect(durability.measurable).toBe(false);
    expect(durability.coveragePct).toBeNull();
  });
});

describe("control-correlation — full report", () => {
  it("emits a persisted, queryable tamper-signal correlation with real counts", () => {
    const r = buildControlCorrelationReport(baseInput({ totalProof: 8, tamperSuspectedCount: 2 }));
    const t = r.correlations.find((c) => c.correlationType === "PROOF_TAMPER_SIGNAL_PERSISTENCE")!;
    expect(t.status).toBe("LINKED");
    expect(t.evidence[0]).toMatch(/2\/8/);
    expect(r.tamper.tamperSuspectedCount).toBe(2);
  });

  it("keeps proof→outcome NOT_MEASURABLE with the exact missing model documented", () => {
    const r = buildControlCorrelationReport(baseInput());
    const p = r.correlations.find((c) => c.correlationType === "PROOF_TO_OUTCOME_CORRELATION")!;
    expect(p.status).toBe("NOT_MEASURABLE");
    expect(p.missingData.join(" ")).toMatch(/no persisted join/i);
    expect(p.sourceTimestamp).toBeNull();
  });

  it("every correlation echoes the workspaceId (no cross-workspace bleed in a pure fn)", () => {
    const r = buildControlCorrelationReport(baseInput({
      workspaceId: "ws-XYZ", reassessments: [reassess()], shocks: [shock()],
      shockRecordedAudits: [audit()], shockHandlingAudits: [audit({ eventName: "condition.changed" })],
      totalProof: 1, tamperSuspectedCount: 0,
    }));
    expect(r.correlations.every((c) => c.workspaceId === "ws-XYZ")).toBe(true);
    expect(r.correlations.some((c) => c.correlationType === "CROSS_WORKSPACE_ISOLATION_RUNTIME_SIGNAL")).toBe(true);
  });

  it("target windows are the disclosed constants", () => {
    const r = buildControlCorrelationReport(baseInput({ reassessments: [reassess()], shocks: [shock()], shockRecordedAudits: [audit()] }));
    expect(r.reassessmentLatency.targetMs).toBe(REASSESSMENT_TARGET_MS);
    expect(r.shockHandlingLatency.targetMs).toBe(SHOCK_HANDLING_TARGET_MS);
  });
});
