/**
 * Jarvis 360 gap-closure (G16) — self-evaluation closes the loop into business memory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { recordSelfEvaluation } from "@/services/owner-mode/self-evaluation.service";

beforeEach(() => emitAuditEvent.mockClear());

function deps() {
  const recordCaution = vi.fn(async () => "rule1");
  return {
    recordCaution,
    deps: {
      db: { ownerSelfEvaluation: { create: vi.fn(async () => ({ id: "se1" })) } },
      now: () => new Date("2026-06-28T00:00:00.000Z"),
      recordCaution,
    },
  };
}

describe("recordSelfEvaluation loop closure", () => {
  it("records a BLOCKING do-not-repeat when failure is attributed to the recommendation", async () => {
    const { deps: d, recordCaution } = deps();
    const r = await recordSelfEvaluation(
      {
        workspaceId: "ws1",
        businessId: "biz1",
        recommendationId: "rec1",
        memoryKey: "SALES_DISCOUNT",
        expectedOutcome: "margin up 5%",
        signals: { executed: true, metExpectation: false }, // → bad_recommendation
      },
      d
    );
    expect(r.result).toBe("failed");
    expect(r.cautionRecorded).toBe(true);
    expect(r.cautionBlocks).toBe(true);
    expect(recordCaution).toHaveBeenCalledWith(expect.objectContaining({ memoryKey: "SALES_DISCOUNT", blocksRepetition: true }));
  });

  it("records a NON-blocking caution when failure is attributed elsewhere (poor execution)", async () => {
    const { deps: d, recordCaution } = deps();
    const r = await recordSelfEvaluation(
      {
        workspaceId: "ws1",
        businessId: "biz1",
        memoryKey: "scope:operations",
        expectedOutcome: "throughput up",
        signals: { executed: true, metExpectation: false, poorExecution: true },
      },
      d
    );
    expect(r.cautionRecorded).toBe(true);
    expect(r.cautionBlocks).toBe(false);
    expect(recordCaution).toHaveBeenCalledWith(expect.objectContaining({ blocksRepetition: false }));
  });

  it("does not record a caution when the outcome worked", async () => {
    const { deps: d, recordCaution } = deps();
    const r = await recordSelfEvaluation(
      {
        workspaceId: "ws1",
        businessId: "biz1",
        memoryKey: "SALES_DISCOUNT",
        expectedOutcome: "margin up",
        signals: { executed: true, metExpectation: true },
      },
      d
    );
    expect(r.result).toBe("worked");
    expect(r.cautionRecorded).toBe(false);
    expect(recordCaution).not.toHaveBeenCalled();
  });

  it("does not record a caution when no memoryKey/businessId is supplied", async () => {
    const { deps: d, recordCaution } = deps();
    const r = await recordSelfEvaluation(
      { workspaceId: "ws1", expectedOutcome: "x", signals: { executed: true, metExpectation: false } },
      d
    );
    expect(r.result).toBe("failed");
    expect(r.cautionRecorded).toBe(false);
    expect(recordCaution).not.toHaveBeenCalled();
  });
});
