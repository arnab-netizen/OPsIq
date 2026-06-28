/**
 * Jarvis 360 Slice 13 — self-evaluation classifier (pure) + service (DI). No DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { classifyOutcome } from "@/domain/owner-mode/self-evaluation";
import { recordSelfEvaluation, type SelfEvalDeps } from "@/services/owner-mode/self-evaluation.service";

const NOW = new Date("2026-06-28T00:00:00Z");
beforeEach(() => emitAuditEvent.mockClear());

describe("classifyOutcome", () => {
  it("unknown when not executed (invalid test)", () => {
    expect(classifyOutcome({ executed: false, metExpectation: false }).result).toBe("unknown");
  });
  it("worked when expectation met", () => {
    const v = classifyOutcome({ executed: true, metExpectation: true });
    expect(v.result).toBe("worked");
    expect(v.reassessmentRequired).toBe(false);
  });
  it("attributes failure by precedence: proof > external > data > override > execution", () => {
    expect(classifyOutcome({ executed: true, metExpectation: false, insufficientProof: true, weakData: true }).failureReason).toBe("insufficient_proof");
    expect(classifyOutcome({ executed: true, metExpectation: false, externalEvent: true, weakData: true }).failureReason).toBe("external_factor");
    expect(classifyOutcome({ executed: true, metExpectation: false, weakData: true }).failureReason).toBe("weak_data");
    expect(classifyOutcome({ executed: true, metExpectation: false, ownerOverrode: true }).failureReason).toBe("owner_override");
    expect(classifyOutcome({ executed: true, metExpectation: false, poorExecution: true }).failureReason).toBe("poor_execution");
    expect(classifyOutcome({ executed: true, metExpectation: false }).failureReason).toBe("bad_recommendation");
  });
  it("failed outcomes require reassessment", () => {
    expect(classifyOutcome({ executed: true, metExpectation: false }).reassessmentRequired).toBe(true);
  });
});

describe("recordSelfEvaluation (DI)", () => {
  function makeDeps() {
    const create = vi.fn(async () => ({ id: "se1" }));
    const deps: SelfEvalDeps = { now: () => NOW, db: { ownerSelfEvaluation: { create } } };
    return { deps, create };
  }
  it("persists a worked outcome with no reassessment", async () => {
    const { deps, create } = makeDeps();
    const r = await recordSelfEvaluation({ workspaceId: "ws1", expectedOutcome: "+10% repeat", signals: { executed: true, metExpectation: true } }, deps);
    expect(r.result).toBe("worked");
    expect(create.mock.calls[0][0].data.reassessmentRequired).toBe(false);
    expect(create.mock.calls[0][0].data.nextReassessmentAt).toBeNull();
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
  it("schedules reassessment on a failed outcome", async () => {
    const { deps, create } = makeDeps();
    const r = await recordSelfEvaluation({ workspaceId: "ws1", expectedOutcome: "+10%", signals: { executed: true, metExpectation: false, weakData: true } }, deps);
    expect(r.result).toBe("failed");
    expect(r.failureReason).toBe("weak_data");
    expect(create.mock.calls[0][0].data.reassessmentRequired).toBe(true);
    expect(create.mock.calls[0][0].data.nextReassessmentAt).toBeInstanceOf(Date);
  });
});
