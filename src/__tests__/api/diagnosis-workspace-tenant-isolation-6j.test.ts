/**
 * Phase 6J — Diagnosis route workspace tenant-isolation tests.
 *
 * Proves that POST /api/diagnosis/maturity, /bottleneck, and /root-cause:
 *  - Reject body.workspaceId that does not match an active workspace membership
 *    for the authenticated user (cross-tenant access blocked with ForbiddenError).
 *  - Treat inactive membership the same as no membership (isActive:true in DB query).
 *  - Allow requests where the authenticated user has active membership.
 *  - Perform the workspace membership check BEFORE touching the idempotency cache.
 *  - Do not raw-500 on unauthorized workspaceId.
 *  - Preserve the result shape for authorized requests.
 *  - Scope the membership query to the session userId, not any body-supplied identity.
 *
 * All external dependencies are mocked. No real DB is touched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // auth
  withAuth: vi.fn(),
  // db
  dbMembershipFindFirst: vi.fn(),
  // idempotency
  checkIdempotencyKey: vi.fn(),
  recordIdempotencyResponse: vi.fn(),
  recordIdempotencyError: vi.fn(),
  // engines
  maturityAnalyze: vi.fn(),
  bottleneckAnalyze: vi.fn(),
  rootCauseAnalyze: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/enforced-route", () => ({
  withEnforcementFull: (handler: (req: unknown) => unknown) => handler,
}));

vi.mock("@/lib/auth-guard", () => ({
  withAuth: mocks.withAuth,
}));

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    workspaceMembership: { findFirst: mocks.dbMembershipFindFirst },
  },
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: mocks.checkIdempotencyKey,
  recordIdempotencyResponse: mocks.recordIdempotencyResponse,
  recordIdempotencyError: mocks.recordIdempotencyError,
}));

vi.mock("@/services/diagnostic-core/maturity-engine", () => ({
  maturityEngine: { analyzeMaturity: mocks.maturityAnalyze },
}));

vi.mock("@/services/diagnostic-core/bottleneck-engine", () => ({
  bottleneckEngine: { analyzeBottleneck: mocks.bottleneckAnalyze },
}));

vi.mock("@/services/diagnostic-core/root-cause-engine", () => ({
  rootCauseEngine: { analyzeRootCause: mocks.rootCauseAnalyze },
}));

vi.mock("@/lib/validation", () => ({
  parseRequestBody: vi.fn().mockImplementation(
    async (req: { json: () => Promise<unknown> }) => req.json()
  ),
}));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/runtime/runtime-errors", () => ({
  RuntimeError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "RuntimeError"; }
  },
}));

vi.mock("@/infra/errors", () => ({
  BadRequestError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "BadRequestError"; }
  },
  ForbiddenError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "ForbiddenError"; }
  },
  AppError: class extends Error {
    constructor(code: string, msg: string) { super(msg); this.name = "AppError"; }
  },
}));

vi.mock("@/domain/constants/capabilities", () => ({
  CAPABILITIES: { DIAGNOSIS_READ: "diagnosis_read" },
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { POST as maturityPOST } from "@/app/api/diagnosis/maturity/route";
import { POST as bottleneckPOST } from "@/app/api/diagnosis/bottleneck/route";
import { POST as rootCausePOST } from "@/app/api/diagnosis/root-cause/route";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const USER_ID = "a1eebc99-0000-0000-0000-000000000001";
const WS_AUTHORIZED = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
const WS_FOREIGN = "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a99";
const ENGAGEMENT_ID = "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const MATURITY_BODY = {
  engagementId: ENGAGEMENT_ID,
  workspaceId: WS_AUTHORIZED,
  indicators: {
    processDocumentation: 80,
    processConsistency: 75,
    teamTraining: 70,
    toolsAvailable: 85,
    dataQuality: 90,
    decisionTracking: 65,
    riskManagement: 70,
    governanceStructure: 80,
    executionTrackRecord: 75,
  },
};

const BOTTLENECK_BODY = {
  engagementId: ENGAGEMENT_ID,
  workspaceId: WS_AUTHORIZED,
  metrics: { throughput: 85, utilization: 92 },
  timelineData: {
    t1: { value: 80, timestamp: "2026-01-01T00:00:00Z" },
    t2: { value: 92, timestamp: "2026-01-02T00:00:00Z" },
  },
  affectedKpis: { revenue: 5 },
};

const ROOTCAUSE_BODY = {
  engagementId: ENGAGEMENT_ID,
  workspaceId: WS_AUTHORIZED,
  metrics: { revenue: 85, churn: 12 },
  observations: ["Revenue declined 15% in Q4", "Customer churn increased 3pp"],
  timeline: {
    q3: "2026-07-01T00:00:00Z",
    q4: "2026-10-01T00:00:00Z",
  },
};

const MATURITY_RESULT = {
  analysisId: "analysis-mat-1",
  engagementId: ENGAGEMENT_ID,
  workspaceId: WS_AUTHORIZED,
  currentMaturity: { maturityLevel: "MANAGED" },
  overallConfidence: 0.82,
};

const BOTTLENECK_RESULT = {
  analysisId: "analysis-bn-1",
  engagementId: ENGAGEMENT_ID,
  workspaceId: WS_AUTHORIZED,
  primaryBottleneck: { bottleneckVariable: "utilization" },
  overallConfidence: 0.88,
};

const ROOTCAUSE_RESULT = {
  analysisId: "analysis-rc-1",
  engagementId: ENGAGEMENT_ID,
  workspaceId: WS_AUTHORIZED,
  overallConfidence: 0.76,
};

function makeRequest(body: object, idempotencyKey: string | null = "idem-6j-1") {
  return {
    headers: {
      get: (k: string) => (k === "idempotency-key" ? idempotencyKey : null),
    },
    json: () => Promise.resolve(body),
  };
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mocks.withAuth.mockResolvedValue({
    session: { user: { id: USER_ID } },
    policy: { roles: [{ role: "admin" }] },
  });

  mocks.dbMembershipFindFirst.mockResolvedValue({ role: "admin" }); // authorized by default
  mocks.checkIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
  mocks.recordIdempotencyResponse.mockResolvedValue(undefined);
  mocks.recordIdempotencyError.mockResolvedValue(undefined);

  mocks.maturityAnalyze.mockResolvedValue(MATURITY_RESULT);
  mocks.bottleneckAnalyze.mockResolvedValue(BOTTLENECK_RESULT);
  mocks.rootCauseAnalyze.mockResolvedValue(ROOTCAUSE_RESULT);
});

// ─── POST /api/diagnosis/maturity ─────────────────────────────────────────────

describe("POST /api/diagnosis/maturity — workspace tenant isolation (Phase 6J)", () => {
  it("active member: membership check passes and analysis result returned", async () => {
    const result = await maturityPOST(makeRequest(MATURITY_BODY) as never);
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: WS_AUTHORIZED, userId: USER_ID, isActive: true },
      select: { role: true },
    });
    expect(mocks.maturityAnalyze).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ analysisId: "analysis-mat-1" });
  });

  it("cross-workspace: body.workspaceId for foreign workspace → ForbiddenError", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);
    const body = { ...MATURITY_BODY, workspaceId: WS_FOREIGN };

    await expect(maturityPOST(makeRequest(body) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(mocks.maturityAnalyze).not.toHaveBeenCalled();
  });

  it("inactive membership (isActive filter returns null) → ForbiddenError", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);

    await expect(maturityPOST(makeRequest(MATURITY_BODY) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
  });

  it("workspace membership check runs BEFORE idempotency cache on unauthorized request", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);

    await expect(maturityPOST(makeRequest(MATURITY_BODY) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(mocks.checkIdempotencyKey).not.toHaveBeenCalled();
    expect(mocks.recordIdempotencyResponse).not.toHaveBeenCalled();
    expect(mocks.recordIdempotencyError).not.toHaveBeenCalled();
  });

  it("missing idempotency-key header → BadRequestError (before workspace check)", async () => {
    await expect(maturityPOST(makeRequest(MATURITY_BODY, null) as never)).rejects.toMatchObject({
      name: "BadRequestError",
    });
    expect(mocks.maturityAnalyze).not.toHaveBeenCalled();
  });

  it("idempotent retry: cached response returned without re-calling engine (workspace still verified)", async () => {
    const cached = { analysisId: "analysis-mat-1", cached: true };
    mocks.checkIdempotencyKey.mockResolvedValue({
      isNew: false,
      cachedResponse: { status: 201, body: cached },
    });

    const result = await maturityPOST(makeRequest(MATURITY_BODY) as never);
    expect(result).toEqual(cached);
    expect(mocks.maturityAnalyze).not.toHaveBeenCalled();
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledOnce(); // workspace still checked
  });

  it("membership query uses authenticated session userId, not any body-supplied field", async () => {
    await maturityPOST(makeRequest(MATURITY_BODY) as never);
    const callArgs = mocks.dbMembershipFindFirst.mock.calls[0][0];
    expect(callArgs.where.userId).toBe(USER_ID);
    expect(Object.keys(MATURITY_BODY)).not.toContain("userId");
  });

  it("authorized request: result shape is unchanged from pre-fix behavior", async () => {
    const result = await maturityPOST(makeRequest(MATURITY_BODY) as never);
    expect(result).toMatchObject({
      analysisId: expect.any(String),
      overallConfidence: expect.any(Number),
    });
  });
});

// ─── POST /api/diagnosis/bottleneck ──────────────────────────────────────────

describe("POST /api/diagnosis/bottleneck — workspace tenant isolation (Phase 6J)", () => {
  it("active member: membership check passes and analysis result returned", async () => {
    const result = await bottleneckPOST(makeRequest(BOTTLENECK_BODY) as never);
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: WS_AUTHORIZED, userId: USER_ID, isActive: true },
      select: { role: true },
    });
    expect(mocks.bottleneckAnalyze).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ analysisId: "analysis-bn-1" });
  });

  it("cross-workspace: body.workspaceId for foreign workspace → ForbiddenError", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);
    const body = { ...BOTTLENECK_BODY, workspaceId: WS_FOREIGN };

    await expect(bottleneckPOST(makeRequest(body) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(mocks.bottleneckAnalyze).not.toHaveBeenCalled();
  });

  it("inactive membership → ForbiddenError and idempotency cache not touched", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);

    await expect(bottleneckPOST(makeRequest(BOTTLENECK_BODY) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(mocks.checkIdempotencyKey).not.toHaveBeenCalled();
  });

  it("missing idempotency-key header → BadRequestError", async () => {
    await expect(bottleneckPOST(makeRequest(BOTTLENECK_BODY, null) as never)).rejects.toMatchObject({
      name: "BadRequestError",
    });
    expect(mocks.bottleneckAnalyze).not.toHaveBeenCalled();
  });

  it("idempotent retry: cached response returned without re-calling engine (workspace still verified)", async () => {
    const cached = { analysisId: "analysis-bn-1", cached: true };
    mocks.checkIdempotencyKey.mockResolvedValue({
      isNew: false,
      cachedResponse: { status: 201, body: cached },
    });

    const result = await bottleneckPOST(makeRequest(BOTTLENECK_BODY) as never);
    expect(result).toEqual(cached);
    expect(mocks.bottleneckAnalyze).not.toHaveBeenCalled();
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledOnce();
  });

  it("membership query scoped to body.workspaceId and session userId", async () => {
    await bottleneckPOST(makeRequest(BOTTLENECK_BODY) as never);
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS_AUTHORIZED,
          userId: USER_ID,
          isActive: true,
        }),
      })
    );
  });

  it("authorized request: result shape is unchanged from pre-fix behavior", async () => {
    const result = await bottleneckPOST(makeRequest(BOTTLENECK_BODY) as never);
    expect(result).toMatchObject({
      analysisId: expect.any(String),
      overallConfidence: expect.any(Number),
    });
  });
});

// ─── POST /api/diagnosis/root-cause ──────────────────────────────────────────

describe("POST /api/diagnosis/root-cause — workspace tenant isolation (Phase 6J)", () => {
  it("active member: membership check passes and analysis result returned", async () => {
    const result = await rootCausePOST(makeRequest(ROOTCAUSE_BODY) as never);
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: WS_AUTHORIZED, userId: USER_ID, isActive: true },
      select: { role: true },
    });
    expect(mocks.rootCauseAnalyze).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ analysisId: "analysis-rc-1" });
  });

  it("cross-workspace: body.workspaceId for foreign workspace → ForbiddenError", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);
    const body = { ...ROOTCAUSE_BODY, workspaceId: WS_FOREIGN };

    await expect(rootCausePOST(makeRequest(body) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(mocks.rootCauseAnalyze).not.toHaveBeenCalled();
  });

  it("inactive membership → ForbiddenError and idempotency cache not touched", async () => {
    mocks.dbMembershipFindFirst.mockResolvedValue(null);

    await expect(rootCausePOST(makeRequest(ROOTCAUSE_BODY) as never)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(mocks.checkIdempotencyKey).not.toHaveBeenCalled();
  });

  it("missing idempotency-key header → BadRequestError", async () => {
    await expect(rootCausePOST(makeRequest(ROOTCAUSE_BODY, null) as never)).rejects.toMatchObject({
      name: "BadRequestError",
    });
    expect(mocks.rootCauseAnalyze).not.toHaveBeenCalled();
  });

  it("idempotent retry: cached response returned without re-calling engine (workspace still verified)", async () => {
    const cached = { analysisId: "analysis-rc-1", cached: true };
    mocks.checkIdempotencyKey.mockResolvedValue({
      isNew: false,
      cachedResponse: { status: 201, body: cached },
    });

    const result = await rootCausePOST(makeRequest(ROOTCAUSE_BODY) as never);
    expect(result).toEqual(cached);
    expect(mocks.rootCauseAnalyze).not.toHaveBeenCalled();
    expect(mocks.dbMembershipFindFirst).toHaveBeenCalledOnce();
  });

  it("membership query uses session userId, not any body-supplied identity", async () => {
    await rootCausePOST(makeRequest(ROOTCAUSE_BODY) as never);
    const callArgs = mocks.dbMembershipFindFirst.mock.calls[0][0];
    expect(callArgs.where.userId).toBe(USER_ID);
    expect(Object.keys(ROOTCAUSE_BODY)).not.toContain("userId");
  });

  it("authorized request: result shape is unchanged from pre-fix behavior", async () => {
    const result = await rootCausePOST(makeRequest(ROOTCAUSE_BODY) as never);
    expect(result).toMatchObject({
      analysisId: expect.any(String),
      overallConfidence: expect.any(Number),
    });
  });
});
