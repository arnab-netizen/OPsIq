/**
 * GET /api/owner/priorities and GET /api/owner/action-plan — non-DB route contract tests.
 *
 * Both routes:
 *   - Require OWNER_VIEW + requireWorkspace via withCanonicalEnforcement
 *   - Parse optional `businessId` from query string
 *   - Inject `db` + `now` into the service call alongside workspaceId/businessId
 *   - Return result wrapped in canonicalJson({ ... }, { status: 200 })
 *
 * DB-backed services are mocked; `db` and `now` are also mocked at the module level.
 * Tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getOwnerCommandPriorities: vi.fn(),
  getOwnerActionAssignment: vi.fn(),
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

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

vi.mock("@/services/owner-mode/owner-command-priorities.service", () => ({
  getOwnerCommandPriorities: mocks.getOwnerCommandPriorities,
}));

vi.mock("@/services/owner-mode/owner-action-assignment.service", () => ({
  getOwnerActionAssignment: mocks.getOwnerActionAssignment,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { GET as prioritiesGet } from "@/app/api/owner/priorities/route";
import { GET as actionPlanGet } from "@/app/api/owner/action-plan/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-priority-test";

function makeCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-priority-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

const SAMPLE_PRIORITIES = {
  priorities: [
    { rank: 1, domain: "FINANCE", title: "Reduce cost base", urgency: "HIGH" },
    { rank: 2, domain: "OPERATIONS", title: "Fix delivery bottleneck", urgency: "MEDIUM" },
  ],
  workspaceId: WS,
};

const SAMPLE_ACTION_PLAN = {
  workspaceId: WS,
  nextAction: {
    title: "Review cash position",
    responsible: "owner",
    proofRequired: "Bank statement showing positive balance",
  },
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. Static enforcement — GET /api/owner/priorities ───────────────────────

describe("[priorities] GET /api/owner/priorities — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/priorities/route.ts"),
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

  it("calls getOwnerCommandPriorities (the service delegation)", () => {
    expect(src).toContain("getOwnerCommandPriorities");
  });

  it("wraps response in canonicalJson with status 200", () => {
    expect(src).toContain("canonicalJson");
    expect(src).toContain("status: 200");
  });
});

// ─── 2. GET /api/owner/priorities — handler behaviour ────────────────────────

describe("[priorities] GET /api/owner/priorities — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (prioritiesGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson body with status 200", async () => {
    mocks.getOwnerCommandPriorities.mockResolvedValue(SAMPLE_PRIORITIES);
    const res = await prioritiesGet(makeCtx(`https://x/api/owner/priorities?businessId=biz-55`));
    const body = getBody(res);
    expect(body).toEqual(SAMPLE_PRIORITIES);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("calls getOwnerCommandPriorities with verified workspaceId", async () => {
    mocks.getOwnerCommandPriorities.mockResolvedValue(SAMPLE_PRIORITIES);
    await prioritiesGet(makeCtx(`https://x/api/owner/priorities?businessId=biz-55`, "ws-SPECIFIC"));
    const arg = mocks.getOwnerCommandPriorities.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string to service", async () => {
    mocks.getOwnerCommandPriorities.mockResolvedValue(SAMPLE_PRIORITIES);
    await prioritiesGet(makeCtx(`https://x/api/owner/priorities?businessId=biz-55`));
    const arg = mocks.getOwnerCommandPriorities.mock.calls[0][0];
    expect(arg.businessId).toBe("biz-55");
  });

  it("returns no-business 200 and does not call service when businessId absent", async () => {
    const res = await prioritiesGet(makeCtx(`https://x/api/owner/priorities`));
    expect((res as CanonicalJsonResponse).status).toBe(200);
    expect(getBody(res)).toMatchObject({ found: false, reason: "no_business_configured" });
    expect(mocks.getOwnerCommandPriorities).not.toHaveBeenCalled();
  });

  it("workspace isolation: verifiedWorkspaceId used, not any URL param", async () => {
    mocks.getOwnerCommandPriorities.mockResolvedValue(SAMPLE_PRIORITIES);
    await prioritiesGet(
      makeCtx(`https://x/api/owner/priorities?workspaceId=ws-ATTACKER&businessId=biz-55`, "ws-REAL")
    );
    const arg = mocks.getOwnerCommandPriorities.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-REAL");
    expect(arg.workspaceId).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces receive correct scoping", async () => {
    mocks.getOwnerCommandPriorities.mockResolvedValue(SAMPLE_PRIORITIES);
    await prioritiesGet(makeCtx(`https://x/api/owner/priorities?businessId=biz-55`, "ws-ALICE"));
    await prioritiesGet(makeCtx(`https://x/api/owner/priorities?businessId=biz-55`, "ws-BOB"));
    expect(mocks.getOwnerCommandPriorities.mock.calls[0][0].workspaceId).toBe("ws-ALICE");
    expect(mocks.getOwnerCommandPriorities.mock.calls[1][0].workspaceId).toBe("ws-BOB");
  });
});

// ─── 3. Static enforcement — GET /api/owner/action-plan ─────────────────────

describe("[action-plan] GET /api/owner/action-plan — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/action-plan/route.ts"),
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

  it("calls getOwnerActionAssignment (the service delegation)", () => {
    expect(src).toContain("getOwnerActionAssignment");
  });

  it("wraps response in canonicalJson with status 200", () => {
    expect(src).toContain("canonicalJson");
    expect(src).toContain("status: 200");
  });
});

// ─── 4. GET /api/owner/action-plan — handler behaviour ───────────────────────

describe("[action-plan] GET /api/owner/action-plan — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (actionPlanGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson body with status 200", async () => {
    mocks.getOwnerActionAssignment.mockResolvedValue(SAMPLE_ACTION_PLAN);
    const res = await actionPlanGet(makeCtx(`https://x/api/owner/action-plan?businessId=biz-88`));
    const body = getBody(res);
    expect(body).toEqual(SAMPLE_ACTION_PLAN);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("calls getOwnerActionAssignment with verified workspaceId", async () => {
    mocks.getOwnerActionAssignment.mockResolvedValue(SAMPLE_ACTION_PLAN);
    await actionPlanGet(makeCtx(`https://x/api/owner/action-plan?businessId=biz-88`, "ws-SPECIFIC"));
    const arg = mocks.getOwnerActionAssignment.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SPECIFIC");
  });

  it("passes businessId from query string to service", async () => {
    mocks.getOwnerActionAssignment.mockResolvedValue(SAMPLE_ACTION_PLAN);
    await actionPlanGet(makeCtx(`https://x/api/owner/action-plan?businessId=biz-88`));
    const arg = mocks.getOwnerActionAssignment.mock.calls[0][0];
    expect(arg.businessId).toBe("biz-88");
  });

  it("returns no-business 200 and does not call service when businessId absent", async () => {
    const res = await actionPlanGet(makeCtx(`https://x/api/owner/action-plan`));
    expect((res as CanonicalJsonResponse).status).toBe(200);
    expect(getBody(res)).toMatchObject({ found: false, reason: "no_business_configured" });
    expect(mocks.getOwnerActionAssignment).not.toHaveBeenCalled();
  });

  it("workspace isolation: verifiedWorkspaceId used, not any URL param", async () => {
    mocks.getOwnerActionAssignment.mockResolvedValue(SAMPLE_ACTION_PLAN);
    await actionPlanGet(
      makeCtx(`https://x/api/owner/action-plan?workspaceId=ws-ATTACKER&businessId=biz-88`, "ws-REAL")
    );
    const arg = mocks.getOwnerActionAssignment.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-REAL");
    expect(arg.workspaceId).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces receive correct scoping", async () => {
    mocks.getOwnerActionAssignment.mockResolvedValue(SAMPLE_ACTION_PLAN);
    await actionPlanGet(makeCtx(`https://x/api/owner/action-plan?businessId=biz-88`, "ws-ALICE"));
    await actionPlanGet(makeCtx(`https://x/api/owner/action-plan?businessId=biz-88`, "ws-BOB"));
    expect(mocks.getOwnerActionAssignment.mock.calls[0][0].workspaceId).toBe("ws-ALICE");
    expect(mocks.getOwnerActionAssignment.mock.calls[1][0].workspaceId).toBe("ws-BOB");
  });
});
