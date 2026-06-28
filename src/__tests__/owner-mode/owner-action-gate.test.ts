/**
 * Jarvis 360 owner-flow closure (EH-01,EH-02,EH-09,EH-18) — owner-mode action gate (DI).
 * Proves the default-on gate enforces on the owner's own runtime flow (not the consulting
 * Recommendation path): opt-out aware, do-not-repeat by domain scope, capacity for growth.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { ConflictError } from "@/infra/errors";

beforeEach(() => emitAuditEvent.mockClear());

function deps(opts: {
  optOut?: boolean;
  dnrRule?: { changedContextExplanation: string | null } | null;
  equipment?: Array<{ name: string; utilization: number | null; downtimeState: string; maintenanceDueAt: Date | null; status: string }>;
}) {
  const now = new Date("2026-06-28T00:00:00.000Z");
  return {
    db: {
      clientAccount: {
        findUnique: vi.fn(async () =>
          opts.optOut
            ? { requireBusinessImpactAssessment: false, ownerGateOptOutAt: new Date("2026-06-01"), ownerGateOptOutExpiresAt: null }
            : { requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null }
        ),
        update: vi.fn(),
      },
      ownerDoNotRepeatRule: { findFirst: vi.fn(async () => opts.dnrRule ?? null) },
      ownerEquipment: { findMany: vi.fn(async () => opts.equipment ?? []) },
    },
    now: () => now,
  };
}

const base = { workspaceId: "ws1", businessId: "biz1", actionId: "act1" };

describe("enforceOwnerActionGates", () => {
  it("no-ops on a non-material transition (assigned)", async () => {
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "assigned" }, deps({}) as never)).resolves.toBeUndefined();
  });

  it("no-ops when the owner has an active audited opt-out", async () => {
    const d = deps({ optOut: true, equipment: [{ name: "down", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("blocks a material transition when a do-not-repeat rule exists for the domain scope", async () => {
    const d = deps({ dnrRule: { changedContextExplanation: null } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("allows when the do-not-repeat rule carries a changed-context override", async () => {
    const d = deps({ dnrRule: { changedContextExplanation: "market shifted" } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress" }, d as never)).resolves.toBeUndefined();
  });

  it("blocks a growth-domain action when capacity is unsafe (equipment down)", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not apply the capacity gate to a non-capacity domain (finance)", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("allows a growth-domain action when capacity is safe", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.4, downtimeState: "up", maintenanceDueAt: new Date("2026-12-01"), status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });
});
