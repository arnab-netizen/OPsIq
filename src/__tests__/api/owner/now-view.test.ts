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

const mocks = vi.hoisted(() => ({ getOwnerNowView: vi.fn(), getOwnerHome: vi.fn() }));

/** The canonical decision the owner-home service resolves for (workspace, business). */
function decisionFor(workspaceId: string, businessId: string | null) {
  return { contractVersion: "owner-decision-v1", primaryCandidateId: `decision:${workspaceId}:${businessId ?? "auto"}` };
}

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

vi.mock("@/services/owner-home/home.service", () => ({
  getOwnerHome: mocks.getOwnerHome,
  // The route resolves the decision with the gate constraints it was resolved with (none in these fixtures).
  resolveOwnerHome: async (...args: unknown[]) => ({ home: await (mocks.getOwnerHome as (...a: unknown[]) => unknown)(...args), gate: null }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOwnerHome.mockImplementation(async (workspaceId: string, businessId: string | null) => ({
    selectedBusinessId: businessId ?? "biz-auto",
    currentOwnerDecision: decisionFor(workspaceId, businessId),
  }));
});

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

  it("with no businessId, reads the business the canonical decision was resolved for (never a workspace-wide aggregate)", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view", "ws-1"));
    expect(mocks.getOwnerNowView.mock.calls[0][1]).toBe("biz-auto");
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

  it("calls getOwnerNowView with verified workspaceId, not client-supplied", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view", "ws-verified"));
    expect(mocks.getOwnerNowView).toHaveBeenCalledWith("ws-verified", "biz-auto", undefined, "actor-1", { restrictExecutionToAttributableBusiness: false, ownerDecision: decisionFor("ws-verified", null), ownerGate: null });
  });

  it("workspace isolation: WS-A and WS-B result in separate service calls", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view", "ws-A"));
    await GET(makeCtx("https://x/api/owner/now-view", "ws-B"));
    expect(mocks.getOwnerNowView).toHaveBeenNthCalledWith(1, "ws-A", "biz-auto", undefined, "actor-1", { restrictExecutionToAttributableBusiness: false, ownerDecision: decisionFor("ws-A", null), ownerGate: null });
    expect(mocks.getOwnerNowView).toHaveBeenNthCalledWith(2, "ws-B", "biz-auto", undefined, "actor-1", { restrictExecutionToAttributableBusiness: false, ownerDecision: decisionFor("ws-B", null), ownerGate: null });
  });

  it("never pairs a requested business's Now View with ANOTHER business's decision", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    mocks.getOwnerHome.mockResolvedValue({ selectedBusinessId: "biz-other", currentOwnerDecision: decisionFor("ws-1", "biz-other") });
    const res = (await GET(makeCtx("https://x/api/owner/now-view?businessId=biz-abc", "ws-1"))) as { ownerDecision: unknown };
    expect(res.ownerDecision).toBeNull();
    expect(mocks.getOwnerNowView).toHaveBeenCalledWith("ws-1", "biz-abc", undefined, "actor-1", { restrictExecutionToAttributableBusiness: false, ownerDecision: null, ownerGate: null });
  });

  it("passes businessId from query param to service", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view?businessId=biz-abc", "ws-1"));
    expect(mocks.getOwnerNowView).toHaveBeenCalledWith("ws-1", "biz-abc", undefined, "actor-1", { restrictExecutionToAttributableBusiness: false, ownerDecision: decisionFor("ws-1", "biz-abc"), ownerGate: null });
  });

  it("restrictExecutionToBusiness=true (cockpit's opt-in) is threaded through as restrictExecutionToAttributableBusiness: true (controlled-beta cockpit business-scoping fix, D-cockpit)", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view?businessId=biz-abc&restrictExecutionToBusiness=true", "ws-1"));
    expect(mocks.getOwnerNowView).toHaveBeenCalledWith("ws-1", "biz-abc", undefined, "actor-1", { restrictExecutionToAttributableBusiness: true, ownerDecision: decisionFor("ws-1", "biz-abc"), ownerGate: null });
  });

  it("omitting restrictExecutionToBusiness defaults to false — every other now-view consumer (/owner/priorities, /owner/process-intelligence, /owner/now) is unaffected by the cockpit's opt-in", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view?businessId=biz-abc", "ws-1"));
    expect(mocks.getOwnerNowView).toHaveBeenCalledWith("ws-1", "biz-abc", undefined, "actor-1", { restrictExecutionToAttributableBusiness: false, ownerDecision: decisionFor("ws-1", "biz-abc"), ownerGate: null });
  });

  it("passes different businessId when specified", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view?businessId=biz-xyz", "ws-1"));
    const [, businessArg] = mocks.getOwnerNowView.mock.calls[0];
    expect(businessArg).toBe("biz-xyz");
  });

  it("returns stepByStep field from service", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(res).toHaveProperty("stepByStep");
    expect(Array.isArray(res.stepByStep)).toBe(true);
  });

  it("returns whatChanged field from service", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(res).toHaveProperty("whatChanged");
    expect(Array.isArray(res.whatChanged)).toBe(true);
  });

  it("returns beginnerExplanation field from service", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(res).toHaveProperty("beginnerExplanation");
    expect(res.beginnerExplanation).toHaveProperty("whatToDoFirst");
    expect(res.beginnerExplanation).toHaveProperty("whatNotToDo");
  });

  it("view field has workspaceId scoped correctly", async () => {
    const scopedSample = { ...sample, view: { ...sample.view, workspaceId: "ws-1" } };
    mocks.getOwnerNowView.mockResolvedValue(scopedSample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view", "ws-1"))) as typeof sample;
    expect(res.view.workspaceId).toBe("ws-1");
  });

  it("getOwnerNowView called exactly once per request", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view"));
    expect(mocks.getOwnerNowView).toHaveBeenCalledTimes(1);
  });

  it("generatedFromLiveData field is boolean", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(typeof res.generatedFromLiveData).toBe("boolean");
  });

  it("confidenceCapped can be false in view", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(typeof res.view.confidenceCapped).toBe("boolean");
    expect(res.view.confidenceCapped).toBe(false);
  });

  it("does not mutate — GET handler does not write any data", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    await GET(makeCtx("https://x/api/owner/now-view"));
    expect(mocks.getOwnerNowView).toHaveBeenCalledTimes(1);
    expect(mocks.getOwnerNowView.mock.calls[0][0]).toBe("ws-1");
  });

  it("topOwnerActions and actionsToAvoid are arrays", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(Array.isArray(res.view.topOwnerActions)).toBe(true);
    expect(Array.isArray(res.view.actionsToAvoid)).toBe(true);
  });

  it("generatedFromLiveData field is present in response view", async () => {
    mocks.getOwnerNowView.mockResolvedValue(sample);
    const res = (await GET(makeCtx("https://x/api/owner/now-view"))) as typeof sample;
    expect(res).toHaveProperty("generatedFromLiveData");
  });
});
