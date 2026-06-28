/**
 * Jarvis 360 gap-closure (G03) — owner block metrics derived from the audit log (DI).
 */
import { describe, it, expect, vi } from "vitest";
import { getOwnerBlockMetrics } from "@/services/owner-mode/owner-block-metrics.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

function depsWith(events: Array<{ eventName: string; payload: unknown }>, captured?: { where?: unknown }) {
  return {
    db: {
      auditEvent: {
        findMany: vi.fn(async (args: { where: unknown }) => {
          if (captured) captured.where = args.where;
          return events;
        }),
        findFirst: vi.fn(async () => null),
      },
    },
    now: () => new Date("2026-06-28T00:00:00.000Z"),
  };
}

describe("getOwnerBlockMetrics", () => {
  it("counts gate + do-not-repeat blocks as blocked recommendations, cash/margin as finance", async () => {
    const events = [
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { errorName: "CashSafetyGateError" } },
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { errorName: "MarginSafetyGateError" } },
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { errorName: "CapacitySafetyGateError" } },
      { eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_BLOCKED, payload: { memoryKey: "k" } },
    ];
    const m = await getOwnerBlockMetrics("ws1", depsWith(events));
    expect(m.blockedRecommendations).toBe(4);
    expect(m.financeBlocked).toBe(2);
    expect(m.proofBlocked).toBe(0);
  });

  it("counts task-completion blocks as proofBlocked, not as blocked recommendations", async () => {
    const events = [
      { eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED, payload: { reason: "proof_not_cleared" } },
      { eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED, payload: { reason: "duplicate_proof" } },
    ];
    const m = await getOwnerBlockMetrics("ws1", depsWith(events));
    expect(m.proofBlocked).toBe(2);
    expect(m.blockedRecommendations).toBe(0);
  });

  it("scopes the query to the workspace and a recent window", async () => {
    const captured: { where?: { workspaceId: string; occurredAt: { gte: Date } } } = {};
    await getOwnerBlockMetrics("ws-iso", { ...depsWith([], captured), windowDays: 7 });
    expect(captured.where?.workspaceId).toBe("ws-iso");
    expect(captured.where?.occurredAt.gte).toEqual(new Date("2026-06-21T00:00:00.000Z"));
  });

  it("returns zeros when there are no block events", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(m).toEqual({ blockedRecommendations: 0, financeBlocked: 0, proofBlocked: 0, approvalsAvoided: 0, arbitrationWhatNotToDo: [] });
  });

  it("counts auto-handled approvals as approvalsAvoided (EH-16) and surfaces arbitration what-not-to-do (EH-05)", async () => {
    const events = [
      { eventName: AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED, payload: { reason: "approval_memory" } },
      { eventName: AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED, payload: { reason: "standing_instruction_allow" } },
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { code: "CASH_SAFETY_BLOCKED", errorName: "OwnerActionGateError" } },
    ];
    const d = depsWith(events);
    d.db.auditEvent.findFirst = vi.fn(async () => ({ payload: { whatNotToDo: ['Do not pursue "Expensive bet" now'] } }));
    const m = await getOwnerBlockMetrics("ws1", d);
    expect(m.approvalsAvoided).toBe(2);
    expect(m.blockedRecommendations).toBe(1);
    expect(m.financeBlocked).toBe(1); // matched by owner-action gate code
    expect(m.arbitrationWhatNotToDo).toEqual(['Do not pursue "Expensive bet" now']);
  });
});
