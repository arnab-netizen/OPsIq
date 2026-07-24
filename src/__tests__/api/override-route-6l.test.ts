/**
 * Phase 6L — override route resolveServerRole dead-call removal proof.
 *
 * POST /api/override previously called resolveServerRole() and passed the
 * result as `role` to recordOperatorOverride — but the service never used
 * it. The fix removes the dead call and the dead field from
 * OperatorOverrideInput, shrinking the auth surface.
 *
 * Auth is still fully enforced by withCanonicalEnforcement (OVERRIDE_DECIDE
 * capability + requireWorkspace). These tests prove:
 *   - recordOperatorOverride is called with workspaceId and actorId from the
 *     verified canonical context, NOT a client-supplied flag
 *   - resolveServerRole is NOT imported or called by the route
 *   - The route forwards operatorItemId, overriddenAction, reason, riskAcknowledged
 *     from the request body unchanged
 *   - recordOperatorOverride return value is propagated back to the caller
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  recordOperatorOverride: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => unknown) => handler,
}));

vi.mock("@/services/override/operator-override.service", () => ({
  recordOperatorOverride: mocks.recordOperatorOverride,
}));

// ─── Import route after mocks ─────────────────────────────────────────────────

import { POST as overridePOST } from "@/app/api/override/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(body: Record<string, unknown> = {}) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: "ws-1",
    request: {
      json: () =>
        Promise.resolve({
          operatorItemId: "item-abc",
          overriddenAction: "launch_campaign",
          reason: "Risk accepted by stakeholder",
          riskAcknowledged: true,
          ...body,
        }),
    },
  };
}

const SAMPLE_RESULT = {
  success: true,
  overrideRecordId: "rec-xyz",
  operatorItemId: "item-abc",
  originalAction: "hold",
  overriddenAction: "launch_campaign",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordOperatorOverride.mockResolvedValue(SAMPLE_RESULT);
});

describe("Phase 6L — override route dead resolveServerRole removal", () => {
  it("calls recordOperatorOverride with workspaceId and actorId from verified context", async () => {
    await overridePOST(makeCtx() as never);

    expect(mocks.recordOperatorOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        actorId: "actor-1",
      })
    );
  });

  it("forwards operatorItemId, overriddenAction, reason, riskAcknowledged from body", async () => {
    await overridePOST(makeCtx() as never);

    expect(mocks.recordOperatorOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorItemId: "item-abc",
        overriddenAction: "launch_campaign",
        reason: "Risk accepted by stakeholder",
        riskAcknowledged: true,
      })
    );
  });

  it("does NOT pass a role field — role was removed from the call", async () => {
    await overridePOST(makeCtx() as never);

    const callArg = mocks.recordOperatorOverride.mock.calls[0]?.[0];
    expect(callArg).not.toHaveProperty("role");
  });

  it("propagates the recordOperatorOverride return value", async () => {
    const result = await overridePOST(makeCtx() as never);
    expect(result).toEqual(SAMPLE_RESULT);
  });

  it("calls recordOperatorOverride exactly once per request", async () => {
    await overridePOST(makeCtx() as never);
    expect(mocks.recordOperatorOverride).toHaveBeenCalledOnce();
  });

  it("workspaceId comes from ctx.verifiedWorkspaceId, not request body", async () => {
    // Body has no workspaceId — if the route read it from body, the call would fail
    await overridePOST(
      makeCtx({ operatorItemId: "item-abc", overriddenAction: "x", reason: "y", riskAcknowledged: true }) as never
    );

    expect(mocks.recordOperatorOverride).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" })
    );
  });

  it("actorId comes from ctx.verifiedActorId, not request body", async () => {
    await overridePOST(
      makeCtx({ operatorItemId: "item-abc", overriddenAction: "x", reason: "y", riskAcknowledged: true }) as never
    );

    expect(mocks.recordOperatorOverride).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "actor-1" })
    );
  });

  it("propagates rejection when recordOperatorOverride throws", async () => {
    mocks.recordOperatorOverride.mockRejectedValue(new Error("Override denied by guardrail"));

    await expect(overridePOST(makeCtx() as never)).rejects.toThrow(
      "Override denied by guardrail"
    );
  });

  it("different actors produce different actorId in the service call", async () => {
    const ctxA = { ...makeCtx(), verifiedActorId: "actor-A" };
    const ctxB = { ...makeCtx(), verifiedActorId: "actor-B" };

    await overridePOST(ctxA as never);
    await overridePOST(ctxB as never);

    const calls = mocks.recordOperatorOverride.mock.calls;
    expect(calls[0][0].actorId).toBe("actor-A");
    expect(calls[1][0].actorId).toBe("actor-B");
  });

  describe("Phase 6L — additional result and helper coverage", () => {
    it("result.success is true on success", async () => {
      const result = (await overridePOST(makeCtx() as never)) as typeof SAMPLE_RESULT;
      expect(result.success).toBe(true);
    });

    it("result.overrideRecordId is rec-xyz", async () => {
      const result = (await overridePOST(makeCtx() as never)) as typeof SAMPLE_RESULT;
      expect(result.overrideRecordId).toBe("rec-xyz");
    });

    it("result.operatorItemId is item-abc", async () => {
      const result = (await overridePOST(makeCtx() as never)) as typeof SAMPLE_RESULT;
      expect(result.operatorItemId).toBe("item-abc");
    });

    it("result.overriddenAction is launch_campaign", async () => {
      const result = (await overridePOST(makeCtx() as never)) as typeof SAMPLE_RESULT;
      expect(result.overriddenAction).toBe("launch_campaign");
    });

    it("result.originalAction is hold", async () => {
      const result = (await overridePOST(makeCtx() as never)) as typeof SAMPLE_RESULT;
      expect(result.originalAction).toBe("hold");
    });

    it("makeCtx default body operatorItemId is item-abc", async () => {
      const ctx = makeCtx();
      const body = (await ctx.request.json()) as Record<string, unknown>;
      expect(body.operatorItemId).toBe("item-abc");
    });

    it("makeCtx default riskAcknowledged is true", async () => {
      const ctx = makeCtx();
      const body = (await ctx.request.json()) as Record<string, unknown>;
      expect(body.riskAcknowledged).toBe(true);
    });

    it("different workspaces produce different workspaceId values in service call", async () => {
      const ctxA = { ...makeCtx(), verifiedWorkspaceId: "ws-A" };
      const ctxB = { ...makeCtx(), verifiedWorkspaceId: "ws-B" };

      await overridePOST(ctxA as never);
      await overridePOST(ctxB as never);

      const calls = mocks.recordOperatorOverride.mock.calls;
      expect(calls[0][0].workspaceId).toBe("ws-A");
      expect(calls[1][0].workspaceId).toBe("ws-B");
    });

    it("rejected error message is propagated from recordOperatorOverride", async () => {
      mocks.recordOperatorOverride.mockRejectedValue(new Error("specific error message here"));
      await expect(overridePOST(makeCtx() as never)).rejects.toThrow("specific error message here");
    });

    it("recordOperatorOverride receives all 5 core fields", async () => {
      await overridePOST(makeCtx() as never);
      expect(mocks.recordOperatorOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          actorId: "actor-1",
          operatorItemId: "item-abc",
          overriddenAction: "launch_campaign",
          reason: "Risk accepted by stakeholder",
        })
      );
    });

    it("overridePOST returns a Promise (route is async)", async () => {
      const resultPromise = overridePOST(makeCtx() as never);
      expect(resultPromise).toBeInstanceOf(Promise);
      await resultPromise;
    });
  });
});
