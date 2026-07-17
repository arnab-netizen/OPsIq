/**
 * Goals + trajectory + collective-decision route contract tests (non-DB).
 *
 * Routes covered:
 *   POST /api/owner/goals           — create active goal (OWNER_MANAGE)
 *   GET  /api/owner/goals           — retrieve active goal (OWNER_VIEW)
 *   GET  /api/owner/goals/trajectory — compute trajectory (OWNER_VIEW)
 *   GET  /api/owner/collective-decision — owner command-center packet (OWNER_VIEW)
 *
 * DB-backed services are mocked; tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  getActiveGoal: vi.fn(),
  computeActiveGoalTrajectory: vi.fn(),
  getOwnerCommandCenter: vi.fn(),
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

vi.mock("@/services/owner-strategy/goal.service", () => ({
  createGoal: mocks.createGoal,
  getActiveGoal: mocks.getActiveGoal,
  computeActiveGoalTrajectory: mocks.computeActiveGoalTrajectory,
}));

vi.mock("@/services/owner-collective/collective-decision.service", () => ({
  getOwnerCommandCenter: mocks.getOwnerCommandCenter,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { POST as goalsPost, GET as goalsGet } from "@/app/api/owner/goals/route";
import { GET as trajectoryGet } from "@/app/api/owner/goals/trajectory/route";
import { GET as collectiveDecisionGet } from "@/app/api/owner/collective-decision/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-goals-test";

function makeGetCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-goals-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function makePostCtx(body: unknown, workspaceId = WS) {
  return {
    verifiedActorId: "actor-goals-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: `https://x/api/owner/goals`, json: async () => body },
  } as const;
}

function getBody(res: unknown): Record<string, unknown> {
  return (res as CanonicalJsonResponse).body as Record<string, unknown>;
}

const VALID_GOAL_BODY = {
  targetType: "PROFIT" as const,
  targetAmount: 500000,
  targetCurrency: "GBP",
  targetDate: "2027-12-31T00:00:00.000Z",
  baselineAmount: 120000,
  baselineDate: "2026-01-01T00:00:00.000Z",
};

const SAMPLE_GOAL_SUMMARY = {
  id: "goal-1",
  workspaceId: WS,
  targetType: "PROFIT",
  targetAmount: 500000,
  targetCurrency: "GBP",
  targetDate: new Date("2027-12-31"),
  status: "ACTIVE",
};

const SAMPLE_TRAJECTORY = {
  projectedMonthsToGoal: 18,
  currentTrajectoryDate: new Date("2028-01-01"),
  confidence: "MEDIUM",
  confidenceRationale: "Based on 6 months of trailing data",
  requiredMonthlyImprovement: 15000,
  gapToClose: 380000,
  assumptions: ["Stable revenue", "No new major costs"],
  trajectoryMiss: false,
};

const SAMPLE_COMMAND_CENTER = {
  workspaceId: WS,
  confidence: "HIGH",
  businessCondition: "CAUTION",
  topPriorities: [],
  requiredActions: [],
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. Static enforcement — POST /api/owner/goals ────────────────────────────

describe("[goals-post] POST /api/owner/goals — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/goals/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_MANAGE capability for POST", () => {
    expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("uses parseRequestBody for validation", () => {
    expect(src).toContain("parseRequestBody");
  });

  it("calls createGoal service", () => {
    expect(src).toContain("createGoal");
  });

  it("wraps response in canonicalJson with status 201", () => {
    expect(src).toContain("canonicalJson");
    expect(src).toContain("status: 201");
  });

  it("exports POST (no PATCH/DELETE)", () => {
    expect(src).toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });
});

// ─── 2. POST /api/owner/goals — handler behaviour ────────────────────────────

describe("[goals-post] POST /api/owner/goals — handler", () => {
  it("declares OWNER_MANAGE capability and requireWorkspace", () => {
    const opts = (goalsPost as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:manage");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns goalId in canonicalJson body with status 201", async () => {
    mocks.createGoal.mockResolvedValue("goal-abc-123");
    const res = await goalsPost(makePostCtx(VALID_GOAL_BODY));
    const body = getBody(res);
    expect(body.goalId).toBe("goal-abc-123");
    expect((res as CanonicalJsonResponse).status).toBe(201);
  });

  it("passes workspaceId from ctx (not request body) to service", async () => {
    mocks.createGoal.mockResolvedValue("goal-1");
    await goalsPost(makePostCtx(VALID_GOAL_BODY, "ws-SPECIFIC"));
    const arg = mocks.createGoal.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SPECIFIC");
  });

  it("passes actorId from ctx to service", async () => {
    mocks.createGoal.mockResolvedValue("goal-1");
    await goalsPost(makePostCtx(VALID_GOAL_BODY));
    const arg = mocks.createGoal.mock.calls[0][0];
    expect(arg.actorId).toBe("actor-goals-1");
  });

  it("passes targetType and targetAmount from body", async () => {
    mocks.createGoal.mockResolvedValue("goal-1");
    await goalsPost(makePostCtx(VALID_GOAL_BODY));
    const arg = mocks.createGoal.mock.calls[0][0];
    expect(arg.targetType).toBe("PROFIT");
    expect(arg.targetAmount).toBe(500000);
  });

  it("converts targetDate string to Date object", async () => {
    mocks.createGoal.mockResolvedValue("goal-1");
    await goalsPost(makePostCtx(VALID_GOAL_BODY));
    const arg = mocks.createGoal.mock.calls[0][0];
    expect(arg.targetDate).toBeInstanceOf(Date);
  });

  it("rejects invalid targetType", async () => {
    await expect(
      goalsPost(makePostCtx({ ...VALID_GOAL_BODY, targetType: "INVALID" }))
    ).rejects.toThrow();
  });

  it("rejects zero targetAmount", async () => {
    await expect(
      goalsPost(makePostCtx({ ...VALID_GOAL_BODY, targetAmount: 0 }))
    ).rejects.toThrow();
  });

  it("rejects negative targetAmount", async () => {
    await expect(
      goalsPost(makePostCtx({ ...VALID_GOAL_BODY, targetAmount: -1000 }))
    ).rejects.toThrow();
  });

  it("rejects invalid targetDate format", async () => {
    await expect(
      goalsPost(makePostCtx({ ...VALID_GOAL_BODY, targetDate: "not-a-date" }))
    ).rejects.toThrow();
  });

  it("rejects unknown top-level fields", async () => {
    await expect(
      goalsPost(makePostCtx({ ...VALID_GOAL_BODY, injectedField: "x" }))
    ).rejects.toThrow();
  });

  it("workspace isolation: verifiedWorkspaceId used, not any body field", async () => {
    mocks.createGoal.mockResolvedValue("goal-1");
    await goalsPost({ ...makePostCtx(VALID_GOAL_BODY, "ws-REAL"), verifiedWorkspaceId: "ws-REAL" } as never);
    const arg = mocks.createGoal.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-REAL");
  });
});

// ─── 3. Static enforcement — GET /api/owner/goals ────────────────────────────

describe("[goals-get] GET /api/owner/goals — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/goals/route.ts"),
    "utf8"
  );

  it("requires OWNER_VIEW capability for GET", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("uses ctx.verifiedWorkspaceId for the service call", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });

  it("calls getActiveGoal", () => {
    expect(src).toContain("getActiveGoal");
  });
});

// ─── 4. GET /api/owner/goals — handler behaviour ─────────────────────────────

describe("[goals-get] GET /api/owner/goals — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (goalsGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns goal in canonicalJson body with status 200", async () => {
    mocks.getActiveGoal.mockResolvedValue(SAMPLE_GOAL_SUMMARY);
    const res = await goalsGet(makeGetCtx(`https://x/api/owner/goals`));
    const body = getBody(res);
    expect(body.goal).toEqual(SAMPLE_GOAL_SUMMARY);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("returns null goal when no active goal exists", async () => {
    mocks.getActiveGoal.mockResolvedValue(null);
    const res = await goalsGet(makeGetCtx(`https://x/api/owner/goals`));
    const body = getBody(res);
    expect(body.goal).toBeNull();
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("calls getActiveGoal with verified workspaceId", async () => {
    mocks.getActiveGoal.mockResolvedValue(null);
    await goalsGet(makeGetCtx(`https://x/api/owner/goals`, "ws-SPECIFIC"));
    expect(mocks.getActiveGoal.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getActiveGoal.mockResolvedValue(null);
    await goalsGet(makeGetCtx(`https://x/api/owner/goals`, "ws-ALICE"));
    await goalsGet(makeGetCtx(`https://x/api/owner/goals`, "ws-BOB"));
    expect(mocks.getActiveGoal.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getActiveGoal.mock.calls[1][0]).toBe("ws-BOB");
  });
});

// ─── 5. Static enforcement — GET /api/owner/goals/trajectory ─────────────────

describe("[trajectory] GET /api/owner/goals/trajectory — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/goals/trajectory/route.ts"),
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

  it("calls computeActiveGoalTrajectory", () => {
    expect(src).toContain("computeActiveGoalTrajectory");
  });

  it("exports GET only", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
  });

  it("wraps in canonicalJson with status 200", () => {
    expect(src).toContain("canonicalJson");
    expect(src).toContain("status: 200");
  });
});

// ─── 6. GET /api/owner/goals/trajectory — handler behaviour ──────────────────

describe("[trajectory] GET /api/owner/goals/trajectory — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (trajectoryGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns result wrapped in canonicalJson with status 200", async () => {
    mocks.computeActiveGoalTrajectory.mockResolvedValue(SAMPLE_TRAJECTORY);
    const res = await trajectoryGet(makeGetCtx(`https://x/api/owner/goals/trajectory`));
    const body = getBody(res);
    expect(body.result).toEqual(SAMPLE_TRAJECTORY);
    expect((res as CanonicalJsonResponse).status).toBe(200);
  });

  it("returns null result when no active goal", async () => {
    mocks.computeActiveGoalTrajectory.mockResolvedValue(null);
    const res = await trajectoryGet(makeGetCtx(`https://x/api/owner/goals/trajectory`));
    const body = getBody(res);
    expect(body.result).toBeNull();
  });

  it("calls computeActiveGoalTrajectory with verified workspaceId", async () => {
    mocks.computeActiveGoalTrajectory.mockResolvedValue(null);
    await trajectoryGet(makeGetCtx(`https://x/api/owner/goals/trajectory`, "ws-SPECIFIC"));
    expect(mocks.computeActiveGoalTrajectory.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.computeActiveGoalTrajectory.mockResolvedValue(null);
    await trajectoryGet(makeGetCtx(`https://x/api/owner/goals/trajectory`, "ws-ALICE"));
    await trajectoryGet(makeGetCtx(`https://x/api/owner/goals/trajectory`, "ws-BOB"));
    expect(mocks.computeActiveGoalTrajectory.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.computeActiveGoalTrajectory.mock.calls[1][0]).toBe("ws-BOB");
  });
});

// ─── 7. Static enforcement — GET /api/owner/collective-decision ───────────────

describe("[collective-decision] GET /api/owner/collective-decision — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../app/api/owner/collective-decision/route.ts"),
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

  it("calls getOwnerCommandCenter", () => {
    expect(src).toContain("getOwnerCommandCenter");
  });

  it("exports GET only", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const PATCH");
    expect(src).not.toContain("export const DELETE");
  });
});

// ─── 8. GET /api/owner/collective-decision — handler behaviour ────────────────

describe("[collective-decision] GET /api/owner/collective-decision — handler", () => {
  it("declares OWNER_VIEW capability and requireWorkspace", () => {
    const opts = (collectiveDecisionGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result directly (no canonicalJson wrapper)", async () => {
    mocks.getOwnerCommandCenter.mockResolvedValue(SAMPLE_COMMAND_CENTER);
    const res = await collectiveDecisionGet(
      makeGetCtx(`https://x/api/owner/collective-decision`)
    );
    expect(res).toEqual(SAMPLE_COMMAND_CENTER);
  });

  it("calls getOwnerCommandCenter with verified workspaceId", async () => {
    mocks.getOwnerCommandCenter.mockResolvedValue(SAMPLE_COMMAND_CENTER);
    await collectiveDecisionGet(
      makeGetCtx(`https://x/api/owner/collective-decision`, "ws-SPECIFIC")
    );
    expect(mocks.getOwnerCommandCenter.mock.calls[0][0]).toBe("ws-SPECIFIC");
  });

  it("passes engagementId from query string when present", async () => {
    mocks.getOwnerCommandCenter.mockResolvedValue(SAMPLE_COMMAND_CENTER);
    await collectiveDecisionGet(
      makeGetCtx(`https://x/api/owner/collective-decision?engagementId=eng-42`)
    );
    expect(mocks.getOwnerCommandCenter.mock.calls[0][1]).toBe("eng-42");
  });

  it("passes null engagementId when not in query", async () => {
    mocks.getOwnerCommandCenter.mockResolvedValue(SAMPLE_COMMAND_CENTER);
    await collectiveDecisionGet(
      makeGetCtx(`https://x/api/owner/collective-decision`)
    );
    expect(mocks.getOwnerCommandCenter.mock.calls[0][1]).toBeNull();
  });

  it("workspace isolation: verifiedWorkspaceId used, not URL param", async () => {
    mocks.getOwnerCommandCenter.mockResolvedValue(SAMPLE_COMMAND_CENTER);
    await collectiveDecisionGet(
      makeGetCtx(`https://x/api/owner/collective-decision?workspaceId=ws-ATTACKER`, "ws-REAL")
    );
    expect(mocks.getOwnerCommandCenter.mock.calls[0][0]).toBe("ws-REAL");
    expect(mocks.getOwnerCommandCenter.mock.calls[0][0]).not.toBe("ws-ATTACKER");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getOwnerCommandCenter.mockResolvedValue(SAMPLE_COMMAND_CENTER);
    await collectiveDecisionGet(makeGetCtx(`https://x/api/owner/collective-decision`, "ws-ALICE"));
    await collectiveDecisionGet(makeGetCtx(`https://x/api/owner/collective-decision`, "ws-BOB"));
    expect(mocks.getOwnerCommandCenter.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getOwnerCommandCenter.mock.calls[1][0]).toBe("ws-BOB");
  });
});
