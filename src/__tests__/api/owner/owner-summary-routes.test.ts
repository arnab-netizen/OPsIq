/**
 * GET /api/owner/home and GET /api/owner/command-center — non-DB route contract tests.
 *
 * Both routes follow the same structure:
 *   - OWNER_VIEW + requireWorkspace via withCanonicalEnforcement
 *   - Parse optional `businessId` from query string
 *   - Delegate entirely to a DB-backed service (workspaceId, businessId)
 *   - Return service result directly (no canonicalJson wrapper)
 *
 * DB-backed services are mocked; tests run without PostgreSQL.
 * Real DB proof is covered by the respective .db.test.ts suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getOwnerHome: vi.fn(),
  getBusinessCondition: vi.fn(),
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

vi.mock("@/services/owner-home/home.service", () => ({
  getOwnerHome: mocks.getOwnerHome,
}));

vi.mock("@/services/owner-condition/business-condition.service", () => ({
  getBusinessCondition: mocks.getBusinessCondition,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { GET as homeGet } from "@/app/api/owner/home/route";
import { GET as commandCenterGet } from "@/app/api/owner/command-center/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-summary-test";

function makeCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-summary-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

const SAMPLE_HOME = {
  workspaceId: WS,
  businessHealth: "CAUTION",
  cashDanger: false,
  salesDanger: false,
  operationsDanger: true,
  executionDanger: false,
  topRisks: [],
  topOpportunities: [],
  requiredActionsToday: [],
  lastVerifiedImprovement: null,
};

const SAMPLE_CONDITION = {
  workspaceId: WS,
  overallScore: 62,
  classification: "CAUTION",
  topNextAction: null,
  domains: [],
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. Static enforcement — GET /api/owner/home ─────────────────────────────

describe("[home] GET /api/owner/home — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/home/route.ts"),
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

  it("uses ctx.verifiedWorkspaceId for the service call (never a query param)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).not.toContain("request.workspaceId");
  });

  it("exports GET only (no POST/PATCH/DELETE)", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });

  it("calls getOwnerHome (the service delegation)", () => {
    expect(src).toContain("getOwnerHome");
  });
});

// ─── 2. GET /api/owner/home — handler behaviour ──────────────────────────────

describe("[home] GET /api/owner/home — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (homeGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns the service result directly", async () => {
    mocks.getOwnerHome.mockResolvedValue(SAMPLE_HOME);
    const res = await homeGet(makeCtx(`https://x/api/owner/home`));
    expect(res).toEqual(SAMPLE_HOME);
  });

  it("calls getOwnerHome with the verified workspace ID", async () => {
    mocks.getOwnerHome.mockResolvedValue(SAMPLE_HOME);
    await homeGet(makeCtx(`https://x/api/owner/home`, "ws-SPECIFIC"));
    expect(mocks.getOwnerHome.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string when present", async () => {
    mocks.getOwnerHome.mockResolvedValue(SAMPLE_HOME);
    await homeGet(makeCtx(`https://x/api/owner/home?businessId=biz-42`));
    expect(mocks.getOwnerHome.mock.calls[0][1]).toBe("biz-42");
  });

  it("passes null businessId when query param is absent", async () => {
    mocks.getOwnerHome.mockResolvedValue(SAMPLE_HOME);
    await homeGet(makeCtx(`https://x/api/owner/home`));
    expect(mocks.getOwnerHome.mock.calls[0][1]).toBeNull();
  });

  it("workspace isolation: verifiedWorkspaceId passed to service, not any URL param", async () => {
    mocks.getOwnerHome.mockResolvedValue(SAMPLE_HOME);
    await homeGet(makeCtx(`https://x/api/owner/home?workspaceId=ws-ATTACKER`, "ws-REAL"));
    expect(mocks.getOwnerHome.mock.calls[0][0]).toBe("ws-REAL");
    expect(mocks.getOwnerHome.mock.calls[0][0]).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces receive correct scoping", async () => {
    mocks.getOwnerHome.mockResolvedValue(SAMPLE_HOME);
    await homeGet(makeCtx(`https://x/api/owner/home`, "ws-ALICE"));
    await homeGet(makeCtx(`https://x/api/owner/home`, "ws-BOB"));
    expect(mocks.getOwnerHome.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getOwnerHome.mock.calls[1][0]).toBe("ws-BOB");
  });

  it("propagates service result shape unchanged", async () => {
    const detailed = { ...SAMPLE_HOME, businessHealth: "CRITICAL", cashDanger: true };
    mocks.getOwnerHome.mockResolvedValue(detailed);
    const res = await homeGet(makeCtx(`https://x/api/owner/home`));
    expect((res as typeof detailed).businessHealth).toBe("CRITICAL");
    expect((res as typeof detailed).cashDanger).toBe(true);
  });
});

// ─── 3. Static enforcement — GET /api/owner/command-center ───────────────────

describe("[command-center] GET /api/owner/command-center — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/command-center/route.ts"),
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

  it("uses ctx.verifiedWorkspaceId for the service call", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });

  it("exports GET only (no POST/PATCH/DELETE)", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });

  it("calls getBusinessCondition (the service delegation)", () => {
    expect(src).toContain("getBusinessCondition");
  });
});

// ─── 4. GET /api/owner/command-center — handler behaviour ────────────────────

describe("[command-center] GET /api/owner/command-center — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (commandCenterGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns the service result directly", async () => {
    mocks.getBusinessCondition.mockResolvedValue(SAMPLE_CONDITION);
    const res = await commandCenterGet(makeCtx(`https://x/api/owner/command-center`));
    expect(res).toEqual(SAMPLE_CONDITION);
  });

  it("calls getBusinessCondition with the verified workspace ID", async () => {
    mocks.getBusinessCondition.mockResolvedValue(SAMPLE_CONDITION);
    await commandCenterGet(makeCtx(`https://x/api/owner/command-center`, "ws-SPECIFIC"));
    expect(mocks.getBusinessCondition.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string when present", async () => {
    mocks.getBusinessCondition.mockResolvedValue(SAMPLE_CONDITION);
    await commandCenterGet(makeCtx(`https://x/api/owner/command-center?businessId=biz-99`));
    expect(mocks.getBusinessCondition.mock.calls[0][1]).toBe("biz-99");
  });

  it("passes null businessId when query param is absent", async () => {
    mocks.getBusinessCondition.mockResolvedValue(SAMPLE_CONDITION);
    await commandCenterGet(makeCtx(`https://x/api/owner/command-center`));
    expect(mocks.getBusinessCondition.mock.calls[0][1]).toBeNull();
  });

  it("workspace isolation: verifiedWorkspaceId passed to service, not any URL param", async () => {
    mocks.getBusinessCondition.mockResolvedValue(SAMPLE_CONDITION);
    await commandCenterGet(
      makeCtx(`https://x/api/owner/command-center?workspaceId=ws-ATTACKER`, "ws-REAL")
    );
    expect(mocks.getBusinessCondition.mock.calls[0][0]).toBe("ws-REAL");
    expect(mocks.getBusinessCondition.mock.calls[0][0]).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces receive correct scoping", async () => {
    mocks.getBusinessCondition.mockResolvedValue(SAMPLE_CONDITION);
    await commandCenterGet(makeCtx(`https://x/api/owner/command-center`, "ws-ALICE"));
    await commandCenterGet(makeCtx(`https://x/api/owner/command-center`, "ws-BOB"));
    expect(mocks.getBusinessCondition.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getBusinessCondition.mock.calls[1][0]).toBe("ws-BOB");
  });

  it("returns classification and domain scores from service", async () => {
    const detailed = { ...SAMPLE_CONDITION, classification: "CRITICAL", overallScore: 28 };
    mocks.getBusinessCondition.mockResolvedValue(detailed);
    const res = await commandCenterGet(makeCtx(`https://x/api/owner/command-center`));
    expect((res as typeof detailed).classification).toBe("CRITICAL");
    expect((res as typeof detailed).overallScore).toBe(28);
  });
});
