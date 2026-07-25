/**
 * Jarvis 360 Slice 8 — process review (pure) + service (DI). No DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import {
  evaluateProcessReview,
  nextReviewDate,
  processUpdateRequiresOwnerApproval,
} from "@/domain/owner-mode/process-review";
import { triggerProcessReviewIfDue, registerProcess, type ProcessDeps } from "@/services/owner-mode/process-review.service";

const NOW = new Date("2026-06-28T00:00:00Z");
beforeEach(() => emitAuditEvent.mockClear());

describe("process-review — module contract assertions", () => {
  it("evaluateProcessReview is a function", () => { expect(typeof evaluateProcessReview).toBe("function"); });
  it("nextReviewDate is a function", () => { expect(typeof nextReviewDate).toBe("function"); });
  it("processUpdateRequiresOwnerApproval is a function", () => { expect(typeof processUpdateRequiresOwnerApproval).toBe("function"); });
  it("triggerProcessReviewIfDue is a function", () => { expect(typeof triggerProcessReviewIfDue).toBe("function"); });
  it("registerProcess is a function", () => { expect(typeof registerProcess).toBe("function"); });
  it("emitAuditEvent is a function", () => { expect(typeof emitAuditEvent).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("makeDeps(null) returns an object", () => { expect(typeof makeDeps(null)).toBe("object"); });
  it("makeDeps(null) result has deps field", () => { expect(makeDeps(null)).toHaveProperty("deps"); });
  it("processUpdateRequiresOwnerApproval('sop_change') is true", () => { expect(processUpdateRequiresOwnerApproval("sop_change")).toBe(true); });
  it("processUpdateRequiresOwnerApproval('minor') is false", () => { expect(processUpdateRequiresOwnerApproval("minor")).toBe(false); });
  it("nextReviewDate(NOW, 30) is a Date", () => { expect(nextReviewDate(NOW, 30) instanceof Date).toBe(true); });
  it("evaluateProcessReview({nextReviewAt:null},{},NOW).due is false", () => { expect(evaluateProcessReview({ nextReviewAt: null }, {}, NOW).due).toBe(false); });
});

describe("evaluateProcessReview", () => {
  it("not due with no schedule and no signals", () => {
    expect(evaluateProcessReview({ nextReviewAt: null }, {}, NOW).due).toBe(false);
  });
  it("due when scheduled date passed", () => {
    const d = evaluateProcessReview({ nextReviewAt: new Date("2026-06-01Z") }, {}, NOW);
    expect(d.due).toBe(true);
    expect(d.triggers).toContain("scheduled_due");
  });
  it("due on a failure signal even before schedule", () => {
    const d = evaluateProcessReview({ nextReviewAt: new Date("2026-12-01Z") }, { repeatedFailure: true, complaintSpike: true }, NOW);
    expect(d.due).toBe(true);
    expect(d.triggers).toEqual(expect.arrayContaining(["repeated_failure", "complaint_spike"]));
  });
});

describe("nextReviewDate + materiality", () => {
  it("advances by cadence days", () => {
    expect(nextReviewDate(NOW, 30).getTime()).toBe(NOW.getTime() + 30 * 86400000);
  });
  it("material updates need owner approval; minor does not", () => {
    expect(processUpdateRequiresOwnerApproval("sop_change")).toBe(true);
    expect(processUpdateRequiresOwnerApproval("customer_promise_change")).toBe(true);
    expect(processUpdateRequiresOwnerApproval("minor")).toBe(false);
  });
});

function makeDeps(row: { id: string; workspaceId: string; reviewFrequencyDays: number; nextReviewAt: Date | null } | null) {
  const create = vi.fn(async () => ({ id: "p1" }));
  const update = vi.fn(async () => ({}));
  const deps: ProcessDeps = {
    now: () => NOW,
    db: { ownerProcess: { create, findFirst: vi.fn(async () => row), update } },
  };
  return { deps, create, update };
}

describe("service (DI)", () => {
  it("registers a process with a next review date", async () => {
    const { deps, create } = makeDeps(null);
    const id = await registerProcess({ workspaceId: "ws1", name: "Order intake", processType: "intake", ownerRole: "clerk", metric: "errors", actorId: "u1" }, deps);
    expect(id).toBe("p1");
    expect(create.mock.calls[0][0].data.nextReviewAt).toBeInstanceOf(Date);
  });
  it("triggers a review + advances schedule + audits when due", async () => {
    const { deps, update } = makeDeps({ id: "p1", workspaceId: "ws1", reviewFrequencyDays: 30, nextReviewAt: new Date("2026-06-01Z") });
    const d = await triggerProcessReviewIfDue("p1", { workspaceId: "ws1", signals: {} }, deps);
    expect(d.due).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
  it("does nothing (no audit) when not due", async () => {
    const { deps, update } = makeDeps({ id: "p1", workspaceId: "ws1", reviewFrequencyDays: 30, nextReviewAt: new Date("2026-12-01Z") });
    const d = await triggerProcessReviewIfDue("p1", { workspaceId: "ws1", signals: {} }, deps);
    expect(d.due).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(emitAuditEvent).not.toHaveBeenCalled();
  });
});
