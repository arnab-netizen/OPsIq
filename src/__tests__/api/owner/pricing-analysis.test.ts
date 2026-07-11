/**
 * POST /api/owner/pricing-analysis — Business Pricing Analytics (Module P1).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (pricingAnalysisRequestSchema)
 * 3. Route handler: workspace tenant isolation, unit-economics wiring, result shape
 *
 * Pure unit-economics functions are NOT mocked — they are deterministic and
 * have no side effects, so the real implementations run here.
 * Domain engine correctness is covered by existing unit-economics tests.
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

import { POST } from "@/app/api/owner/pricing-analysis/route";
import { pricingAnalysisRequestSchema } from "@/domain/owner-finance/pricing-analysis.validation";

const WS = "ws-canonical";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/pricing-analysis",
      json: async () => body,
    },
  } as const;
}

const MINIMAL_ORDER = { revenue: 1000, labourCost: 200, materialCost: 300 };

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-P1] pricing-analysis route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/pricing-analysis/route.ts"),
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

  it("validates body via pricingAnalysisRequestSchema", () => {
    expect(src).toContain("pricingAnalysisRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls unit-economics functions (pure domain engine)", () => {
    expect(src).toContain("contributionMargin");
    expect(src).toContain("minimumViablePrice");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-P1] pricingAnalysisRequestSchema", () => {
  it("accepts a minimal valid body (just revenue in order)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({ order: { revenue: 500 } });
    expect(r.success).toBe(true);
  });

  it("accepts a full order with all optional cost components", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: {
        revenue: 1000,
        labourCost: 200,
        materialCost: 150,
        deliveryCost: 50,
        reworkCost: 25,
        refundCost: 10,
        otherDirectCost: 15,
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts resourceUsage with optional sub-fields", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      resourceUsage: { labourHours: 4, machineHours: 2, deliveryKm: 30 },
    });
    expect(r.success).toBe(true);
  });

  it("accepts targetMarginPct at 0 (boundary)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      targetMarginPct: 0,
    });
    expect(r.success).toBe(true);
  });

  it("accepts targetMarginPct at 0.99 (boundary)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      targetMarginPct: 0.99,
    });
    expect(r.success).toBe(true);
  });

  it("rejects targetMarginPct above 0.99", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      targetMarginPct: 1.0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects targetMarginPct below 0", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      targetMarginPct: -0.1,
    });
    expect(r.success).toBe(false);
  });

  it("accepts proposedPrice as optional number", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      proposedPrice: 850,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid two-segment comparison", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      segments: [
        { name: "B2B", orders: [{ revenue: 2000, labourCost: 500 }] },
        { name: "Retail", orders: [{ revenue: 500, labourCost: 200 }] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects segments tuple with only one segment", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      segments: [{ name: "B2B", orders: [{ revenue: 2000 }] }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects segments with empty orders array", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      segments: [
        { name: "B2B", orders: [] },
        { name: "Retail", orders: [{ revenue: 500 }] },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing order field (required)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({ proposedPrice: 500 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      unknownField: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in the body (not a declared schema field)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000 },
      workspaceId: "ws-attempt",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields inside the order object (strict mode)", () => {
    const r = pricingAnalysisRequestSchema.safeParse({
      order: { revenue: 1000, unknownCost: 50 },
    });
    expect(r.success).toBe(false);
  });
});

// ─── 3. Route handler — workspace isolation and unit-economics wiring ────────

describe("[module-P1] POST /api/owner/pricing-analysis — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId, not body", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER }, "ws-CANONICAL")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-CANONICAL");
  });

  it("result shape includes all expected top-level keys", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as Record<string, unknown>;
    expect(result).toHaveProperty("workspaceId");
    expect(result).toHaveProperty("order");
    expect(result).toHaveProperty("discountSafety");
    expect(result).toHaveProperty("segmentComparison");
  });

  it("order sub-object contains all unit-economics fields", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    const o = result.order;
    expect(o).toHaveProperty("contributionMargin");
    expect(o).toHaveProperty("contributionMarginPct");
    expect(o).toHaveProperty("lossMaking");
    expect(o).toHaveProperty("minimumViablePrice");
    expect(o).toHaveProperty("marginFloorPrice");
    expect(o).toHaveProperty("targetMarginPct");
    expect(o).toHaveProperty("perLabourHour");
    expect(o).toHaveProperty("perMachineHour");
    expect(o).toHaveProperty("perDeliveryKm");
  });

  it("computes correct contributionMargin for known input", async () => {
    // revenue=1000, labourCost=200, materialCost=300 → cm = 1000 - 500 = 500
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    expect(result.order.contributionMargin).toBe(500);
  });

  it("computes correct contributionMarginPct for known input", async () => {
    // cm=500, revenue=1000 → cmPct = 0.5
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    expect(result.order.contributionMarginPct).toBe(0.5);
  });

  it("sets lossMaking=false when margin is positive", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    expect(result.order.lossMaking).toBe(false);
  });

  it("sets lossMaking=true when costs exceed revenue", async () => {
    const result = await POST(makeCtx({
      order: { revenue: 500, labourCost: 400, materialCost: 200 }, // cm = -100
    })) as { order: Record<string, unknown> };
    expect(result.order.lossMaking).toBe(true);
  });

  it("uses DEFAULT targetMarginPct of 0.20 when not specified", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    expect(result.order.targetMarginPct).toBe(0.20);
  });

  it("uses caller-supplied targetMarginPct when provided", async () => {
    const result = await POST(makeCtx({
      order: MINIMAL_ORDER,
      targetMarginPct: 0.30,
    })) as { order: Record<string, unknown> };
    expect(result.order.targetMarginPct).toBe(0.30);
  });

  it("discountSafety is null when no proposedPrice given", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as Record<string, unknown>;
    expect(result.discountSafety).toBeNull();
  });

  it("discountSafety is computed when proposedPrice is given", async () => {
    // directCost = 500, proposedPrice = 600, target = 0.20, floorPrice = 500/0.8 = 625
    const result = await POST(makeCtx({
      order: MINIMAL_ORDER,
      proposedPrice: 600,
    })) as { discountSafety: Record<string, unknown> | null };
    expect(result.discountSafety).not.toBeNull();
    expect(result.discountSafety).toHaveProperty("safe");
    expect(result.discountSafety).toHaveProperty("floorPrice");
    expect(result.discountSafety).toHaveProperty("proposedPrice", 600);
    // 600 < 625 → not safe
    expect(result.discountSafety!.safe).toBe(false);
  });

  it("discountSafety.safe is true when proposedPrice exceeds floor", async () => {
    // directCost = 500, target = 0.20, floorPrice = 625; proposedPrice = 700 > 625 → safe
    const result = await POST(makeCtx({
      order: MINIMAL_ORDER,
      proposedPrice: 700,
    })) as { discountSafety: Record<string, unknown> | null };
    expect(result.discountSafety!.safe).toBe(true);
  });

  it("segmentComparison is null when no segments given", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as Record<string, unknown>;
    expect(result.segmentComparison).toBeNull();
  });

  it("segmentComparison is computed when two segments provided", async () => {
    const result = await POST(makeCtx({
      order: MINIMAL_ORDER,
      segments: [
        { name: "B2B", orders: [{ revenue: 2000, labourCost: 400 }] },
        { name: "Retail", orders: [{ revenue: 800, labourCost: 300 }] },
      ],
    })) as { segmentComparison: Record<string, unknown> | null };
    expect(result.segmentComparison).not.toBeNull();
    expect(result.segmentComparison).toHaveProperty("segments");
    expect(result.segmentComparison).toHaveProperty("comparison");
    const segs = result.segmentComparison!.segments as unknown[];
    expect(segs).toHaveLength(2);
  });

  it("per-resource fields are null when no resourceUsage given", async () => {
    const result = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    expect(result.order.perLabourHour).toBeNull();
    expect(result.order.perMachineHour).toBeNull();
    expect(result.order.perDeliveryKm).toBeNull();
  });

  it("per-resource fields are computed when resourceUsage is given", async () => {
    // cm = 500, labourHours = 5 → profitPerLabourHour = 100
    const result = await POST(makeCtx({
      order: MINIMAL_ORDER,
      resourceUsage: { labourHours: 5 },
    })) as { order: Record<string, unknown> };
    expect(result.order.perLabourHour).toBe(100);
    expect(result.order.perMachineHour).toBeNull(); // not supplied → null
    expect(result.order.perDeliveryKm).toBeNull(); // not supplied → null
  });

  it("rejects invalid body (missing order) before computing economics", async () => {
    await expect(POST(makeCtx({ proposedPrice: 500 }))).rejects.toThrow();
  });

  it("rejects unknown body fields before computing economics", async () => {
    await expect(POST(makeCtx({ order: MINIMAL_ORDER, unknownField: "x" }))).rejects.toThrow();
  });

  it("does not let a body workspaceId field bypass tenant isolation", async () => {
    await expect(
      POST(makeCtx({ order: MINIMAL_ORDER, workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
  });

  it("always sets workspaceId from ctx across different workspace contexts", async () => {
    const r1 = await POST(makeCtx({ order: MINIMAL_ORDER }, "ws-ALICE")) as Record<string, unknown>;
    expect(r1.workspaceId).toBe("ws-ALICE");

    const r2 = await POST(makeCtx({ order: MINIMAL_ORDER }, "ws-BOB")) as Record<string, unknown>;
    expect(r2.workspaceId).toBe("ws-BOB");
    expect(r2.workspaceId).not.toBe("ws-ALICE");
  });

  it("does not mutate state (pure analysis — no persistence expected)", async () => {
    // Call twice with same input — both succeed without side effects
    const r1 = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    const r2 = await POST(makeCtx({ order: MINIMAL_ORDER })) as { order: Record<string, unknown> };
    expect(r1.order.contributionMargin).toBe(r2.order.contributionMargin);
  });
});
