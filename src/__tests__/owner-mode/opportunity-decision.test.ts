/**
 * Jarvis 360 owner-flow closure (EH-17/EH-19) — live opportunity decision (DI).
 * Proves the guardrail screen runs on the owner's REAL capacity + margin and
 * rejects/defers/accepts accordingly (not hand-entered, not advisory-only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { decideOpportunity } from "@/services/owner-mode/opportunity-decision.service";

beforeEach(() => emitAuditEvent.mockClear());

function deps(opts: {
  equipment?: Array<{ name: string; utilization: number | null; downtimeState: string; maintenanceDueAt: Date | null; status: string }>;
  snapshot?: { revenue: number | null; costOfGoods: number | null } | null;
}) {
  return {
    db: {
      ownerEquipment: { findMany: vi.fn(async () => opts.equipment ?? []) },
      ownerFinancialSnapshot: { findFirst: vi.fn(async () => opts.snapshot ?? null) },
    },
    now: () => new Date("2026-06-28T00:00:00.000Z"),
  };
}

const base = { workspaceId: "ws1", businessId: "biz1", paymentRisk: "low" as const };

describe("decideOpportunity", () => {
  it("REJECTS when the owner's real margin is below the floor", async () => {
    // revenue 100 / COGS 95 → 5% gross margin < 15% floor
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
    const r = await decideOpportunity({ ...base, fitScore: 0.9 }, d);
    expect(r.verdict).toBe("reject");
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.opportunity_decided" }));
  });

  it("DEFERS when the owner's real capacity is saturated/down", async () => {
    const d = deps({
      snapshot: { revenue: 100, costOfGoods: 50 }, // healthy margin
      equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }],
    });
    const r = await decideOpportunity({ ...base, fitScore: 0.9 }, d);
    expect(r.verdict).toBe("defer");
  });

  it("H2 — scopes capacity + margin reads to the action's business (not workspace-wide)", async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    const d = {
      db: {
        ownerEquipment: { findMany: vi.fn(async (a: { where: unknown }) => { captured.equip = a.where as Record<string, unknown>; return []; }) },
        ownerFinancialSnapshot: { findFirst: vi.fn(async (a: { where: unknown }) => { captured.snap = a.where as Record<string, unknown>; return null; }) },
      },
      now: () => new Date("2026-06-28T00:00:00.000Z"),
    };
    await decideOpportunity({ workspaceId: "ws1", businessId: "bizA", fitScore: 0.9, paymentRisk: "low" }, d as never);
    expect(captured.equip).toEqual({ workspaceId: "ws1", OR: [{ businessId: "bizA" }, { businessId: null }] });
    expect(captured.snap).toEqual({ workspaceId: "ws1", businessId: "bizA" });
  });

  it("ACCEPTS a profitable, fulfillable, low-risk opportunity", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 50 }, equipment: [{ name: "Washer", utilization: 0.4, downtimeState: "up", maintenanceDueAt: new Date("2027-01-01"), status: "operational" }] });
    const r = await decideOpportunity({ ...base, fitScore: 0.9 }, d);
    expect(r.verdict).toBe("accept");
    expect(r.nextAction).toMatch(/Proceed/);
  });

  it("DEFERS a high-payment-risk opportunity even with good margin/capacity", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 50 } });
    const r = await decideOpportunity({ ...base, fitScore: 0.9, paymentRisk: "high" }, d);
    expect(r.verdict).toBe("defer");
  });
});
