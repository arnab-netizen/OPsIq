/**
 * Operating Policy API routes — non-DB route contract tests (Phase 7).
 *
 * Covers all 4 route files under /api/owner/policies:
 *   GET  /api/owner/policies                                 — list policies
 *   GET  /api/owner/policies/:policyKey                      — get policy
 *   PATCH /api/owner/policies/:policyKey                     — update policy threshold/flags
 *   POST /api/owner/policies/:policyId/overrides             — create time-limited owner override
 *   DELETE /api/owner/policies/:policyId/overrides/:id       — revoke active override
 *
 * DB-backed services are mocked; tests run without PostgreSQL.
 * Full DB proof is covered by operating-policy.db.test.ts.
 *
 * Static enforcement checks prove source-level invariants:
 * - withCanonicalEnforcement on every handler
 * - OWNER_VIEW / OWNER_MANAGE capability gating
 * - requireWorkspace on every handler
 * - ctx.verifiedWorkspaceId used for all DB calls (never a body/params field)
 * - audit events emitted by the service (not the route — tested in DB suite)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks (must precede all imports that load the routes) ────────────

const mocks = vi.hoisted(() => ({
  listPolicies: vi.fn(),
  getPolicy: vi.fn(),
  updatePolicy: vi.fn(),
  createOverride: vi.fn(),
  revokeOverride: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown, params: Record<string, string> = {}) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/services/governance/operating-policy.service", () => ({
  listPolicies: mocks.listPolicies,
  getPolicy: mocks.getPolicy,
  updatePolicy: mocks.updatePolicy,
  createOverride: mocks.createOverride,
  revokeOverride: mocks.revokeOverride,
}));

// ─── Route imports (after mocks are registered) ───────────────────────────────

import { GET as listGet } from "@/app/api/owner/policies/route";
import { GET as policyGet, PATCH as policyPatch } from "@/app/api/owner/policies/[policyKey]/route";
import { POST as overridePost } from "@/app/api/owner/policies/[policyId]/overrides/route";
import { DELETE as overrideDelete } from "@/app/api/owner/policies/[policyId]/overrides/[overrideId]/route";
import { NotFoundError } from "@/infra/errors";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-policies-test";
const ACTOR = "actor-pol-1";

const SAMPLE_POLICY = {
  id: "pol-id-1",
  workspaceId: WS,
  policyKey: "high_cost_low_payback",
  category: "COST_CONTROL",
  description: "Warn/block high payback expenditures",
  threshold: 6,
  thresholdUnit: "MONTHS",
  hardBlock: false,
  overrideAuthorityRole: "OWNER",
  overrideReasonRequired: true,
  expiryAfterOverrideMinutes: 1440,
  isActive: true,
  createdBy: ACTOR,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const SAMPLE_POLICIES = [SAMPLE_POLICY, { ...SAMPLE_POLICY, id: "pol-id-2", policyKey: "growth_before_capacity" }];

function makeCtx(body: Record<string, unknown> = {}, workspaceId = WS) {
  return {
    verifiedActorId: ACTOR,
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/policies",
      json: async () => body,
    },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());

// ─── 1. Static enforcement — GET /api/owner/policies ─────────────────────────

describe("[policies] GET /api/owner/policies — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/policies/route.ts"),
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

  it("uses ctx.verifiedWorkspaceId (never a body field)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });

  it("exports GET handler only (no POST/PATCH/DELETE)", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });
});

// ─── 2. Static enforcement — GET + PATCH /api/owner/policies/:policyKey ──────

describe("[policies] GET+PATCH /api/owner/policies/:policyKey — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/policies/[policyKey]/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_VIEW for GET and OWNER_MANAGE for PATCH", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace on both handlers", () => {
    expect((src.match(/requireWorkspace: true/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("uses ctx.verifiedWorkspaceId for DB calls (not params.workspaceId)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).not.toContain("params.workspaceId");
  });

  it("exports GET and PATCH handlers only (no POST/DELETE)", () => {
    expect(src).toContain("export const GET");
    expect(src).toContain("export const PATCH");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const DELETE");
  });

  it("parses body via updatePolicySchema and parseRequestBody", () => {
    expect(src).toContain("parseRequestBody");
  });
});

// ─── 3. Static enforcement — POST /api/owner/policies/:policyId/overrides ────

describe("[policies] POST /api/owner/policies/:policyId/overrides — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/policies/[policyId]/overrides/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("uses ctx.verifiedWorkspaceId and ctx.verifiedActorId (not body fields)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).toContain("ctx.verifiedActorId");
  });

  it("exports POST only (no GET/PATCH/DELETE)", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const GET");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });

  it("validates reason and context via createOverrideSchema and parseRequestBody", () => {
    expect(src).toContain("parseRequestBody");
    expect(src).toContain("reason");
  });
});

// ─── 4. Static enforcement — DELETE .../overrides/:overrideId ────────────────

describe("[policies] DELETE /api/owner/policies/:policyId/overrides/:overrideId — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/policies/[policyId]/overrides/[overrideId]/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("uses ctx.verifiedWorkspaceId and ctx.verifiedActorId (not params fields)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).toContain("ctx.verifiedActorId");
  });

  it("exports DELETE only (no GET/POST/PATCH)", () => {
    expect(src).toContain("export const DELETE");
    expect(src).not.toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
  });
});

// ─── 5. GET /api/owner/policies — handler behaviour ─────────────────────────

describe("[policies] GET /api/owner/policies — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (listGet as unknown as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns policy list from service wrapped in policies key", async () => {
    mocks.listPolicies.mockResolvedValue(SAMPLE_POLICIES);
    const res = await listGet(makeCtx());
    const body = getBody(res);
    expect(body.policies).toHaveLength(2);
  });

  it("calls listPolicies with the verified workspace ID", async () => {
    mocks.listPolicies.mockResolvedValue(SAMPLE_POLICIES);
    await listGet(makeCtx({}, "ws-SPECIFIC"));
    expect(mocks.listPolicies).toHaveBeenCalledWith("ws-SPECIFIC");
  });

  it("workspace isolation: called once per workspace, args are scoped", async () => {
    mocks.listPolicies.mockResolvedValue([]);
    await listGet(makeCtx({}, "ws-ALICE"));
    await listGet(makeCtx({}, "ws-BOB"));
    expect(mocks.listPolicies.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.listPolicies.mock.calls[1][0]).toBe("ws-BOB");
    expect(mocks.listPolicies.mock.calls[0][0]).not.toBe(mocks.listPolicies.mock.calls[1][0]);
  });

  it("returns empty list without error when no policies exist", async () => {
    mocks.listPolicies.mockResolvedValue([]);
    const res = await listGet(makeCtx());
    const body = getBody(res);
    expect(body.policies).toEqual([]);
  });
});

// ─── 6. GET /api/owner/policies/:policyKey — handler behaviour ───────────────

describe("[policies] GET /api/owner/policies/:policyKey — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (policyGet as unknown as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns policy from service wrapped in policy key", async () => {
    mocks.getPolicy.mockResolvedValue(SAMPLE_POLICY);
    const res = await policyGet(makeCtx(), { policyKey: "high_cost_low_payback" });
    const body = getBody(res);
    expect((body.policy as typeof SAMPLE_POLICY).policyKey).toBe("high_cost_low_payback");
  });

  it("calls getPolicy with verified workspaceId and policyKey from params", async () => {
    mocks.getPolicy.mockResolvedValue(SAMPLE_POLICY);
    await policyGet(makeCtx({}, "ws-SPECIFIC"), { policyKey: "growth_before_capacity" });
    expect(mocks.getPolicy).toHaveBeenCalledWith("ws-SPECIFIC", "growth_before_capacity");
  });

  it("throws NotFoundError when service returns null (policy does not exist)", async () => {
    mocks.getPolicy.mockResolvedValue(null);
    await expect(policyGet(makeCtx(), { policyKey: "nonexistent_key" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("workspace isolation: policyKey from params, workspaceId from ctx only", async () => {
    mocks.getPolicy.mockResolvedValue(SAMPLE_POLICY);
    await policyGet(makeCtx({}, "ws-REAL"), { policyKey: "high_cost_low_payback" });
    const [wsArg, keyArg] = mocks.getPolicy.mock.calls[0];
    expect(wsArg).toBe("ws-REAL");
    expect(keyArg).toBe("high_cost_low_payback");
  });
});

// ─── 7. PATCH /api/owner/policies/:policyKey — handler behaviour ─────────────

describe("[policies] PATCH /api/owner/policies/:policyKey — handler", () => {
  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (policyPatch as unknown as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns updated policy wrapped in policy key", async () => {
    const updated = { ...SAMPLE_POLICY, threshold: 12 };
    mocks.updatePolicy.mockResolvedValue(updated);
    const res = await policyPatch(makeCtx({ threshold: 12 }), { policyKey: "high_cost_low_payback" });
    const body = getBody(res);
    expect((body.policy as typeof updated).threshold).toBe(12);
  });

  it("calls updatePolicy with verified workspaceId, policyKey, body, and actorId", async () => {
    mocks.updatePolicy.mockResolvedValue(SAMPLE_POLICY);
    await policyPatch(makeCtx({ hardBlock: true }, "ws-SPECIFIC"), { policyKey: "high_cost_low_payback" });
    expect(mocks.updatePolicy).toHaveBeenCalledWith(
      "ws-SPECIFIC",
      "high_cost_low_payback",
      { hardBlock: true },
      ACTOR
    );
  });

  it("rejects body with threshold of zero (must be positive)", async () => {
    await expect(
      policyPatch(makeCtx({ threshold: 0 }), { policyKey: "k" })
    ).rejects.toThrow();
  });

  it("rejects body with negative threshold", async () => {
    await expect(
      policyPatch(makeCtx({ threshold: -5 }), { policyKey: "k" })
    ).rejects.toThrow();
  });

  it("rejects body with unknown fields", async () => {
    await expect(
      policyPatch(makeCtx({ threshold: 8, unknownProp: "x" }), { policyKey: "k" })
    ).rejects.toThrow();
  });

  it("accepts body with all valid fields (threshold, hardBlock, isActive, expiryAfterOverrideMinutes)", async () => {
    mocks.updatePolicy.mockResolvedValue(SAMPLE_POLICY);
    await expect(
      policyPatch(
        makeCtx({ threshold: 9, hardBlock: true, isActive: false, expiryAfterOverrideMinutes: 720 }),
        { policyKey: "high_cost_low_payback" }
      )
    ).resolves.toBeDefined();
  });

  it("accepts null expiryAfterOverrideMinutes (clearing expiry)", async () => {
    mocks.updatePolicy.mockResolvedValue({ ...SAMPLE_POLICY, expiryAfterOverrideMinutes: null });
    await expect(
      policyPatch(makeCtx({ expiryAfterOverrideMinutes: null }), { policyKey: "high_cost_low_payback" })
    ).resolves.toBeDefined();
  });

  it("workspace isolation: workspaceId always from ctx, never from body", async () => {
    mocks.updatePolicy.mockResolvedValue(SAMPLE_POLICY);
    await policyPatch(makeCtx({ threshold: 8 }, "ws-REAL"), { policyKey: "high_cost_low_payback" });
    const [wsArg] = mocks.updatePolicy.mock.calls[0];
    expect(wsArg).toBe("ws-REAL");
  });
});

// ─── 8. POST /api/owner/policies/:policyId/overrides — handler behaviour ─────

describe("[policies] POST /api/owner/policies/:policyId/overrides — handler", () => {
  const VALID_REASON = "Cash constraint prevents standard payback timeline this quarter";

  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (overridePost as unknown as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns overrideId wrapped in overrideId key with status 201", async () => {
    mocks.createOverride.mockResolvedValue("override-uuid-1");
    const res = await overridePost(makeCtx({ reason: VALID_REASON }), { policyId: "pol-id-1" });
    const body = getBody(res);
    expect(body.overrideId).toBe("override-uuid-1");
    expect((res as CanonicalJsonResponse).status).toBe(201);
  });

  it("calls createOverride with policyId from params, workspaceId and actorId from ctx", async () => {
    mocks.createOverride.mockResolvedValue("override-uuid-2");
    await overridePost(makeCtx({ reason: VALID_REASON }, "ws-SPECIFIC"), { policyId: "pol-id-99" });
    expect(mocks.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        policyId: "pol-id-99",
        workspaceId: "ws-SPECIFIC",
        overriddenBy: ACTOR,
        reason: VALID_REASON,
      })
    );
  });

  it("rejects reason shorter than 10 characters", async () => {
    await expect(
      overridePost(makeCtx({ reason: "short" }), { policyId: "pol-id-1" })
    ).rejects.toThrow();
    expect(mocks.createOverride).not.toHaveBeenCalled();
  });

  it("rejects missing reason field", async () => {
    await expect(
      overridePost(makeCtx({ context: { note: "no reason" } }), { policyId: "pol-id-1" })
    ).rejects.toThrow();
    expect(mocks.createOverride).not.toHaveBeenCalled();
  });

  it("rejects reason exceeding 1000 characters", async () => {
    await expect(
      overridePost(makeCtx({ reason: "x".repeat(1001) }), { policyId: "pol-id-1" })
    ).rejects.toThrow();
    expect(mocks.createOverride).not.toHaveBeenCalled();
  });

  it("accepts valid reason with optional context record", async () => {
    mocks.createOverride.mockResolvedValue("override-with-ctx");
    await expect(
      overridePost(
        makeCtx({ reason: VALID_REASON, context: { approvedBy: "cfo", ticket: "FIN-123" } }),
        { policyId: "pol-id-1" }
      )
    ).resolves.toBeDefined();
  });

  it("rejects unknown body fields", async () => {
    await expect(
      overridePost(makeCtx({ reason: VALID_REASON, unauthorizedField: true }), { policyId: "pol-id-1" })
    ).rejects.toThrow();
  });

  it("workspace isolation: workspaceId always from ctx, policyId from params only", async () => {
    mocks.createOverride.mockResolvedValue("override-isolation");
    await overridePost(makeCtx({ reason: VALID_REASON }, "ws-ISOLATED"), { policyId: "pol-id-isolated" });
    const callArg = mocks.createOverride.mock.calls[0][0];
    expect(callArg.workspaceId).toBe("ws-ISOLATED");
    expect(callArg.policyId).toBe("pol-id-isolated");
    expect(callArg.overriddenBy).toBe(ACTOR);
  });
});

// ─── 9. DELETE /api/owner/policies/:policyId/overrides/:overrideId ───────────

describe("[policies] DELETE /api/owner/policies/:policyId/overrides/:overrideId — handler", () => {
  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (overrideDelete as unknown as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns { revoked: true } with status 200", async () => {
    mocks.revokeOverride.mockResolvedValue(undefined);
    const res = await overrideDelete(makeCtx(), { policyId: "pol-id-1", overrideId: "ovr-uuid-1" });
    const body = getBody(res);
    expect(body.revoked).toBe(true);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("calls revokeOverride with overrideId from params, workspaceId and actorId from ctx", async () => {
    mocks.revokeOverride.mockResolvedValue(undefined);
    await overrideDelete(makeCtx({}, "ws-SPECIFIC"), { policyId: "pol-id-1", overrideId: "ovr-to-revoke" });
    expect(mocks.revokeOverride).toHaveBeenCalledWith("ovr-to-revoke", "ws-SPECIFIC", ACTOR);
  });

  it("workspace isolation: workspaceId always from ctx, overrideId from params only", async () => {
    mocks.revokeOverride.mockResolvedValue(undefined);
    await overrideDelete(makeCtx({}, "ws-REAL"), { policyId: "pol-id-1", overrideId: "ovr-A" });
    expect(mocks.revokeOverride).toHaveBeenCalledWith("ovr-A", "ws-REAL", ACTOR);
  });

  it("cross-workspace call uses caller workspace, not any other", async () => {
    mocks.revokeOverride.mockResolvedValue(undefined);
    await overrideDelete(makeCtx({}, "ws-ALICE"), { policyId: "pol-id-1", overrideId: "ovr-B" });
    await overrideDelete(makeCtx({}, "ws-BOB"), { policyId: "pol-id-1", overrideId: "ovr-B" });
    expect(mocks.revokeOverride.mock.calls[0][1]).toBe("ws-ALICE");
    expect(mocks.revokeOverride.mock.calls[1][1]).toBe("ws-BOB");
  });
});
