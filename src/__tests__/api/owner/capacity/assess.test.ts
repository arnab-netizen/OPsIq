/**
 * POST /api/owner/capacity/assess — Equipment Capacity Assessment (Module #16).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (capacityAssessRequestSchema)
 * 3. Route handler: workspace isolation, fleet assessment wiring, growth-gate logic
 *
 * The pure domain engine (assessFleetCapacity, capacityBlocksGrowth) is NOT mocked
 * — it is deterministic with no side effects; all expected values are hand-calculated.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { POST } from "@/app/api/owner/capacity/assess/route";
import { capacityAssessRequestSchema } from "@/domain/owner-mode/capacity-assess.validation";

const WS = "ws-canonical";
const AT = "2026-07-11T10:00:00.000Z";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/capacity/assess",
      json: async () => body,
    },
  } as const;
}

const SAFE_EQUIPMENT = {
  name: "Washing Machine A",
  utilization: 0.60,
  downtimeState: "up",
  maintenanceDueAt: null,
  status: "operational",
};

const HIGH_UTILIZATION_EQUIPMENT = {
  name: "Washing Machine B",
  utilization: 0.96,
  downtimeState: "up",
  maintenanceDueAt: null,
  status: "operational",
};

const DOWN_EQUIPMENT = {
  name: "Dryer X",
  utilization: null,
  downtimeState: "down",
  maintenanceDueAt: null,
  status: "out_of_service",
};

const OVERDUE_MAINTENANCE_EQUIPMENT = {
  name: "Press Y",
  utilization: 0.70,
  downtimeState: "up",
  maintenanceDueAt: "2026-01-01T00:00:00.000Z", // well before AT
  status: "operational",
};

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-16] capacity/assess route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/api/owner/capacity/assess/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_VIEW capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("overwrites workspaceId with ctx.verifiedWorkspaceId (never body)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).not.toContain("body.workspaceId");
  });

  it("exports POST handler only (no GET/DELETE/PATCH)", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const GET");
    expect(src).not.toContain("export const DELETE");
    expect(src).not.toContain("export const PATCH");
  });

  it("validates body via capacityAssessRequestSchema", () => {
    expect(src).toContain("capacityAssessRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls assessFleetCapacity and capacityBlocksGrowth", () => {
    expect(src).toContain("assessFleetCapacity");
    expect(src).toContain("capacityBlocksGrowth");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-16] capacityAssessRequestSchema", () => {
  it("accepts an empty equipment array (no-equipment business)", () => {
    const r = capacityAssessRequestSchema.safeParse({ equipment: [] });
    expect(r.success).toBe(true);
  });

  it("accepts a valid equipment record with all fields", () => {
    const r = capacityAssessRequestSchema.safeParse({ equipment: [SAFE_EQUIPMENT], evaluatedAt: AT });
    expect(r.success).toBe(true);
  });

  it("accepts multiple equipment records", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [SAFE_EQUIPMENT, HIGH_UTILIZATION_EQUIPMENT],
      evaluatedAt: AT,
    });
    expect(r.success).toBe(true);
  });

  it("accepts null utilization (unknown — surfaces as caution)", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, utilization: null }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts null maintenanceDueAt (no scheduled maintenance)", () => {
    const r = capacityAssessRequestSchema.safeParse({ equipment: [SAFE_EQUIPMENT] });
    expect(r.success).toBe(true);
  });

  it("accepts evaluatedAt as optional", () => {
    const r = capacityAssessRequestSchema.safeParse({ equipment: [] });
    expect(r.success).toBe(true);
  });

  it("rejects utilization below 0", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, utilization: -0.1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects utilization above 1", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, utilization: 1.1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid downtimeState enum", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, downtimeState: "maybe" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid equipment status enum", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, status: "unknown" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing equipment field (required)", () => {
    const r = capacityAssessRequestSchema.safeParse({ evaluatedAt: AT });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const r = capacityAssessRequestSchema.safeParse({ equipment: [], unknownField: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in the body (strict mode)", () => {
    const r = capacityAssessRequestSchema.safeParse({ equipment: [], workspaceId: "ws-attempt" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields inside an equipment record (strict mode)", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, unknownField: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects equipment record with empty name", () => {
    const r = capacityAssessRequestSchema.safeParse({
      equipment: [{ ...SAFE_EQUIPMENT, name: "" }],
    });
    expect(r.success).toBe(false);
  });
});

// ─── 3. Route handler — fleet assessment wiring and growth gate ─────────────

describe("[module-16] POST /api/owner/capacity/assess — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("result shape includes all expected top-level keys", async () => {
    const result = await POST(makeCtx({ equipment: [], evaluatedAt: AT })) as Record<string, unknown>;
    expect(result).toHaveProperty("workspaceId");
    expect(result).toHaveProperty("evaluatedAt");
    expect(result).toHaveProperty("fleet");
    expect(result).toHaveProperty("growthBlocked");
    expect(result).toHaveProperty("equipmentCount");
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId, not body", async () => {
    const result = await POST(makeCtx({ equipment: [], evaluatedAt: AT }, "ws-TENANT")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-TENANT");
  });

  it("returns safe status and growthBlocked=false for empty fleet", async () => {
    const result = await POST(makeCtx({ equipment: [], evaluatedAt: AT })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("safe");
    expect(result.growthBlocked).toBe(false);
  });

  it("returns equipmentCount matching the input array length", async () => {
    const result = await POST(makeCtx({
      equipment: [SAFE_EQUIPMENT, HIGH_UTILIZATION_EQUIPMENT],
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    expect(result.equipmentCount).toBe(2);
  });

  it("returns safe status for equipment with 60% utilization", async () => {
    const result = await POST(makeCtx({ equipment: [SAFE_EQUIPMENT], evaluatedAt: AT })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("safe");
    expect(result.growthBlocked).toBe(false);
  });

  it("returns high_risk status and growthBlocked=true when utilization ≥95%", async () => {
    const result = await POST(makeCtx({ equipment: [HIGH_UTILIZATION_EQUIPMENT], evaluatedAt: AT })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("high_risk");
    expect(result.growthBlocked).toBe(true);
  });

  it("returns blocked status and growthBlocked=true when equipment is down", async () => {
    const result = await POST(makeCtx({ equipment: [DOWN_EQUIPMENT], evaluatedAt: AT })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("blocked");
    expect(result.growthBlocked).toBe(true);
  });

  it("returns blocked status when maintenance is overdue", async () => {
    const result = await POST(makeCtx({
      equipment: [OVERDUE_MAINTENANCE_EQUIPMENT],
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("blocked");
    expect(result.growthBlocked).toBe(true);
  });

  it("worst-case status wins across mixed fleet (blocked + safe = blocked)", async () => {
    const result = await POST(makeCtx({
      equipment: [SAFE_EQUIPMENT, DOWN_EQUIPMENT],
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("blocked");
    expect(result.growthBlocked).toBe(true);
  });

  it("bottlenecks list contains downed equipment name", async () => {
    const result = await POST(makeCtx({
      equipment: [SAFE_EQUIPMENT, DOWN_EQUIPMENT],
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    const fleet = result.fleet as { bottlenecks: string[] };
    expect(fleet.bottlenecks).toContain(DOWN_EQUIPMENT.name);
    expect(fleet.bottlenecks).not.toContain(SAFE_EQUIPMENT.name);
  });

  it("returns caution when utilization is null (unknown)", async () => {
    const result = await POST(makeCtx({
      equipment: [{ ...SAFE_EQUIPMENT, utilization: null }],
      evaluatedAt: AT,
    })) as Record<string, unknown>;
    const fleet = result.fleet as Record<string, unknown>;
    expect(fleet.status).toBe("caution");
    expect(result.growthBlocked).toBe(false);
  });

  it("evaluatedAt in response matches the supplied evaluatedAt", async () => {
    const result = await POST(makeCtx({ equipment: [], evaluatedAt: AT })) as Record<string, unknown>;
    expect(result.evaluatedAt).toBe(AT);
  });

  it("rejects unknown body fields before fleet assessment", async () => {
    await expect(POST(makeCtx({ equipment: [], unknownField: "x" }))).rejects.toThrow();
  });

  it("rejects workspaceId in body before fleet assessment", async () => {
    await expect(
      POST(makeCtx({ equipment: [], workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
  });

  it("tenant isolation: different workspaces get different workspaceIds in result", async () => {
    const r1 = await POST(makeCtx({ equipment: [], evaluatedAt: AT }, "ws-ALICE")) as Record<string, unknown>;
    const r2 = await POST(makeCtx({ equipment: [], evaluatedAt: AT }, "ws-BOB")) as Record<string, unknown>;
    expect(r1.workspaceId).toBe("ws-ALICE");
    expect(r2.workspaceId).toBe("ws-BOB");
  });

  it("is pure — identical fleet produces identical result every call", async () => {
    const r1 = await POST(makeCtx({ equipment: [SAFE_EQUIPMENT], evaluatedAt: AT })) as { fleet: Record<string, unknown> };
    const r2 = await POST(makeCtx({ equipment: [SAFE_EQUIPMENT], evaluatedAt: AT })) as { fleet: Record<string, unknown> };
    expect(r1.fleet.status).toBe(r2.fleet.status);
    expect(r1.fleet.bottlenecks).toEqual(r2.fleet.bottlenecks);
  });
});
