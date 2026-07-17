/**
 * Owner GET view-route contract tests (non-DB).
 *
 * Routes covered:
 *   GET /api/owner/input-guidance    — getOwnerInputGuidance (OWNER_VIEW, db+now injected)
 *   GET /api/owner/onboarding        — getOwnerOnboardingState (OWNER_VIEW, db+now injected)
 *   GET /api/owner/readiness         — getOwnerReadiness (OWNER_VIEW, db+now injected)
 *   GET /api/owner/recovery-status   — getOwnerRecoveryStatus (OWNER_VIEW, fail-closed on !ok)
 *   GET /api/owner/public-signals    — getOwnerPublicSignals (OWNER_VIEW, fail-closed on !ok)
 *   GET /api/owner/proof-risk/queue  — getOwnerNowView + buildAdjudicationQueue (OWNER_VIEW, returns directly)
 *
 * DB-backed services are mocked; tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getOwnerInputGuidance: vi.fn(),
  getOwnerOnboardingState: vi.fn(),
  getOwnerReadiness: vi.fn(),
  getOwnerRecoveryStatus: vi.fn(),
  getOwnerPublicSignals: vi.fn(),
  getOwnerNowView: vi.fn(),
  buildAdjudicationQueue: vi.fn(),
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

vi.mock("@/services/owner-mode/owner-input-guidance.service", () => ({
  getOwnerInputGuidance: mocks.getOwnerInputGuidance,
}));

vi.mock("@/services/owner-mode/owner-onboarding.service", () => ({
  getOwnerOnboardingState: mocks.getOwnerOnboardingState,
}));

vi.mock("@/services/owner-mode/owner-readiness.service", () => ({
  getOwnerReadiness: mocks.getOwnerReadiness,
}));

vi.mock("@/services/owner-mode/owner-recovery-status.service", () => ({
  getOwnerRecoveryStatus: mocks.getOwnerRecoveryStatus,
}));

vi.mock("@/services/owner-mode/owner-public-signals.service", () => ({
  getOwnerPublicSignals: mocks.getOwnerPublicSignals,
}));

vi.mock("@/services/owner-guidance/owner-now-view.service", () => ({
  getOwnerNowView: mocks.getOwnerNowView,
}));

vi.mock("@/domain/owner-mode/adjudication-queue", () => ({
  buildAdjudicationQueue: mocks.buildAdjudicationQueue,
  ADJUDICATION_OUTCOME_OPTIONS: [{ value: "real", label: "Real" }],
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { GET as inputGuidanceGet } from "@/app/api/owner/input-guidance/route";
import { GET as onboardingGet } from "@/app/api/owner/onboarding/route";
import { GET as readinessGet } from "@/app/api/owner/readiness/route";
import { GET as recoveryStatusGet } from "@/app/api/owner/recovery-status/route";
import { GET as publicSignalsGet } from "@/app/api/owner/public-signals/route";
import { GET as proofRiskQueueGet } from "@/app/api/owner/proof-risk/queue/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WS = "ws-view2-test";
const BIZ = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";

function makeCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-view2-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function getBody(res: unknown): unknown {
  return (res as CanonicalJsonResponse).body;
}

function getStatus(res: unknown): number {
  return (res as CanonicalJsonResponse).status as number;
}

beforeEach(() => vi.clearAllMocks());

// ─── input-guidance ───────────────────────────────────────────────────────────

describe("GET /api/owner/input-guidance", () => {
  const url = (biz?: string) =>
    `https://x/api/owner/input-guidance${biz ? `?businessId=${biz}` : ""}`;

  it("declares OWNER_VIEW + requireWorkspace", () => {
    const opts = (inputGuidanceGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson status 200", async () => {
    const result = { categories: [], nextBestInput: null };
    mocks.getOwnerInputGuidance.mockResolvedValue(result);
    const res = await inputGuidanceGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(result);
  });

  it("injects workspaceId from ctx (not URL)", async () => {
    mocks.getOwnerInputGuidance.mockResolvedValue({});
    await inputGuidanceGet(makeCtx(url(BIZ), "ws-REAL"));
    const arg = mocks.getOwnerInputGuidance.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-REAL");
  });

  it("injects businessId from query or empty string when absent", async () => {
    mocks.getOwnerInputGuidance.mockResolvedValue({});
    await inputGuidanceGet(makeCtx(url()));
    expect(mocks.getOwnerInputGuidance.mock.calls[0][0].businessId).toBe("");
    vi.clearAllMocks();
    mocks.getOwnerInputGuidance.mockResolvedValue({});
    await inputGuidanceGet(makeCtx(url(BIZ)));
    expect(mocks.getOwnerInputGuidance.mock.calls[0][0].businessId).toBe(BIZ);
  });

  it("workspace isolation: uses verifiedWorkspaceId, not URL param", async () => {
    mocks.getOwnerInputGuidance.mockResolvedValue({});
    await inputGuidanceGet(makeCtx(`${url(BIZ)}&workspaceId=ws-ATTACKER`, "ws-REAL"));
    expect(mocks.getOwnerInputGuidance.mock.calls[0][0].workspaceId).toBe("ws-REAL");
    expect(mocks.getOwnerInputGuidance.mock.calls[0][0].workspaceId).not.toBe("ws-ATTACKER");
  });
});

// ─── onboarding ───────────────────────────────────────────────────────────────

describe("GET /api/owner/onboarding", () => {
  const url = (biz?: string) =>
    `https://x/api/owner/onboarding${biz ? `?businessId=${biz}` : ""}`;

  it("declares OWNER_VIEW + requireWorkspace", () => {
    const opts = (onboardingGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson status 200", async () => {
    const result = { steps: [], missingData: [], canRunDiagnosis: false };
    mocks.getOwnerOnboardingState.mockResolvedValue(result);
    const res = await onboardingGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(result);
  });

  it("injects workspaceId from ctx and businessId from query", async () => {
    mocks.getOwnerOnboardingState.mockResolvedValue({});
    await onboardingGet(makeCtx(url(BIZ), "ws-ONBOARD"));
    const arg = mocks.getOwnerOnboardingState.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-ONBOARD");
    expect(arg.businessId).toBe(BIZ);
  });

  it("defaults businessId to empty string when absent", async () => {
    mocks.getOwnerOnboardingState.mockResolvedValue({});
    await onboardingGet(makeCtx(url()));
    expect(mocks.getOwnerOnboardingState.mock.calls[0][0].businessId).toBe("");
  });
});

// ─── readiness ────────────────────────────────────────────────────────────────

describe("GET /api/owner/readiness", () => {
  const url = (biz?: string) =>
    `https://x/api/owner/readiness${biz ? `?businessId=${biz}` : ""}`;

  it("declares OWNER_VIEW + requireWorkspace", () => {
    const opts = (readinessGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns service result in canonicalJson status 200", async () => {
    const result = { overallScore: 72, pilotReady: false, hardBlockers: [] };
    mocks.getOwnerReadiness.mockResolvedValue(result);
    const res = await readinessGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(result);
  });

  it("injects workspaceId from ctx and businessId from query", async () => {
    mocks.getOwnerReadiness.mockResolvedValue({});
    await readinessGet(makeCtx(url(BIZ), "ws-READY"));
    const arg = mocks.getOwnerReadiness.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-READY");
    expect(arg.businessId).toBe(BIZ);
  });

  it("defaults businessId to empty string when absent", async () => {
    mocks.getOwnerReadiness.mockResolvedValue({});
    await readinessGet(makeCtx(url()));
    expect(mocks.getOwnerReadiness.mock.calls[0][0].businessId).toBe("");
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getOwnerReadiness.mockResolvedValue({});
    await readinessGet(makeCtx(url(BIZ), "ws-ALICE"));
    await readinessGet(makeCtx(url(BIZ), "ws-BOB"));
    expect(mocks.getOwnerReadiness.mock.calls[0][0].workspaceId).toBe("ws-ALICE");
    expect(mocks.getOwnerReadiness.mock.calls[1][0].workspaceId).toBe("ws-BOB");
  });
});

// ─── recovery-status ─────────────────────────────────────────────────────────

describe("GET /api/owner/recovery-status", () => {
  const url = (biz?: string) =>
    `https://x/api/owner/recovery-status${biz ? `?businessId=${biz}` : ""}`;

  it("declares OWNER_VIEW + requireWorkspace", () => {
    const opts = (recoveryStatusGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns status in canonicalJson 200 when service ok=true", async () => {
    const status = { phase: "stabilizing", weeksRemaining: 8 };
    mocks.getOwnerRecoveryStatus.mockResolvedValue({ ok: true, status });
    const res = await recoveryStatusGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(status);
  });

  it("returns fail-closed 500 when service ok=false", async () => {
    mocks.getOwnerRecoveryStatus.mockResolvedValue({ ok: false, error: "internal" });
    const res = await recoveryStatusGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(500);
    expect((getBody(res) as { error: { code: string } }).error.code).toBe("RECOVERY_STATUS_INCOHERENT");
  });

  it("passes workspaceId from ctx and businessId from query", async () => {
    mocks.getOwnerRecoveryStatus.mockResolvedValue({ ok: true, status: {} });
    await recoveryStatusGet(makeCtx(url(BIZ), "ws-RECOVERY"));
    expect(mocks.getOwnerRecoveryStatus.mock.calls[0][0]).toBe("ws-RECOVERY");
    expect(mocks.getOwnerRecoveryStatus.mock.calls[0][1]).toBe(BIZ);
  });

  it("passes null businessId when query absent", async () => {
    mocks.getOwnerRecoveryStatus.mockResolvedValue({ ok: true, status: {} });
    await recoveryStatusGet(makeCtx(url()));
    expect(mocks.getOwnerRecoveryStatus.mock.calls[0][1]).toBeNull();
  });
});

// ─── public-signals ───────────────────────────────────────────────────────────

describe("GET /api/owner/public-signals", () => {
  const url = (biz?: string) =>
    `https://x/api/owner/public-signals${biz ? `?businessId=${biz}` : ""}`;

  it("declares OWNER_VIEW + requireWorkspace", () => {
    const opts = (publicSignalsGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns summary in canonicalJson 200 when service ok=true", async () => {
    const summary = { signals: [], trendCount: 0 };
    mocks.getOwnerPublicSignals.mockResolvedValue({ ok: true, summary });
    const res = await publicSignalsGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(summary);
  });

  it("returns fail-closed 500 when service ok=false", async () => {
    mocks.getOwnerPublicSignals.mockResolvedValue({ ok: false, error: "projection failed" });
    const res = await publicSignalsGet(makeCtx(url(BIZ)));
    expect(getStatus(res)).toBe(500);
    expect((getBody(res) as { error: { code: string } }).error.code).toBe("PUBLIC_SIGNALS_INCOHERENT");
  });

  it("passes workspaceId from ctx and businessId from query", async () => {
    mocks.getOwnerPublicSignals.mockResolvedValue({ ok: true, summary: {} });
    await publicSignalsGet(makeCtx(url(BIZ), "ws-SIG"));
    expect(mocks.getOwnerPublicSignals.mock.calls[0][0]).toBe("ws-SIG");
    expect(mocks.getOwnerPublicSignals.mock.calls[0][1]).toBe(BIZ);
  });

  it("passes null businessId when query absent", async () => {
    mocks.getOwnerPublicSignals.mockResolvedValue({ ok: true, summary: {} });
    await publicSignalsGet(makeCtx(url()));
    expect(mocks.getOwnerPublicSignals.mock.calls[0][1]).toBeNull();
  });
});

// ─── proof-risk/queue ────────────────────────────────────────────────────────

const SAMPLE_NOW_VIEW = {
  reusedProofFindings: [],
  topGamingSignal: null,
  topCredibilityConcern: null,
  timingEvidence: [],
  proofRiskAdjudications: [],
  proofRiskAdjudicationSummary: { total: 0, pending: 0 },
};

const SAMPLE_QUEUE = {
  items: [{ id: "item-1", riskType: "DUPLICATE_HASH" }],
  summary: { total: 1, pending: 1 },
};

describe("GET /api/owner/proof-risk/queue", () => {
  const url = (biz?: string) =>
    `https://x/api/owner/proof-risk/queue${biz ? `?businessId=${biz}` : ""}`;

  it("declares OWNER_VIEW + requireWorkspace", () => {
    const opts = (proofRiskQueueGet as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(opts?.requireCapabilities).toContain("owner:view");
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("returns { items, summary, outcomeOptions, adjudicationSummary } directly", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    mocks.buildAdjudicationQueue.mockReturnValue(SAMPLE_QUEUE);
    const res = await proofRiskQueueGet(makeCtx(url(BIZ)));
    expect(res).toMatchObject({
      items: SAMPLE_QUEUE.items,
      summary: SAMPLE_QUEUE.summary,
      outcomeOptions: expect.any(Array),
      adjudicationSummary: SAMPLE_NOW_VIEW.proofRiskAdjudicationSummary,
    });
  });

  it("passes workspaceId from ctx to getOwnerNowView", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    mocks.buildAdjudicationQueue.mockReturnValue(SAMPLE_QUEUE);
    await proofRiskQueueGet(makeCtx(url(BIZ), "ws-PROOF"));
    expect(mocks.getOwnerNowView.mock.calls[0][0]).toBe("ws-PROOF");
  });

  it("passes businessId from query to getOwnerNowView", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    mocks.buildAdjudicationQueue.mockReturnValue(SAMPLE_QUEUE);
    await proofRiskQueueGet(makeCtx(url(BIZ)));
    expect(mocks.getOwnerNowView.mock.calls[0][1]).toBe(BIZ);
  });

  it("passes null businessId when query absent", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    mocks.buildAdjudicationQueue.mockReturnValue(SAMPLE_QUEUE);
    await proofRiskQueueGet(makeCtx(url()));
    expect(mocks.getOwnerNowView.mock.calls[0][1]).toBeNull();
  });

  it("passes now-view fields to buildAdjudicationQueue", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    mocks.buildAdjudicationQueue.mockReturnValue(SAMPLE_QUEUE);
    await proofRiskQueueGet(makeCtx(url(BIZ)));
    const queueArg = mocks.buildAdjudicationQueue.mock.calls[0][0];
    expect(queueArg).toMatchObject({
      reusedProofFindings: SAMPLE_NOW_VIEW.reusedProofFindings,
      topGamingSignal: SAMPLE_NOW_VIEW.topGamingSignal,
      proofRiskAdjudications: SAMPLE_NOW_VIEW.proofRiskAdjudications,
    });
  });

  it("workspace isolation: different workspaces scoped correctly", async () => {
    mocks.getOwnerNowView.mockResolvedValue(SAMPLE_NOW_VIEW);
    mocks.buildAdjudicationQueue.mockReturnValue(SAMPLE_QUEUE);
    await proofRiskQueueGet(makeCtx(url(BIZ), "ws-ALICE"));
    await proofRiskQueueGet(makeCtx(url(BIZ), "ws-BOB"));
    expect(mocks.getOwnerNowView.mock.calls[0][0]).toBe("ws-ALICE");
    expect(mocks.getOwnerNowView.mock.calls[1][0]).toBe("ws-BOB");
  });
});
