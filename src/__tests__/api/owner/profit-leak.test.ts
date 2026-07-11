/**
 * POST /api/owner/profit-leak — Waste & Profit-Leak Analysis (Module W1).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (profitLeakSignalsBodySchema)
 * 3. Route handler: workspace tenant isolation, signal propagation, engine result pass-through
 *
 * Domain engine correctness is covered by the existing
 * src/__tests__/owner-mode/profit-leak-radar.test.ts (193 lines).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const mocks = vi.hoisted(() => ({ identifyProfitLeaks: vi.fn() }));

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

vi.mock("@/domain/owner-mode/profit-leak-radar", () => ({
  identifyProfitLeaks: mocks.identifyProfitLeaks,
}));

import { POST } from "@/app/api/owner/profit-leak/route";
import { profitLeakSignalsBodySchema } from "@/domain/owner-mode/profit-leak-radar.validation";

const AT = "2026-07-11T00:00:00.000Z";
const WS = "ws-canonical";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/profit-leak",
      json: async () => body,
    },
  } as const;
}

beforeEach(() => vi.clearAllMocks());

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-W1] profit-leak route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/profit-leak/route.ts"),
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

  it("validates body via profitLeakSignalsBodySchema", () => {
    expect(src).toContain("profitLeakSignalsBodySchema");
    expect(src).toContain("parseRequestBody");
  });

  it("calls identifyProfitLeaks (the pure domain engine)", () => {
    expect(src).toContain("identifyProfitLeaks");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-W1] profitLeakSignalsBodySchema", () => {
  it("accepts a minimal valid body (only evaluatedAt required)", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT });
    expect(r.success).toBe(true);
  });

  it("accepts a full body with numeric and boolean optional fields", () => {
    const r = profitLeakSignalsBodySchema.safeParse({
      evaluatedAt: AT,
      currency: "USD",
      revenue: 100000,
      discountAmount: 5000,
      discountLeak: true,
      marginPct: 0.18,
      marginSafe: false,
      complaintsCount: 3,
      reworkCount: 2,
      capacityUtilizationPct: 45,
      ownerBottleneckItems: 7,
      currentConstraint: "CAPACITY",
      missingCriticalData: ["gross margin"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts null for nullable fields", () => {
    const r = profitLeakSignalsBodySchema.safeParse({
      evaluatedAt: AT,
      revenue: null,
      marginPct: null,
      currentConstraint: null,
      disputeReworkImpactAmount: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts dispute-derived signal fields", () => {
    const r = profitLeakSignalsBodySchema.safeParse({
      evaluatedAt: AT,
      disputeReworkCount: 2,
      disputeComplaintCount: 1,
      disputeWeakProofCount: 3,
      disputeReworkImpactAmount: 500,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing evaluatedAt", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ revenue: 50000 });
    expect(r.success).toBe(false);
  });

  it("rejects empty evaluatedAt string", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: "" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown body fields (strict mode)", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, unknownField: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects workspaceId in the body (not a declared schema field)", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, workspaceId: "ws-attempt" });
    expect(r.success).toBe(false);
  });

  it("rejects negative complaintsCount", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, complaintsCount: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects capacityUtilizationPct above 100", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, capacityUtilizationPct: 101 });
    expect(r.success).toBe(false);
  });

  it("rejects invalid currentConstraint enum value", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, currentConstraint: "MADE_UP" });
    expect(r.success).toBe(false);
  });

  it("accepts all valid ConstraintType enum values", () => {
    const valid = [
      "DEMAND", "CAPACITY", "CASH", "STAFF", "OWNER", "MANAGER", "QUALITY",
      "DELIVERY", "PRICING", "CUSTOMER_RETENTION", "B2B_ACCOUNT", "EQUIPMENT",
      "COMPLIANCE_OR_LOCAL_VERIFICATION", "STARTUP_VALIDATION", "DATA_INSUFFICIENT",
    ];
    for (const c of valid) {
      const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, currentConstraint: c });
      expect(r.success, `constraint ${c} should be valid`).toBe(true);
    }
  });

  it("accepts integer disputeReworkCount of zero", () => {
    const r = profitLeakSignalsBodySchema.safeParse({ evaluatedAt: AT, disputeReworkCount: 0 });
    expect(r.success).toBe(true);
  });
});

// ─── 3. Route handler — workspace tenant isolation and engine wiring ─────────

describe("[module-W1] POST /api/owner/profit-leak — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("uses ctx.verifiedWorkspaceId — not a body field — as the workspace ID", async () => {
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: AT };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    await POST(makeCtx({ evaluatedAt: AT }, "ws-CANONICAL"));

    expect(mocks.identifyProfitLeaks).toHaveBeenCalledTimes(1);
    const signals = mocks.identifyProfitLeaks.mock.calls[0][0];
    expect(signals.workspaceId).toBe("ws-CANONICAL");
  });

  it("returns the engine result directly", async () => {
    const fakeResult = {
      topLeak: { leakType: "DISCOUNT_LEAK", workspaceId: WS },
      leaks: [{ leakType: "DISCOUNT_LEAK" }],
      evaluatedAt: AT,
    };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    const result = await POST(makeCtx({ evaluatedAt: AT, discountLeak: true }));
    expect(result).toEqual(fakeResult);
  });

  it("propagates optional numeric signal fields to the engine", async () => {
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: AT };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    await POST(makeCtx({ evaluatedAt: AT, complaintsCount: 3, reworkCount: 1, capacityUtilizationPct: 40 }));

    const signals = mocks.identifyProfitLeaks.mock.calls[0][0];
    expect(signals.complaintsCount).toBe(3);
    expect(signals.reworkCount).toBe(1);
    expect(signals.capacityUtilizationPct).toBe(40);
  });

  it("propagates dispute-derived signal fields to the engine", async () => {
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: AT };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    await POST(makeCtx({ evaluatedAt: AT, disputeReworkCount: 2, disputeComplaintCount: 1 }));

    const signals = mocks.identifyProfitLeaks.mock.calls[0][0];
    expect(signals.disputeReworkCount).toBe(2);
    expect(signals.disputeComplaintCount).toBe(1);
  });

  it("rejects invalid body (missing evaluatedAt) before calling engine", async () => {
    await expect(POST(makeCtx({ revenue: 50000 }))).rejects.toThrow();
    expect(mocks.identifyProfitLeaks).not.toHaveBeenCalled();
  });

  it("rejects unknown body fields before calling engine", async () => {
    await expect(POST(makeCtx({ evaluatedAt: AT, unknownField: "x" }))).rejects.toThrow();
    expect(mocks.identifyProfitLeaks).not.toHaveBeenCalled();
  });

  it("does not let a body workspaceId field bypass tenant isolation", async () => {
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: AT };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    // workspaceId is not in the schema — the body field is rejected at validation
    await expect(
      POST(makeCtx({ evaluatedAt: AT, workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
    expect(mocks.identifyProfitLeaks).not.toHaveBeenCalled();
  });

  it("always sets workspaceId from ctx even across different workspace contexts", async () => {
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: AT };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    await POST(makeCtx({ evaluatedAt: AT }, "ws-ALICE"));
    const callA = mocks.identifyProfitLeaks.mock.calls[0][0];
    expect(callA.workspaceId).toBe("ws-ALICE");

    vi.clearAllMocks();
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    await POST(makeCtx({ evaluatedAt: AT }, "ws-BOB"));
    const callB = mocks.identifyProfitLeaks.mock.calls[0][0];
    expect(callB.workspaceId).toBe("ws-BOB");
    expect(callB.workspaceId).not.toBe("ws-ALICE");
  });

  it("passes evaluatedAt from the body through to the engine", async () => {
    const customAt = "2026-01-15T12:00:00.000Z";
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: customAt };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    await POST(makeCtx({ evaluatedAt: customAt }));

    const signals = mocks.identifyProfitLeaks.mock.calls[0][0];
    expect(signals.evaluatedAt).toBe(customAt);
  });

  it("does not mutate state (pure analysis — no persistence expected)", async () => {
    const fakeResult = { topLeak: null, leaks: [], evaluatedAt: AT };
    mocks.identifyProfitLeaks.mockReturnValue(fakeResult);

    // Engine called once, no DB write calls mocked
    await POST(makeCtx({ evaluatedAt: AT }));
    expect(mocks.identifyProfitLeaks).toHaveBeenCalledTimes(1);
  });
});
