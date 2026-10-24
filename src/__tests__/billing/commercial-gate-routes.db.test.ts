/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows and JSON bodies are untyped in route fixtures */
/**
 * Direct-API bypass proof: the REAL routes + REAL canonical-route-enforcement on real Postgres.
 * Auth is mocked at @/services/auth (same technique as the other real-route DB tests) so capability
 * derivation, workspace derivation, the commercial gate, handler and error mapping all run for real.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/billing/commercial-gate-routes.db.test.ts
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

const who = vi.hoisted(() => ({ actorId: "", workspaceId: "" }));

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: who.actorId, email: `${who.actorId}@example.com`, name: "Gate", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  });
  // Self-serve owner: admin_or_portfolio_manager narrowed to the owner bundle by workspaceRole "owner".
  const policy = () => ({
    userId: who.actorId,
    roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: who.workspaceId }],
    engagementMemberships: [],
    workspaceRole: "owner",
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { POST as financeDiagnose } from "@/app/api/owner/finance/businesses/[businessId]/diagnoses/route";
import { POST as createTask } from "@/app/api/owner/tasks/route";
import { GET as billingStatus } from "@/app/api/billing/status/route";
import { POST as vendorApprove } from "@/app/api/owner/vendor/[vendorId]/approve/route";
import { POST as vendorSuspend } from "@/app/api/owner/vendor/[vendorId]/suspend/route";
import { POST as poTransition } from "@/app/api/owner/procurement/purchase-orders/[poId]/transition/route";
import { POST as constraintsPost } from "@/app/api/owner/constraints/route";
import { POST as sopPost, PATCH as sopPatch } from "@/app/api/owner/sop-intelligence/route";
import { POST as spendPost } from "@/app/api/owner/budget/spend/route";
import { POST as guardrails } from "@/app/api/owner/guardrails/screen/route";
import { POST as arbitrate } from "@/app/api/owner/startup/sessions/[sessionId]/arbitrate/route";
import { POST as startupAnalysis } from "@/app/api/owner/startup/sessions/[sessionId]/analysis/route";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const period = (endDaysAgo: number, length = 20) => {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
};
const req = (path: string, method: string, body?: unknown) =>
  new NextRequest(`https://example.com${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] direct API bypass attempts against the dormant commercial gate", () => {
  const prev = process.env.BILLING_PAYWALL_ENFORCEMENT;
  const created: { ws: string[]; users: string[]; biz: string[] } = { ws: [], users: [], biz: [] };

  async function tenant() {
    const ws = randomUUID(), user = randomUUID();
    await db.user.create({ data: { id: user, email: `${user}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: `Gate ${ws.slice(0, 6)}`, slug: `gate-r-${ws.slice(0, 12)}` } });
    await db.workspaceMembership.create({ data: { userId: user, workspaceId: ws, role: "owner", isActive: true } });
    await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: user, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: ws, isActive: true } });
    const b = await createBusiness({ name: `Gate biz ${ws.slice(0, 6)}`, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, user, ws);
    created.ws.push(ws); created.users.push(user); created.biz.push(b.id as string);
    return { ws, user, business: b.id as string };
  }
  const as = (t: { ws: string; user: string }) => { who.actorId = t.user; who.workspaceId = t.ws; };
  async function snapshot(t: { ws: string; user: string; business: string }, endDaysAgo: number) {
    return createFinancialSnapshot(t.business, { ...period(endDaysAgo), currency: "INR", revenue: 500000, costOfGoods: 200000, fixedCosts: 100000, variableCosts: 50000, cashOnHand: 300000 } as any, t.user, t.ws);
  }
  const diagnose = (t: { business: string }, snapshotId: string) =>
    financeDiagnose(req(`/api/owner/finance/businesses/${t.business}/diagnoses`, "POST", { snapshotId }), ctx({ businessId: t.business }));

  beforeEach(() => { process.env.BILLING_PAYWALL_ENFORCEMENT = "on"; });
  afterEach(() => { if (prev === undefined) delete process.env.BILLING_PAYWALL_ENFORCEMENT; else process.env.BILLING_PAYWALL_ENFORCEMENT = prev; });
  afterAll(async () => {
    for (const b of created.biz) await teardownOwnerBusiness(b).catch(() => undefined);
    // Users/workspaces are intentionally left: audit_events (append-only) reference them. Throwaway DB only.
    await db.userRoleAssignment.deleteMany({ where: { userId: { in: created.users } } });
    await db.workspaceMembership.deleteMany({ where: { userId: { in: created.users } } });
  });

  it("unpaid owner: first diagnosis through the API is free; the second is a controlled 402, not a 500", async () => {
    const t = await tenant();
    as(t);
    const s1 = await snapshot(t, 10);
    const first = await diagnose(t, s1.id);
    expect(first.status).toBeLessThan(300);
    const s2 = await snapshot(t, 3);
    const second = await diagnose(t, s2.id);
    expect(second.status).toBe(402);
    const body = await second.json();
    expect(JSON.stringify(body)).toMatch(/PLAN_LIMIT_EXCEEDED|subscription is required|free first diagnosis/);
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|SELECT /i);
    expect(await db.ownerFinanceCycle.count({ where: { businessId: t.business } })).toBe(1);
  });

  it("unpaid owner: a PAID_CONTINUATION route (governed task) is refused with 402 before its handler or validation runs", async () => {
    const t = await tenant();
    as(t);
    const res = await createTask(req("/api/owner/tasks", "POST", {}), ctx());
    expect(res.status).toBe(402);
  });

  it("switch OFF: the same route is not a commercial denial (validation decides instead)", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
    const t = await tenant();
    as(t);
    const res = await createTask(req("/api/owner/tasks", "POST", {}), ctx());
    expect(res.status).not.toBe(402);
    expect(res.status).toBeLessThan(500);
  });

  it("billing management stays reachable for an unpaid owner while enforced", async () => {
    const t = await tenant();
    as(t);
    const res = await billingStatus(req("/api/billing/status", "GET"), ctx());
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.paywallEnforced).toBe(true);
    expect(body.entitled).toBe(false);
  });

  it("tenant isolation: a second tenant cannot diagnose (or consume the allowance of) another tenant's business", async () => {
    const a = await tenant();
    const b = await tenant();
    as(b);
    const sa = await snapshot(a, 5);
    const res = await diagnose(a, sa.id);
    expect(res.status).toBe(404);
    expect(await db.ownerFinanceCycle.count({ where: { businessId: a.business } })).toBe(0);
  });

  describe("owner decisions: semantic gating through the real routes (unpaid, enforcement ON)", () => {
    const U = "44444444-4444-4444-8444-444444444444";
    it("vendor approve and purchase-order transition are paid continuation (402); vendor suspend is a safety action and is never a commercial denial", async () => {
      const t = await tenant();
      as(t);
      expect((await vendorApprove(req(`/api/owner/vendor/${U}/approve`, "POST", {}), ctx({ vendorId: U }))).status).toBe(402);
      expect((await poTransition(req(`/api/owner/procurement/purchase-orders/${U}/transition`, "POST", {}), ctx({ poId: U }))).status).toBe(402);
      expect((await vendorSuspend(req(`/api/owner/vendor/${U}/suspend`, "POST", {}), ctx({ vendorId: U }))).status).not.toBe(402);
    });

    it("constraints: CREATE is free capture (never 402); ACCEPT and RESOLVE are paid (402)", async () => {
      const t = await tenant();
      as(t);
      expect((await constraintsPost(req("/api/owner/constraints", "POST", { action: "CREATE" }), ctx())).status).not.toBe(402);
      for (const action of ["ACCEPT", "RESOLVE"]) {
        expect((await constraintsPost(req("/api/owner/constraints", "POST", { action, recordId: U }), ctx())).status, action).toBe(402);
      }
    });

    it("SOP intelligence: assigning training and raising an alert stay free; recording completion is paid", async () => {
      const t = await tenant();
      as(t);
      expect((await sopPost(req("/api/owner/sop-intelligence", "POST", { action: "assign_training" }), ctx())).status).not.toBe(402);
      expect((await sopPatch(req("/api/owner/sop-intelligence", "PATCH", {}), ctx())).status).toBe(402);
    });

    it("budget spend entry is never route-denied (capture is free); the paid reassessment is decided inside the service", async () => {
      const t = await tenant();
      as(t);
      expect((await spendPost(req("/api/owner/budget/spend", "POST", {}), ctx())).status).not.toBe(402);
    });

    it("stateless calculators stay free", async () => {
      const t = await tenant();
      as(t);
      expect((await guardrails(req("/api/owner/guardrails/screen", "POST", {}), ctx())).status).not.toBe(402);
    });

    it("startup arbitration is paid continuation; startup analysis is not route-gated (its first run is free, gated inside the service) and pure capture is never denied", async () => {
      const t = await tenant();
      as(t);
      expect((await arbitrate(req(`/api/owner/startup/sessions/${U}/arbitrate`, "POST", {}), ctx({ sessionId: U }))).status).toBe(402);
      expect((await startupAnalysis(req(`/api/owner/startup/sessions/${U}/analysis`, "POST", { action: "RECORD_HYPOTHESIS_RESULT" }), ctx({ sessionId: U }))).status).not.toBe(402);
    });

    it("with enforcement OFF none of these is a commercial denial", async () => {
      process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
      const t = await tenant();
      as(t);
      expect((await vendorApprove(req(`/api/owner/vendor/${U}/approve`, "POST", {}), ctx({ vendorId: U }))).status).not.toBe(402);
      expect((await constraintsPost(req("/api/owner/constraints", "POST", { action: "ACCEPT", recordId: U }), ctx())).status).not.toBe(402);
      expect((await sopPatch(req("/api/owner/sop-intelligence", "PATCH", {}), ctx())).status).not.toBe(402);
      expect((await arbitrate(req(`/api/owner/startup/sessions/${U}/arbitrate`, "POST", {}), ctx({ sessionId: U }))).status).not.toBe(402);
    });
  });
});
