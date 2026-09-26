/**
 * Duplicate-period 409 through the REAL route + REAL canonical-route-enforcement (production polish).
 *
 * Production acceptance: a second Strategy scenario for the same business and assessment period
 * correctly returned 409, but the logs showed the conflict at ERROR plus
 * "[WRAPPER_FAILED] [object Object]". This drives POST
 * /api/owner/strategy/businesses/[businessId]/snapshots twice against a real database (auth
 * mocked as in src/__tests__/api/growth/pricing-tiers-real-route.db.test.ts) and proves:
 *  - the 409 and its owner-safe message are unchanged;
 *  - the expected conflict is logged at WARN with structured metadata, never at ERROR;
 *  - no log line contains "[object Object]";
 *  - a genuine unexpected failure still logs [WRAPPER_FAILED] at ERROR with the real Error.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/duplicate-period-logging.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

let actorForMock = randomUUID();
let workspaceForMock = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: actorForMock, email: "dup-period@example.com", name: "Dup Period", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  });
  const policy = () => ({
    userId: actorForMock,
    roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: workspaceForMock }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(`https://example.com${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SCENARIO = {
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  currency: "INR",
  optionName: "Second van",
  currentRevenue: 500000,
  expectedRevenueChange: 30000,
  costChange: 12000,
  investmentRequired: 150000,
  timeToImpactMonths: 2,
  cashAvailable: 100000,
  riskLevel: "medium",
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] duplicate-period 409 — REAL route + wrapper logging", () => {
  let workspaceId: string;
  let actorId: string;
  let businessId: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceId = randomUUID();
    actorForMock = actorId;
    workspaceForMock = workspaceId;
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Dup WS", slug: `dup-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    const { createBusiness } = await import("@/services/founder-recovery/business.service");
    const b = await createBusiness(
      { name: "Dup Period QA", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actorId,
      workspaceId
    );
    businessId = b.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await teardownOwnerBusiness(businessId);
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] the second identical period is a 409 with the owner-safe message, logged at WARN — never ERROR or [object Object]", async () => {
    const { POST } = await import("@/app/api/owner/strategy/businesses/[businessId]/snapshots/route");
    const url = `/api/owner/strategy/businesses/${businessId}/snapshots`;
    const params = { params: Promise.resolve({ businessId }) };

    const first = await POST(post(url, SCENARIO), params);
    expect(first.status).toBe(201);

    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");
    const lines: string[] = [];
    for (const m of ["error", "warn", "log", "info"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
    }

    const second = await POST(post(url, SCENARIO), params);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe("A strategy scenario for this business and assessment period already exists. Edit it instead of creating a duplicate.");

    // Structured WARN with the diagnostic metadata kept.
    expect(warn).toHaveBeenCalledWith(
      "[WRAPPER_CLIENT_REJECTION]",
      expect.objectContaining({ statusCode: 409, classification: "handler_invocation_conflict", stage: "handler_invocation", errorMessage: body.error })
    );
    expect(warn).toHaveBeenCalledWith("Handler rejected request", expect.objectContaining({ errorMessage: body.error }));
    // Nothing about this expected conflict is logged as a server failure.
    const errorMessages = error.mock.calls.map((c) => String(c[0]));
    expect(errorMessages).not.toContain("[WRAPPER_FAILED]");
    expect(errorMessages).not.toContain("Handler failed");
    logger.flush();
    expect(lines.join("\n")).not.toContain("[object Object]");

    // Still exactly one scenario for that period.
    expect(await db.ownerStrategySnapshot.count({ where: { businessId } })).toBe(1);
  });

  it("[db] a genuine unexpected failure still logs [WRAPPER_FAILED] at ERROR with the real Error", async () => {
    const snapshotService = await import("@/services/owner-strategy/snapshot.service");
    vi.spyOn(snapshotService, "createStrategySnapshot").mockRejectedValueOnce(new Error("simulated storage failure"));
    const { POST } = await import("@/app/api/owner/strategy/businesses/[businessId]/snapshots/route");
    const error = vi.spyOn(logger, "error");
    const res = await POST(post(`/api/owner/strategy/businesses/${businessId}/snapshots`, SCENARIO), { params: Promise.resolve({ businessId }) });
    expect(res.status).toBe(500);
    const call = error.mock.calls.find((c) => c[0] === "[WRAPPER_FAILED]");
    expect(call).toBeDefined();
    expect(call![1]).toBeInstanceOf(Error);
    expect((call![1] as Error).message).toBe("simulated storage failure");
    expect(call![2]).toEqual(expect.objectContaining({ statusCode: 500 }));
  });
});
