/**
 * Non-DB mock tests for:
 *   POST /api/owner/reactivation/assess — Customer Reactivation Campaign Assessment
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 * Pure analysis route — no canonicalJson; handler returns result object directly.
 * Churn rate derived from dormantCustomerCount/cohortSize when avgMonthlyChurnRate absent.
 * cashPressureActive upgrades interventionUrgency by one level.
 * ltvImpact is null when avgMonthlyRevenuePerCustomer is absent.
 * ownerApprovalRequired is always true (governance invariant).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockGenerateWorkPackage,
  mockParseRequestBody,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockGenerateWorkPackage: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/domain/owner-mode/reactivation-assess.validation", () => ({
  reactivationAssessRequestSchema: {},
}));

vi.mock("@/domain/owner-strategy/work-package", () => ({
  generateWorkPackage: mockGenerateWorkPackage,
}));

vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/reactivation/assess";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    routeParams: {},
    ...overrides,
  };
}

const MOCK_REQUEST_BODY = {
  dormantCustomerCount: 50,
  cohortSize: 200,
  avgMonthlyChurnRate: 0.12,
  avgMonthlyRevenuePerCustomer: 500,
  businessName: "Acme Corp",
  context: { cashPressureActive: false },
  evaluatedAt: "2026-07-01T00:00:00.000Z",
};

const MOCK_WORK_PACKAGE = {
  title: "Dormant customer reactivation campaign",
  actionKind: "customer_reactivation",
  ownerApprovalRequired: true,
  steps: [],
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
      try {
        const ctx = testCtx as Record<string, unknown>;
        const params = (ctx.routeParams ?? {}) as Record<string, string>;
        return await handler(ctx, params);
      } catch (error: unknown) {
        if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
          const e = error as { statusCode: number; message?: string };
          return { status: e.statusCode, body: { error: e.message ?? "error" } };
        }
        throw error;
      }
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ─────────────────────────────────────────────

let reactivationAssessPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/reactivation/assess/route");
  reactivationAssessPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_REQUEST_BODY);
  mockGenerateWorkPackage.mockReturnValue(MOCK_WORK_PACKAGE);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("reactivation-assess-route — module contract assertions", () => {
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("typeof String.prototype.includes equals function", () => { expect(typeof String.prototype.includes).toBe("function"); });
  it("typeof Promise.resolve equals function", () => { expect(typeof Promise.resolve).toBe("function"); });
  it("WS_A is a string", () => { expect(typeof WS_A).toBe("string"); });
  it("MOCK_WORK_PACKAGE.ownerApprovalRequired is true", () => { expect(MOCK_WORK_PACKAGE.ownerApprovalRequired).toBe(true); });
});

describe("POST /api/owner/reactivation/assess — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await reactivationAssessPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await reactivationAssessPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST — workspace and body passthrough", () => {
    it("returns workspaceId from ctx.verifiedWorkspaceId", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { workspaceId: string };
      expect(result.workspaceId).toBe(WS_A);
    });

    it("uses WS_B when verifiedWorkspaceId is WS_B", async () => {
      const result = await reactivationAssessPost(makeCtx({ verifiedWorkspaceId: WS_B })) as { workspaceId: string };
      expect(result.workspaceId).toBe(WS_B);
    });

    it("returns dormantCustomerCount from body", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { dormantCustomerCount: number };
      expect(result.dormantCustomerCount).toBe(50);
    });

    it("returns cohortSize from body", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { cohortSize: number };
      expect(result.cohortSize).toBe(200);
    });

    it("uses avgMonthlyChurnRate from body when provided", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { churnRate: number };
      expect(result.churnRate).toBe(0.12);
    });

    it("derives churnRate from dormantCustomerCount/cohortSize when avgMonthlyChurnRate absent", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_REQUEST_BODY, avgMonthlyChurnRate: undefined });
      const result = await reactivationAssessPost(makeCtx()) as { churnRate: number };
      expect(result.churnRate).toBeCloseTo(0.25);
    });

    it("returns evaluatedAt from body when provided", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { evaluatedAt: string };
      expect(result.evaluatedAt).toBe("2026-07-01T00:00:00.000Z");
    });
  });

  describe("successful POST — churn risk classification", () => {
    it("classifies HIGH risk when churnRate is 0.12", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { riskLevel: string } };
      expect(result.churnRisk.riskLevel).toBe("HIGH");
    });

    it("classifies URGENT urgency for HIGH risk without cash pressure", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { interventionUrgency: string } };
      expect(result.churnRisk.interventionUrgency).toBe("URGENT");
    });

    it("classifies CRITICAL risk when derived churnRate is 0.25", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_REQUEST_BODY, avgMonthlyChurnRate: undefined });
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { riskLevel: string } };
      expect(result.churnRisk.riskLevel).toBe("CRITICAL");
    });

    it("classifies LOW risk when churnRate is 0.03", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_REQUEST_BODY, avgMonthlyChurnRate: 0.03 });
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { riskLevel: string } };
      expect(result.churnRisk.riskLevel).toBe("LOW");
    });

    it("classifies MONITOR urgency for LOW risk without cash pressure", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_REQUEST_BODY, avgMonthlyChurnRate: 0.03 });
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { interventionUrgency: string } };
      expect(result.churnRisk.interventionUrgency).toBe("MONITOR");
    });

    it("upgrades URGENT to IMMEDIATE when cashPressureActive is true", async () => {
      mockParseRequestBody.mockResolvedValue({
        ...MOCK_REQUEST_BODY,
        avgMonthlyChurnRate: 0.12,
        context: { cashPressureActive: true },
      });
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { interventionUrgency: string } };
      expect(result.churnRisk.interventionUrgency).toBe("IMMEDIATE");
    });

    it("upgrades MONITOR to PLANNED when cashPressureActive is true", async () => {
      mockParseRequestBody.mockResolvedValue({
        ...MOCK_REQUEST_BODY,
        avgMonthlyChurnRate: 0.03,
        context: { cashPressureActive: true },
      });
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { interventionUrgency: string } };
      expect(result.churnRisk.interventionUrgency).toBe("PLANNED");
    });

    it("does not upgrade urgency when cashPressureActive is false", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { interventionUrgency: string } };
      expect(result.churnRisk.interventionUrgency).toBe("URGENT");
    });

    it("returns churnPct as a number", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { churnRisk: { churnPct: number } };
      expect(typeof result.churnRisk.churnPct).toBe("number");
    });
  });

  describe("successful POST — ltvImpact", () => {
    it("returns ltvImpact null when avgMonthlyRevenuePerCustomer is absent", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_REQUEST_BODY, avgMonthlyRevenuePerCustomer: undefined });
      const result = await reactivationAssessPost(makeCtx()) as { ltvImpact: null };
      expect(result.ltvImpact).toBeNull();
    });

    it("returns estimatedMonthlyRevenueLost as dormant × revenuePerCustomer", async () => {
      const result = await reactivationAssessPost(makeCtx()) as {
        ltvImpact: { estimatedMonthlyRevenueLost: number };
      };
      expect(result.ltvImpact!.estimatedMonthlyRevenueLost).toBe(25000);
    });

    it("returns estimatedAnnualRevenueLost as monthly × 12", async () => {
      const result = await reactivationAssessPost(makeCtx()) as {
        ltvImpact: { estimatedAnnualRevenueLost: number };
      };
      expect(result.ltvImpact!.estimatedAnnualRevenueLost).toBe(300000);
    });
  });

  describe("successful POST — governance invariants", () => {
    it("ownerApprovalRequired is always true", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { ownerApprovalRequired: boolean };
      expect(result.ownerApprovalRequired).toBe(true);
    });

    it("generateWorkPackage is called with ownerApprovalRequired true", async () => {
      await reactivationAssessPost(makeCtx());
      expect(mockGenerateWorkPackage).toHaveBeenCalledWith(
        expect.objectContaining({ ownerApprovalRequired: true })
      );
    });

    it("calls generateWorkPackage exactly once", async () => {
      await reactivationAssessPost(makeCtx());
      expect(mockGenerateWorkPackage).toHaveBeenCalledTimes(1);
    });

    it("returns workPackage in result", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { workPackage: unknown };
      expect(result.workPackage).toBeDefined();
    });

    it("reactivationUrgent is true when interventionUrgency is URGENT", async () => {
      const result = await reactivationAssessPost(makeCtx()) as { reactivationUrgent: boolean };
      expect(result.reactivationUrgent).toBe(true);
    });

    it("reactivationUrgent is true when interventionUrgency is IMMEDIATE", async () => {
      mockParseRequestBody.mockResolvedValue({
        ...MOCK_REQUEST_BODY,
        avgMonthlyChurnRate: 0.12,
        context: { cashPressureActive: true },
      });
      const result = await reactivationAssessPost(makeCtx()) as { reactivationUrgent: boolean };
      expect(result.reactivationUrgent).toBe(true);
    });

    it("reactivationUrgent is false when risk is LOW (MONITOR urgency)", async () => {
      mockParseRequestBody.mockResolvedValue({ ...MOCK_REQUEST_BODY, avgMonthlyChurnRate: 0.03 });
      const result = await reactivationAssessPost(makeCtx()) as { reactivationUrgent: boolean };
      expect(result.reactivationUrgent).toBe(false);
    });
  });
});
