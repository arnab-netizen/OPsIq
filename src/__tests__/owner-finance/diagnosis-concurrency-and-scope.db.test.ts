/**
 * OBQ hostile checks on the diagnosis path (REAL route + REAL wrapper, auth mocked as in
 * src/__tests__/owner-strategy/duplicate-period-logging.db.test.ts).
 *
 * 1. Concurrent diagnoses of one business (double submit, or a correction racing a re-run) all succeed with distinct,
 *    gap-free cycle sequence numbers. Root cause fixed: the sequence was read outside the transaction, so the loser of
 *    the race hit the (business, sequence) unique constraint and the owner got a failed request.
 * 2. Naming another tenant's business id spends none of that business's rate-limit budget and reveals nothing (404).
 *    Root cause fixed: the limiter was keyed on the client-supplied id BEFORE ownership was checked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

let actorForMock = randomUUID();
let workspaceForMock = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: actorForMock, email: "diag-scope@example.com", name: "Diag Scope", isActive: true },
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

const post = (url: string, body: unknown) =>
  new NextRequest(`https://example.com${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] diagnosis: concurrency and tenant scope", () => {
  const made: Array<{ actorId: string; workspaceId: string; businessId: string }> = [];

  async function tenant(label: string) {
    const actorId = randomUUID();
    const workspaceId = randomUUID();
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: label, slug: `${label}-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    const { createBusiness } = await import("@/services/founder-recovery/business.service");
    const b = await createBusiness(
      { name: `${label} QA`, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actorId, workspaceId,
    );
    made.push({ actorId, workspaceId, businessId: b.id });
    return { actorId, workspaceId, businessId: b.id };
  }

  beforeEach(() => { made.length = 0; });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const m of made) {
      await db.rateLimitBucket.deleteMany({ where: { key: `diag:${m.businessId}` } });
      await teardownOwnerBusiness(m.businessId);
      await db.auditEvent.deleteMany({ where: { actorId: m.actorId } });
      await db.workspaceMembership.deleteMany({ where: { userId: m.actorId } });
      await db.workspace.deleteMany({ where: { id: m.workspaceId } });
      await db.user.deleteMany({ where: { id: m.actorId } });
    }
  });

  it("[db] concurrent diagnoses all succeed with distinct consecutive cycle numbers", async () => {
    const t = await tenant("diagseq");
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
    const snap = await createFinancialSnapshot(
      t.businessId,
      { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 100000, fixedCosts: 30000, variableCosts: 20000, cashOnHand: 15000, evidenceQuality: "GOOD_ESTIMATE" },
      t.actorId, t.workspaceId,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => runFinanceDiagnosis(t.businessId, (snap as { id: string }).id, t.actorId, t.workspaceId)),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const seq = (await db.ownerFinanceCycle.findMany({ where: { businessId: t.businessId }, select: { sequenceNumber: true }, orderBy: { sequenceNumber: "asc" } })).map((c) => c.sequenceNumber);
    expect(seq).toEqual([1, 2, 3, 4, 5]);
  });

  it("[db] simultaneous snapshot submits for one period: exactly one row, the rest are the 409 conflict (never a 500)", async () => {
    const t = await tenant("snaprace");
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const input = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 50000, fixedCosts: 20000, cashOnHand: 5000, evidenceQuality: "GOOD_ESTIMATE" as const };
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => createFinancialSnapshot(t.businessId, input, t.actorId, t.workspaceId)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ statusCode: 409 });
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(1);
  });

  it("[db] naming another tenant's business is a 404 and spends none of its rate-limit budget", async () => {
    const victim = await tenant("victim");
    const attacker = await tenant("attacker");
    actorForMock = attacker.actorId;
    workspaceForMock = attacker.workspaceId;
    const { POST } = await import("@/app/api/owner/finance/businesses/[businessId]/diagnoses/route");
    for (let i = 0; i < 12; i++) {
      const res = await POST(post(`/api/owner/finance/businesses/${victim.businessId}/diagnoses`, { snapshotId: randomUUID() }), { params: Promise.resolve({ businessId: victim.businessId }) });
      expect(res.status).toBe(404); // never 429: the foreign id is refused before any budget is touched
    }
    expect(await db.rateLimitBucket.count({ where: { key: `diag:${victim.businessId}` } })).toBe(0);
  });
});
