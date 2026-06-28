/**
 * Jarvis 360 Slice 0 — owner safety-gate enforcement policy tests.
 *
 * Pure/DI unit tests: no DB. The audit module is mocked so recordGateOptOut can be
 * verified without a database. Covers default-on, strict, audited opt-out, expiry,
 * authority, reason-required, and the OPTED_OUT enforcement short-circuit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import {
  resolveOwnerGateMode,
  shouldEnforceOwnerGates,
  enforceOwnerGatesForPromotion,
  recordGateOptOut,
  clearGateOptOut,
  GateOptOutUnauthorizedError,
  GateOptOutInvalidError,
  type PolicyDeps,
} from "@/services/owner-mode/gate-enforcement-policy";

const NOW = new Date("2026-06-28T00:00:00.000Z");

function makeDeps(row: Record<string, unknown> | null): { deps: PolicyDeps; update: ReturnType<typeof vi.fn> } {
  const update = vi.fn(async () => ({}));
  const deps: PolicyDeps = {
    now: () => NOW,
    db: {
      clientAccount: {
        findUnique: vi.fn(async () => row as never),
        update,
      },
    },
  };
  return { deps, update };
}

beforeEach(() => emitAuditEvent.mockClear());

describe("resolveOwnerGateMode", () => {
  it("is DEFAULT_ON when no flag and no opt-out", async () => {
    const { deps } = makeDeps({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null });
    expect(await resolveOwnerGateMode("ws1", deps)).toBe("DEFAULT_ON");
  });

  it("is DEFAULT_ON when the workspace row is missing (fail-safe to enforcing)", async () => {
    const { deps } = makeDeps(null);
    expect(await resolveOwnerGateMode("ws1", deps)).toBe("DEFAULT_ON");
  });

  it("is STRICT when legacy opt-in flag is true", async () => {
    const { deps } = makeDeps({ requireBusinessImpactAssessment: true, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null });
    expect(await resolveOwnerGateMode("ws1", deps)).toBe("STRICT");
  });

  it("is OPTED_OUT when an active opt-out exists", async () => {
    const { deps } = makeDeps({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: new Date("2026-06-27T00:00:00Z"), ownerGateOptOutExpiresAt: null });
    expect(await resolveOwnerGateMode("ws1", deps)).toBe("OPTED_OUT");
  });

  it("opt-out takes precedence even over the strict flag", async () => {
    const { deps } = makeDeps({ requireBusinessImpactAssessment: true, ownerGateOptOutAt: new Date("2026-06-27T00:00:00Z"), ownerGateOptOutExpiresAt: null });
    expect(await resolveOwnerGateMode("ws1", deps)).toBe("OPTED_OUT");
  });

  it("ignores an expired opt-out (reverts to enforcing)", async () => {
    const { deps } = makeDeps({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: new Date("2026-06-01T00:00:00Z"), ownerGateOptOutExpiresAt: new Date("2026-06-10T00:00:00Z") });
    expect(await resolveOwnerGateMode("ws1", deps)).toBe("DEFAULT_ON");
  });
});

describe("shouldEnforceOwnerGates", () => {
  it("false only when opted out", async () => {
    const optedOut = makeDeps({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: NOW, ownerGateOptOutExpiresAt: null });
    expect(await shouldEnforceOwnerGates("ws1", optedOut.deps)).toBe(false);
    const def = makeDeps({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null });
    expect(await shouldEnforceOwnerGates("ws1", def.deps)).toBe(true);
  });
});

describe("enforceOwnerGatesForPromotion", () => {
  it("short-circuits (no gate calls, no throw) when opted out", async () => {
    const { deps } = makeDeps({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: NOW, ownerGateOptOutExpiresAt: null });
    await expect(enforceOwnerGatesForPromotion("rec1", "ws1", deps)).resolves.toBeUndefined();
  });
});

describe("recordGateOptOut", () => {
  it("rejects a non-owner actor", async () => {
    const { deps } = makeDeps(null);
    await expect(
      recordGateOptOut({ workspaceId: "ws1", actorId: "u1", actorIsOwner: false, reason: "x", riskClass: "low" }, deps)
    ).rejects.toBeInstanceOf(GateOptOutUnauthorizedError);
  });

  it("rejects an empty reason", async () => {
    const { deps } = makeDeps(null);
    await expect(
      recordGateOptOut({ workspaceId: "ws1", actorId: "u1", actorIsOwner: true, reason: "   ", riskClass: "low" }, deps)
    ).rejects.toBeInstanceOf(GateOptOutInvalidError);
  });

  it("persists the opt-out scoped to the workspace and emits an audit event", async () => {
    const { deps, update } = makeDeps(null);
    await recordGateOptOut({ workspaceId: "ws1", actorId: "u1", actorIsOwner: true, reason: "month-end migration", riskClass: "high" }, deps);
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "ws1" });
    expect(arg.data.ownerGateOptOutAt).toEqual(NOW);
    expect(arg.data.ownerGateOptOutBy).toBe("u1");
    expect(arg.data.ownerGateOptOutRisk).toBe("high");
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent.mock.calls[0][0]).toMatchObject({ workspaceId: "ws1", actorId: "u1" });
  });
});

describe("clearGateOptOut", () => {
  it("rejects a non-owner and clears for an owner", async () => {
    const bad = makeDeps(null);
    await expect(clearGateOptOut({ workspaceId: "ws1", actorId: "u1", actorIsOwner: false }, bad.deps)).rejects.toBeInstanceOf(GateOptOutUnauthorizedError);
    const ok = makeDeps(null);
    await clearGateOptOut({ workspaceId: "ws1", actorId: "u1", actorIsOwner: true }, ok.deps);
    expect(ok.update).toHaveBeenCalledTimes(1);
    expect(ok.update.mock.calls[0][0].data.ownerGateOptOutAt).toBeNull();
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
});
