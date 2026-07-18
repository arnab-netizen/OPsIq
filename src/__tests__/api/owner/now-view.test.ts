/**
 * Module 41 — GET /api/owner/now-view route contract.
 *
 * Proves the Owner Now View route delegates to the live guidance service, is
 * strictly scoped to the verified workspace (never a client-supplied one), declares
 * OWNER_VIEW + requireWorkspace, parses businessId, and performs no mutation.
 *
 * withCanonicalEnforcement is mocked to a pass-through capturing the enforcement
 * options; the service is mocked so the route is exercised DB-free (real DB +
 * isolation is covered by the [db] service suite).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getOwnerNowView: vi.fn() }));

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

vi.mock("@/services/owner-guidance/owner-now-view.service", () => ({
  getOwnerNowView: mocks.getOwnerNowView,
}));

import { GET } from "@/app/api/owner/now-view/route";

function makeCtx(rawUrl: string, workspaceId = "ws-1") {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

const DERIVED_BC_SAMPLE = {
  cashPressureLevel: "CRITICAL",
  marginPressureLevel: "HIGH",
  clientConcentrationRisk: "MEDIUM",
  ownerDependencyRisk: "HIGH",
  keyPersonDependencyRisk: "MEDIUM",
  processMaturityLevel: "LOW",
  managementMaturityLevel: "LOW",
  executionCapacityLevel: "CRITICAL",
  moralFragilityLevel: "HIGH",
  resilienceLevel: "LOW",
  growthReadinessLevel: "BLOCKED",
};

const sample = {
  view: { workspaceId: "ws-1", classification: "GUIDANCE_READY", topOwnerActions: [], actionsToAvoid: [], confidenceCapped: false },
  whatChanged: [],
  beginnerExplanation: { whatToDoFirst: [], whatNotToDo: [] },
  stepByStep: [],
  generatedFromLiveData: true,
  derivedBusinessCondition: DERIVED_BC_SAMPLE,
};

beforeEach(() => vi.clearAllMocks());

describe("[module41] GET /api/owner/now-view", () => {
  it("declares OWNER_VIEW capability and requires a workspace", () => {
    const options = (GET as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options).toBeDefined();
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });

  it("returns the live guidance payload from the service", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(res.view.classification).toBe("GUIDANCE_READY");
    expect(res.generatedFromLiveData).toBe(true);
    expect(mocks.getOwnerNowView).toHaveBeenCalledTimes(1);
  });

  it("scopes to the verified workspace only (ignores client-supplied workspace)", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view?workspaceId=ws-ATTACKER&businessId=biz-9", "ws-REAL"));
    const [workspaceArg, businessArg] = mocks.getOwnerNowView.mock.calls[0];
    expect(workspaceArg).toBe("ws-REAL");
    expect(workspaceArg).not.toBe("ws-ATTACKER");
    expect(businessArg).toBe("biz-9");
  });

  it("passes null businessId when none supplied", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view", "ws-1"));
    expect(mocks.getOwnerNowView.mock.calls[0][1]).toBeNull();
  });

  it("serializes derivedBusinessCondition with all 11 canonical fields", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(res.derivedBusinessCondition).toBeDefined();
    const bc = res.derivedBusinessCondition!;
    const VALID_LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL", "BLOCKED", "unknown"]);
    const fields = [
      "cashPressureLevel", "marginPressureLevel", "clientConcentrationRisk",
      "ownerDependencyRisk", "keyPersonDependencyRisk", "processMaturityLevel",
      "managementMaturityLevel", "executionCapacityLevel", "moralFragilityLevel",
      "resilienceLevel", "growthReadinessLevel",
    ] as const;
    for (const f of fields) {
      expect(bc).toHaveProperty(f);
      expect(VALID_LEVELS.has(bc[f as keyof typeof bc] as string)).toBe(true);
    }
    expect(bc.cashPressureLevel).toBe("CRITICAL");
    expect(bc.growthReadinessLevel).toBe("BLOCKED");
  });

  it("serializes null derivedBusinessCondition without crashing", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ ...sample, derivedBusinessCondition: null });
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as { derivedBusinessCondition: null };
    expect(res.derivedBusinessCondition).toBeNull();
  });
});
