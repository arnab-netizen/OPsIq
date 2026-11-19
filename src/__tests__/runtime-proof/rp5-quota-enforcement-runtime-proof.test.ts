/**
 * PHASE RP5: Quota Enforcement Runtime Proof
 *
 * Requirement (execution_state.json, "Quota Enforcement Runtime Proof"): a caller exceeding quota is refused and
 * not granted access. The original note said "must get 429"; that status belonged to the in-memory
 * `tierEnforcement()` middleware, which is now dead code that throws if wired (src/middleware/tier-enforcement.ts).
 * The authoritative current denial contract is `PlanLimitError`: HTTP 402, code PLAN_LIMIT_EXCEEDED, surfaced by the
 * canonical wrapper as classification `handler_invocation_plan_limit_exceeded` (src/infra/errors.ts;
 * docs/opsiq/commercial/PAYWALL_BOUNDARY.md §2.8 "Never a raw 500").
 *
 * Quota surfaces exercised, all through real code on real Postgres:
 *   1. DB-backed plan limits — src/services/entitlement.service.ts `assertCapability` (PlanCapability.limit vs the
 *      sum of UsageEvent rows in the current subscription period) + `trackUsage`, consumed by the real
 *      POST /api/recommendations route (real `withCanonicalEnforcement`, real session) -> createRecommendation,
 *      which checks `generate_recommendation` and records one usage event per created recommendation.
 *   2. The in-memory tier quota route — src/app/api/entitlement/quota (GET usage / POST increment) through the
 *      real wrapper, backed by src/services/entitlement.ts.
 *   3. src/middleware/tier-enforcement.ts — `checkTierEnforcement` / `incrementQuota` and the dead `tierEnforcement()`.
 * Only the Next.js cookie jar is stubbed, to carry the seeded session token.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "opsiq_session" && cookieJar.token ? { value: cookieJar.token } : undefined),
  }),
}));

import { db, getDbInstance } from "@/lib/db";
import { ROLES, type RoleName } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { assertCapability, getUsage } from "@/services/entitlement.service";
import { clearAllEntitlementData, setSubscriptionTier, SubscriptionTier, TIER_CONFIGS } from "@/services/entitlement";
import { checkTierEnforcement, incrementQuota, resetAllQuota, tierEnforcement } from "@/middleware/tier-enforcement";
import { getTierConfig } from "@/lib/tier-config";
import { POST as postRecommendation } from "@/app/api/recommendations/route";
import { GET as getQuota, POST as postQuota } from "@/app/api/entitlement/quota/route";

const QUOTA_KEY = "generate_recommendation";
const LIMIT = 3;
const PLAN_LIMIT_CLASSIFICATION = "handler_invocation_plan_limit_exceeded";

type Tenant = { workspaceId: string; engagementId: string; findingId: string; token: string; userId: string };

async function seedTenant(label: string, opts: { role?: RoleName } = {}): Promise<Tenant> {
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const evidenceId = randomUUID();
  const findingId = randomUUID();
  const userId = randomUUID();
  const token = `rp5-${randomUUID()}`;
  await db.workspace.create({ data: { id: workspaceId, name: `RP5 ${label}`, slug: `rp5-${workspaceId}` } });
  await db.clientAccount.create({ data: { id: clientId, workspaceId, name: `RP5 client ${label}`, updatedAt: new Date() } });
  await db.engagement.create({
    data: { id: engagementId, code: `RP5-${engagementId.substring(0, 8)}`, title: `RP5 ${label}`, clientId, workspaceId, serviceTier: "standard", engagementMode: "advisory", updatedAt: new Date() },
  });
  await db.evidence.create({ data: { id: evidenceId, engagementId, title: "RP5 evidence", description: "RP5 evidence", source: "interview", status: "validated", updatedAt: new Date() } });
  await db.finding.create({
    data: { id: findingId, engagementId, primaryEvidenceId: evidenceId, title: "RP5 finding", summary: "RP5 finding", severity: "high", impactArea: "operations", updatedAt: new Date() },
  });
  await db.user.create({ data: { id: userId, email: `rp5-${userId}@example.com`, name: `RP5 ${label}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({
    data: { id: randomUUID(), userId, role: opts.role ?? ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId, isActive: true },
  });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { workspaceId, engagementId, findingId, token, userId };
}

/** Plan with `decision:create` unlimited (the route-level gate) and `generate_recommendation` limited to `limit`. */
async function seedPlan(workspaceId: string, opts: { limit: number | null; status?: string; periodStart?: Date; omitQuotaKey?: boolean }): Promise<void> {
  const planId = randomUUID();
  const billingAccountId = randomUUID();
  await db.plan.create({ data: { id: planId, name: `rp5-plan-${planId}`, priceMonthly: 0, priceYearly: 0 } });
  await db.planCapability.create({ data: { id: randomUUID(), planId, key: CAPABILITIES.DECISION_CREATE, limit: null } });
  if (!opts.omitQuotaKey) {
    await db.planCapability.create({ data: { id: randomUUID(), planId, key: QUOTA_KEY, limit: opts.limit } });
  }
  await db.billingAccount.create({ data: { id: billingAccountId, workspaceId, providerCustomerId: `rp5-${billingAccountId}` } });
  await db.subscription.create({
    data: {
      id: randomUUID(),
      billingAccountId,
      planId,
      status: opts.status ?? "active",
      currentPeriodStart: opts.periodStart ?? new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000),
    },
  });
}

async function createRec(t: Tenant, title: string, engagementId = t.engagementId, findingId = t.findingId) {
  cookieJar.token = t.token;
  const req = new NextRequest("http://localhost/api/recommendations", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `rp5-${randomUUID()}` },
    body: JSON.stringify({ engagementId, findingId, title, summary: "s", priority: "high", type: "fix", rationale: "r" }),
  });
  const res = await postRecommendation(req, { params: Promise.resolve({}) });
  return { status: res.status, body: await res.json() };
}

const usageSum = async (workspaceId: string, key = QUOTA_KEY) => {
  const rows = await db.usageEvent.findMany({ where: { workspaceId, key }, select: { value: true } });
  return rows.reduce((sum, r) => sum + r.value, 0);
};
const recCount = (workspaceId: string) => db.recommendation.count({ where: { workspaceId } });
const createdAuditCount = (workspaceId: string) => db.auditEvent.count({ where: { workspaceId, eventName: "recommendation.created" } });

async function quotaCall(method: "GET" | "POST", token: string | undefined, body?: unknown) {
  cookieJar.token = token;
  const req = new NextRequest("http://localhost/api/entitlement/quota", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const res = await (method === "GET" ? getQuota : postQuota)(req, { params: Promise.resolve({}) });
  return { status: res.status, body: await res.json() };
}

describe("Phase RP5: Quota Enforcement Runtime Proof (real quota code, real DB)", () => {
  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(() => {
    cookieJar.token = undefined;
    clearAllEntitlementData();
    resetAllQuota();
  });

  describe("DB-backed plan limit (entitlement.service) consumed by POST /api/recommendations", () => {
    it(`with limit N=${LIMIT}: N creates succeed, N+1 is refused 402 plan-limit with the counter, rows and audit trail unchanged`, async () => {
      const t = await seedTenant("sequential");
      await seedPlan(t.workspaceId, { limit: LIMIT });

      for (let i = 0; i < LIMIT; i++) {
        const ok = await createRec(t, `RP5 seq ${i}`);
        expect(ok.status).toBe(201);
        expect(await usageSum(t.workspaceId)).toBe(i + 1);
      }

      const over = await createRec(t, "RP5 seq over");
      expect(over.status).toBe(402);
      expect(over.body).toMatchObject({ classification: PLAN_LIMIT_CLASSIFICATION, error: `Usage ${LIMIT} exceeds limit ${LIMIT}` });

      expect(await usageSum(t.workspaceId)).toBe(LIMIT);
      expect(await recCount(t.workspaceId)).toBe(LIMIT);
      expect(await createdAuditCount(t.workspaceId)).toBe(LIMIT);
      expect(await db.recommendation.count({ where: { workspaceId: t.workspaceId, title: "RP5 seq over" } })).toBe(0);
      expect(await assertCapability(t.workspaceId, QUOTA_KEY)).toEqual({
        allowed: false,
        reason: `Usage ${LIMIT} exceeds limit ${LIMIT}`,
        usage: LIMIT,
        limit: LIMIT,
      });
    });

    it("exhausting one workspace's quota does not consume or block another workspace's quota", async () => {
      const a = await seedTenant("isolation-a");
      const b = await seedTenant("isolation-b");
      await seedPlan(a.workspaceId, { limit: LIMIT });
      await seedPlan(b.workspaceId, { limit: LIMIT });

      for (let i = 0; i < LIMIT; i++) expect((await createRec(a, `RP5 iso a ${i}`)).status).toBe(201);
      expect((await createRec(a, "RP5 iso a over")).status).toBe(402);

      expect(await usageSum(b.workspaceId)).toBe(0);
      expect(await assertCapability(b.workspaceId, QUOTA_KEY)).toEqual({ allowed: true, usage: 0, limit: LIMIT });
      expect((await createRec(b, "RP5 iso b 0")).status).toBe(201);
      expect(await usageSum(b.workspaceId)).toBe(1);
      expect(await recCount(b.workspaceId)).toBe(1);
      expect(await usageSum(a.workspaceId)).toBe(LIMIT);
      expect(await recCount(a.workspaceId)).toBe(LIMIT);
    });

    it("usage is counted only inside the current subscription period; earlier usage events do not consume quota", async () => {
      const t = await seedTenant("period");
      const periodStart = new Date(Date.now() - 86_400_000);
      await seedPlan(t.workspaceId, { limit: LIMIT, periodStart });
      await db.usageEvent.create({
        data: { id: randomUUID(), workspaceId: t.workspaceId, key: QUOTA_KEY, value: LIMIT * 10, timestamp: new Date(periodStart.getTime() - 3_600_000) },
      });

      expect(await getUsage(t.workspaceId)).toEqual([]);
      expect(await assertCapability(t.workspaceId, QUOTA_KEY)).toEqual({ allowed: true, usage: 0, limit: LIMIT });
      expect((await createRec(t, "RP5 period 0")).status).toBe(201);
      expect(await getUsage(t.workspaceId)).toEqual([{ key: QUOTA_KEY, value: 1 }]);
    });

    it("fails closed: no subscription, a non-active subscription, or a plan without the capability key all refuse 402 and write nothing", async () => {
      const noSub = await seedTenant("no-subscription");
      const canceled = await seedTenant("canceled");
      const missingKey = await seedTenant("missing-key");
      await seedPlan(canceled.workspaceId, { limit: LIMIT, status: "canceled" });
      await seedPlan(missingKey.workspaceId, { limit: LIMIT, omitQuotaKey: true });

      for (const [t, title] of [[noSub, "RP5 no sub"], [canceled, "RP5 canceled"], [missingKey, "RP5 missing key"]] as const) {
        const res = await createRec(t, title);
        expect(res.status).toBe(402);
        expect(res.body).toMatchObject({ classification: PLAN_LIMIT_CLASSIFICATION });
        expect(await recCount(t.workspaceId)).toBe(0);
        expect(await usageSum(t.workspaceId)).toBe(0);
      }
      expect(await assertCapability(missingKey.workspaceId, QUOTA_KEY)).toEqual({ allowed: false, reason: `Capability '${QUOTA_KEY}' not found in plan` });
      expect(await assertCapability(canceled.workspaceId, QUOTA_KEY)).toEqual({ allowed: false, reason: "Subscription is canceled, not active" });
    });

    it("a null plan limit is unlimited: creates beyond N keep succeeding and every one is counted", async () => {
      const t = await seedTenant("unlimited");
      await seedPlan(t.workspaceId, { limit: null });

      for (let i = 0; i < LIMIT + 2; i++) expect((await createRec(t, `RP5 unl ${i}`)).status).toBe(201);

      expect(await usageSum(t.workspaceId)).toBe(LIMIT + 2);
      expect(await assertCapability(t.workspaceId, QUOTA_KEY)).toEqual({ allowed: true, usage: LIMIT + 2, limit: null });
    });

    it("cross-workspace parent: a create in workspace B naming workspace A's engagement is refused 404; no row and no quota consumed in either workspace", async () => {
      const a = await seedTenant("parent-a");
      const b = await seedTenant("parent-b");
      await seedPlan(a.workspaceId, { limit: LIMIT });
      await seedPlan(b.workspaceId, { limit: LIMIT });

      const res = await createRec(b, "RP5 cross parent", a.engagementId, a.findingId);

      expect(res.status).toBe(404);
      expect(await recCount(a.workspaceId)).toBe(0);
      expect(await recCount(b.workspaceId)).toBe(0);
      expect(await db.recommendation.count({ where: { engagementId: a.engagementId } })).toBe(0);
      expect(await usageSum(a.workspaceId)).toBe(0);
      expect(await usageSum(b.workspaceId)).toBe(0);
    });
  });

  describe("in-memory tier quota route /api/entitlement/quota (real canonical wrapper)", () => {
    const FREE_EXPERIMENTS = TIER_CONFIGS[SubscriptionTier.FREE].experimentsPerMonth;

    it("FREE tier: N increments succeed, N+1 is refused 402 plan-limit and the counter stays at N", async () => {
      const t = await seedTenant("quota-route");

      for (let i = 0; i < FREE_EXPERIMENTS; i++) {
        const ok = await quotaCall("POST", t.token, { type: "experiment" });
        expect(ok.status).toBe(200);
        expect(ok.body.usage.experimentsCreated).toBe(i + 1);
      }
      const over = await quotaCall("POST", t.token, { type: "experiment" });
      expect(over.status).toBe(402);
      expect(over.body).toMatchObject({ classification: PLAN_LIMIT_CLASSIFICATION, error: "Quota exceeded for experiments" });

      const after = await quotaCall("GET", t.token);
      expect(after.status).toBe(200);
      expect(after.body.usage.experimentsCreated).toBe(FREE_EXPERIMENTS);
      expect(after.body.remaining.experiments).toBe(0);
    });

    it("N+k PARALLEL requests through the wrapper: exactly N succeed, k are refused 402 (not 500), and the counter ends at N", async () => {
      const t = await seedTenant("quota-parallel");
      const k = 5;

      const results = await Promise.all(Array.from({ length: FREE_EXPERIMENTS + k }, () => quotaCall("POST", t.token, { type: "experiment" })));

      expect(results.filter((r) => r.status === 200)).toHaveLength(FREE_EXPERIMENTS);
      expect(results.filter((r) => r.status === 402)).toHaveLength(k);
      const after = await quotaCall("GET", t.token);
      expect(after.body.usage.experimentsCreated).toBe(FREE_EXPERIMENTS);
    });

    it("another workspace's quota is unaffected, and the tier is per-workspace (PRO raises only that workspace's limit)", async () => {
      const a = await seedTenant("quota-iso-a");
      const b = await seedTenant("quota-iso-b");
      for (let i = 0; i < FREE_EXPERIMENTS; i++) expect((await quotaCall("POST", a.token, { type: "experiment" })).status).toBe(200);
      expect((await quotaCall("POST", a.token, { type: "experiment" })).status).toBe(402);

      const bUsage = await quotaCall("GET", b.token);
      expect(bUsage.body.usage.experimentsCreated).toBe(0);
      expect(bUsage.body.remaining.experiments).toBe(FREE_EXPERIMENTS);
      expect((await quotaCall("POST", b.token, { type: "experiment" })).status).toBe(200);

      setSubscriptionTier(b.workspaceId, SubscriptionTier.PRO);
      const bPro = await quotaCall("GET", b.token);
      expect(bPro.body.limits.experiments).toBe(TIER_CONFIGS[SubscriptionTier.PRO].experimentsPerMonth);
      const aFree = await quotaCall("GET", a.token);
      expect(aFree.body.limits.experiments).toBe(FREE_EXPERIMENTS);
      expect(aFree.body.usage.experimentsCreated).toBe(FREE_EXPERIMENTS);
    });

    it("the quota route is itself capability-gated: no session is 401 and a member without owner:view is 403; neither touches the counter", async () => {
      const t = await seedTenant("quota-gate", { role: ROLES.BEGINNER_CONSULTANT });

      expect((await quotaCall("POST", undefined, { type: "experiment" })).status).toBe(401);
      expect((await quotaCall("POST", t.token, { type: "experiment" })).status).toBe(403);
      expect((await quotaCall("GET", t.token)).status).toBe(403);

      // Grant owner:view and observe the counter was never incremented by the refused calls.
      await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: t.userId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: t.workspaceId, isActive: true } });
      const usage = await quotaCall("GET", t.token);
      expect(usage.status).toBe(200);
      expect(usage.body.usage.experimentsCreated).toBe(0);
    });
  });

  describe("tier-enforcement middleware (src/middleware/tier-enforcement.ts)", () => {
    it("checkTierEnforcement allows exactly the tier's actionsPerMonth, refuses the next, and keeps workspaces separate", () => {
      const wsA = randomUUID();
      const wsB = randomUUID();
      const limit = getTierConfig("free").limits.actionsPerMonth;

      for (let i = 0; i < limit; i++) {
        expect(checkTierEnforcement(wsA, "free", "POST /api/actions")).toEqual({ allowed: true });
        incrementQuota(wsA, "POST /api/actions");
      }
      expect(checkTierEnforcement(wsA, "free", "POST /api/actions")).toEqual({
        allowed: false,
        error: `Quota exceeded: ${limit} (free tier) actions per month`,
      });

      expect(checkTierEnforcement(wsB, "free", "POST /api/actions")).toEqual({ allowed: true });
      expect(checkTierEnforcement(wsA, "pro", "POST /api/actions")).toEqual({ allowed: true });
    });

    it("the dead tierEnforcement() middleware fails closed: mutating requests throw instead of trusting x-workspace-id; a missing header is 403; reads pass through", async () => {
      const mw = tierEnforcement();
      const passthrough = NextResponse.json({ ok: true });

      const claimed = new NextRequest("http://localhost/api/x", { method: "POST", headers: { "x-workspace-id": randomUUID() } });
      await expect(mw(claimed, passthrough)).rejects.toThrow("tierEnforcement() is dead middleware and must not be wired");

      const noHeader = await mw(new NextRequest("http://localhost/api/x", { method: "POST" }), passthrough);
      expect(noHeader.status).toBe(403);

      const read = await mw(new NextRequest("http://localhost/api/x", { method: "GET" }), passthrough);
      expect(read).toBe(passthrough);
    });
  });
});
