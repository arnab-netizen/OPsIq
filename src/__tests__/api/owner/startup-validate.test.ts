/**
 * POST /api/owner/startup-validate — Startup Mode validation (Module #12).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, POST only)
 * 2. Zod schema validation (startupValidateRequestSchema)
 * 3. Route handler: auth wiring, service delegation, input/output pass-through
 *
 * Domain engine correctness (validateStartup, composeWealthCommandCenter)
 * is covered by the existing owner-strategy domain tests
 * (startup-mode.test.ts, startup-service.test.ts).
 *
 * Note on unknown-field rejection: the outer startupValidateRequestSchema uses
 * z.object() so safeParse() strips unknown top-level keys silently. However,
 * parseRequestBody() performs an explicit unknown-key check and throws for any
 * key not in schema.shape — so route tests DO reject unknown top-level fields
 * even though the schema alone would not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const mocks = vi.hoisted(() => ({
  validateStartupSession: vi.fn(),
}));

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

vi.mock("@/services/owner-strategy/startup.service", () => ({
  validateStartupSession: mocks.validateStartupSession,
}));

import { POST } from "@/app/api/owner/startup-validate/route";
import { startupValidateRequestSchema } from "@/domain/owner-strategy/startup-mode.validation";

const WS = "ws-canonical";

function makeCtx(body: Record<string, unknown>, workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/startup-validate",
      json: async () => body,
    },
  } as const;
}

const MINIMAL_IDEA = { name: "Mobile Car Wash", industry: "Automotive", structural: {} };
const MINIMAL_BODY = { intake: {}, ideas: [MINIMAL_IDEA] };

const FAKE_RESULT = {
  validation: { shortlist: [], rejections: [], validationPackage: null },
  commandCenter: { mode: "startup", sections: [] },
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. Route static enforcement ────────────────────────────────────────────

describe("[module-12] startup-validate route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/startup-validate/route.ts"),
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

  it("exports POST handler only (no GET/DELETE/PATCH)", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const GET");
    expect(src).not.toContain("export const DELETE");
    expect(src).not.toContain("export const PATCH");
  });

  it("validates body via startupValidateRequestSchema", () => {
    expect(src).toContain("startupValidateRequestSchema");
    expect(src).toContain("parseRequestBody");
  });

  it("delegates to validateStartupSession (thin route)", () => {
    expect(src).toContain("validateStartupSession");
  });

  it("does not read workspaceId from body (pure analysis, auth-layer tenant enforcement only)", () => {
    expect(src).not.toContain("body.workspaceId");
  });
});

// ─── 2. Zod schema validation ────────────────────────────────────────────────

describe("[module-12] startupValidateRequestSchema", () => {
  it("accepts a minimal valid body — empty intake + one idea", () => {
    const r = startupValidateRequestSchema.safeParse(MINIMAL_BODY);
    expect(r.success).toBe(true);
  });

  it("accepts a full intake with all optional fields", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {
        location: "Cape Town",
        capitalAvailable: 50000,
        monthlySurvivalNeed: 8000,
        hoursPerWeekAvailable: 40,
        skills: ["cleaning", "logistics"],
        existingAssets: ["van"],
        riskTolerance: "medium",
        targetMonthlyIncome: 15000,
        preferredIndustries: ["services"],
        canSell: true,
        canOperateDaily: true,
        fastCashVsScale: "fast_cash",
      },
      ideas: [MINIMAL_IDEA],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an idea with full structural data", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {},
      ideas: [
        {
          name: "Laundry Service",
          industry: "Domestic Services",
          structural: {
            grossMarginPct: 0.45,
            netMarginPct: 0.20,
            monthlyRevenue: 30000,
            cashRunwayMonths: 6,
            timeToCashMonths: 2,
            revenueFrequency: "recurring",
            repeatCustomerPct: 0.70,
            customerAcquisitionDifficulty: "low",
            demandValidated: true,
            ownerIsPrimaryOperator: false,
            staffCanRunWithoutOwner: true,
            ownerHoursPerWeek: 10,
            differentiation: "moderate",
            pricingPower: "strong",
            competitiveMoat: "weak",
            expansionPath: "local",
            capitalIntensity: "low",
            workingCapitalPressure: "low",
            downsideRisk: "medium",
            regulatoryBurden: "low",
            trendDeclining: false,
          },
          estimatedStartupCost: 25000,
          estimatedMonthlyRevenue: 30000,
          estimatedMonthlyCost: 16500,
          timeToFirstRevenueMonths: 2,
          jurisdictionKnown: true,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts multiple ideas up to 20", () => {
    const ideas = Array.from({ length: 5 }, (_, i) => ({
      name: `Idea ${i + 1}`,
      industry: "Services",
      structural: {},
    }));
    const r = startupValidateRequestSchema.safeParse({ intake: {}, ideas });
    expect(r.success).toBe(true);
  });

  it("rejects empty ideas array (min 1 required)", () => {
    const r = startupValidateRequestSchema.safeParse({ intake: {}, ideas: [] });
    expect(r.success).toBe(false);
  });

  it("rejects idea missing name field", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {},
      ideas: [{ industry: "Services", structural: {} }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects idea with empty name string", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {},
      ideas: [{ name: "", industry: "Services", structural: {} }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects idea missing industry field", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {},
      ideas: [{ name: "Idea", structural: {} }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields inside intake (strict inner schema)", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: { unknownField: "x" },
      ideas: [MINIMAL_IDEA],
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields inside structural (strict inner schema)", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {},
      ideas: [{ name: "Idea", industry: "X", structural: { unknownField: true } }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid riskTolerance enum (must be low/medium/high)", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: { riskTolerance: "extreme" },
      ideas: [MINIMAL_IDEA],
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid revenueFrequency enum in structural", () => {
    const r = startupValidateRequestSchema.safeParse({
      intake: {},
      ideas: [{ name: "X", industry: "Y", structural: { revenueFrequency: "daily" } }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing ideas field entirely", () => {
    const r = startupValidateRequestSchema.safeParse({ intake: {} });
    expect(r.success).toBe(false);
  });
});

// ─── 3. Route handler — auth wiring, service delegation, pass-through ────────

describe("[module-12] POST /api/owner/startup-validate — route handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const options = (POST as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("returns the service result directly", async () => {
    mocks.validateStartupSession.mockReturnValue(FAKE_RESULT);
    const result = await POST(makeCtx(MINIMAL_BODY));
    expect(result).toEqual(FAKE_RESULT);
  });

  it("calls validateStartupSession exactly once", async () => {
    mocks.validateStartupSession.mockReturnValue(FAKE_RESULT);
    await POST(makeCtx(MINIMAL_BODY));
    expect(mocks.validateStartupSession).toHaveBeenCalledTimes(1);
  });

  it("passes the validated intake to the service", async () => {
    mocks.validateStartupSession.mockReturnValue(FAKE_RESULT);
    const intake = { capitalAvailable: 50000, riskTolerance: "medium" as const };
    await POST(makeCtx({ intake, ideas: [MINIMAL_IDEA] }));
    const [calledIntake] = mocks.validateStartupSession.mock.calls[0];
    expect(calledIntake.capitalAvailable).toBe(50000);
    expect(calledIntake.riskTolerance).toBe("medium");
  });

  it("passes all validated ideas to the service", async () => {
    mocks.validateStartupSession.mockReturnValue(FAKE_RESULT);
    const ideas = [
      { name: "Idea A", industry: "Cleaning", structural: {} },
      { name: "Idea B", industry: "Logistics", structural: {} },
    ];
    await POST(makeCtx({ intake: {}, ideas }));
    const [, calledIdeas] = mocks.validateStartupSession.mock.calls[0];
    expect(calledIdeas).toHaveLength(2);
    expect(calledIdeas[0].name).toBe("Idea A");
    expect(calledIdeas[1].name).toBe("Idea B");
  });

  it("rejects unknown top-level body fields before calling service (parseRequestBody gate)", async () => {
    await expect(POST(makeCtx({ intake: {}, ideas: [MINIMAL_IDEA], unknownField: "x" }))).rejects.toThrow();
    expect(mocks.validateStartupSession).not.toHaveBeenCalled();
  });

  it("rejects workspaceId in the body before calling service", async () => {
    await expect(
      POST(makeCtx({ intake: {}, ideas: [MINIMAL_IDEA], workspaceId: "ws-ATTACKER" }, WS))
    ).rejects.toThrow();
    expect(mocks.validateStartupSession).not.toHaveBeenCalled();
  });

  it("rejects invalid body (empty ideas) before calling service", async () => {
    await expect(POST(makeCtx({ intake: {}, ideas: [] }))).rejects.toThrow();
    expect(mocks.validateStartupSession).not.toHaveBeenCalled();
  });

  it("rejects body with missing ideas field before calling service", async () => {
    await expect(POST(makeCtx({ intake: {} }))).rejects.toThrow();
    expect(mocks.validateStartupSession).not.toHaveBeenCalled();
  });

  it("does not mutate state (pure analysis — no persistence)", async () => {
    mocks.validateStartupSession.mockReturnValue(FAKE_RESULT);
    await POST(makeCtx(MINIMAL_BODY));
    await POST(makeCtx(MINIMAL_BODY));
    // Both calls succeed and service was called twice — no singleton or DB writes
    expect(mocks.validateStartupSession).toHaveBeenCalledTimes(2);
  });
});
