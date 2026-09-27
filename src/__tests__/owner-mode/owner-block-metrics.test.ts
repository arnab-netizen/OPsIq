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
      },
    },
    now: () => new Date("2026-06-28T00:00:00.000Z"),
  };
}

describe("getOwnerBlockMetrics — module contract assertions", () => {
  it("getOwnerBlockMetrics is a function", () => {
    expect(typeof getOwnerBlockMetrics).toBe("function");
  });
  it("AUDIT_EVENTS is an object", () => {
    expect(typeof AUDIT_EVENTS).toBe("object");
  });
  it("AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED is defined", () => {
    expect(AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED).toBeDefined();
  });
  it("AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_BLOCKED is defined", () => {
    expect(AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_BLOCKED).toBeDefined();
  });
  it("AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED is defined", () => {
    expect(AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED).toBeDefined();
  });
  it("AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED is defined", () => {
    expect(AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED).toBeDefined();
  });
  it("depsWith() returns object with db field", () => {
    expect(depsWith([])).toHaveProperty("db");
  });
  it("depsWith().db.auditEvent.findMany is a function", () => {
    expect(typeof depsWith([]).db.auditEvent.findMany).toBe("function");
  });
  it("getOwnerBlockMetrics returns a Promise", () => {
    const r = getOwnerBlockMetrics("ws1", depsWith([]));
    expect(r instanceof Promise).toBe(true);
    return r;
  });
  it("getOwnerBlockMetrics resolves to object", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(typeof m).toBe("object");
  });
  it("result has blockedRecommendations field", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(m).toHaveProperty("blockedRecommendations");
  });
  it("result has financeBlocked field", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(m).toHaveProperty("financeBlocked");
  });
  it("result has proofBlocked field", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(m).toHaveProperty("proofBlocked");
  });
  it("result has approvalsAvoided field", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(m).toHaveProperty("approvalsAvoided");
  });
  it("zero events → all counts are 0", async () => {
    const m = await getOwnerBlockMetrics("ws1", depsWith([]));
    expect(m.blockedRecommendations).toBe(0);
    expect(m.financeBlocked).toBe(0);
    expect(m.proofBlocked).toBe(0);
    expect(m.approvalsAvoided).toBe(0);
  });
});

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
    expect(m).toEqual({ blockedRecommendations: 0, financeBlocked: 0, proofBlocked: 0, approvalsAvoided: 0 });
  });

  it("counts auto-handled approvals as approvalsAvoided (EH-16); owner-action gate codes count as finance", async () => {
    const events = [
      { eventName: AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED, payload: { reason: "approval_memory" } },
      { eventName: AUDIT_EVENTS.OWNER_APPROVAL_AUTO_HANDLED, payload: { reason: "standing_instruction_allow" } },
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { code: "CASH_SAFETY_BLOCKED", errorName: "OwnerActionGateError" } },
    ];
    const m = await getOwnerBlockMetrics("ws1", depsWith(events));
    expect(m.approvalsAvoided).toBe(2);
    expect(m.blockedRecommendations).toBe(1);
    expect(m.financeBlocked).toBe(1); // matched by owner-action gate code
  });

  it("D-P2-3 — with a business scope, finance blocks are that business's only (another business's never constrain its advice)", async () => {
    const events = [
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { code: "CASH_SAFETY_BLOCKED", businessId: "A" } },
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { code: "MARGIN_SAFETY_BLOCKED", businessId: "B" } },
      // a consulting recommendation's promotion block: no business on the event
      { eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, payload: { errorName: "CashSafetyGateError" } },
    ];
    const forB = await getOwnerBlockMetrics("ws1", depsWith(events), { businessId: "B", unscopedAttributable: false });
    expect(forB.financeBlocked).toBe(1);
    expect(forB.blockedRecommendations).toBe(3); // the workspace-wide count is unchanged
    // The business-less event counts only when attributable to the business (the workspace's only one).
    const onlyA = await getOwnerBlockMetrics("ws1", depsWith(events), { businessId: "A", unscopedAttributable: true });
    expect(onlyA.financeBlocked).toBe(2);
    // Without a scope: the workspace-wide aggregate (unchanged contract).
    expect((await getOwnerBlockMetrics("ws1", depsWith(events))).financeBlocked).toBe(3);
  });
});
