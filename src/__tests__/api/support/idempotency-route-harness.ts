/**
 * Shared real-DB fixtures for the idempotency route tests: a handler wrapped by the real
 * withCanonicalEnforcement that uses the exact claim → replay → run → record pattern every idempotent route
 * uses, tenant fixtures with real plans, and a caller that drives a route as a given tenant. The test file
 * that imports this mocks "@/services/auth" with session/policy facts read from the `ids` object it passes.
 */
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import { TooManyRequestsError } from "@/infra/errors";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { checkIdempotencyKey, recordIdempotencyError, recordIdempotencyResponse } from "@/services/idempotency";
import { withCapabilityQuota, reconcileExpiredCapabilityReservations, CAPABILITY_RESERVATION_TTL_MS } from "@/services/entitlement.service";

export interface Tenant {
  workspaceId: string;
  actorId: string;
}

export type HarnessMode = "rate_limited_once" | "reservation_expires_once" | "quota_write" | "ok";

/** Executions per idempotency key: proves whether a retry re-ran or replayed. */
export const executions = new Map<string, number>();

export function decisionRow(workspaceId: string, actorId: string, problem: string): Prisma.OperatorItemUncheckedCreateInput {
  return {
    id: randomUUID(), workspaceId, problem, action: "pricing", impactExpected: 1000, impactLow: 800, impactHigh: 1200,
    confidence: 0.5, priorityScore: 500, status: "pending", ownerUserId: actorId, createdByUserId: actorId, lastUpdatedByUserId: actorId, updatedAt: new Date(),
  };
}

/** An enforced quota-limited write (reserve, insert + settle). */
async function quotaWrite(workspaceId: string, actorId: string): Promise<void> {
  await withCapabilityQuota(workspaceId, "decision:create", async (reservation) => {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.operatorItem.create({ data: decisionRow(workspaceId, actorId, "Quota write") });
      await reservation.settle(tx);
    });
  });
}

/** A business write whose quota reservation was returned by the expiry sweep before it settled: 409. */
async function settleAfterExpiry(workspaceId: string, actorId: string): Promise<void> {
  await withCapabilityQuota(workspaceId, "decision:create", async (reservation) => {
    await reconcileExpiredCapabilityReservations(workspaceId, new Date(Date.now() + CAPABILITY_RESERVATION_TTL_MS + 60_000));
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.operatorItem.create({ data: decisionRow(workspaceId, actorId, "Late write") });
      await reservation.settle(tx);
    });
  });
}

/** The idempotent-route pattern every route uses: claim with the verified actor/workspace, replay, else run and record. */
export const harness = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const key = ctx.request!.headers.get("idempotency-key")!;
    const body = (await ctx.request!.json()) as { mode: HarnessMode; label: string };
    const check = await checkIdempotencyKey({
      idempotencyKey: key,
      operationName: "scopeProof",
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      payload: body,
    });
    if (!check.isNew && check.cachedResponse) return check.cachedResponse.body;
    if (!check.isNew && check.cachedError) throw check.cachedError;
    try {
      const run = (executions.get(key) ?? 0) + 1;
      executions.set(key, run);
      if (body.mode === "rate_limited_once" && run === 1) throw new TooManyRequestsError("Too many requests. Please try again shortly.");
      if (body.mode === "reservation_expires_once" && run === 1) await settleAfterExpiry(ctx.verifiedWorkspaceId, ctx.verifiedActorId);
      if (body.mode === "quota_write") await quotaWrite(ctx.verifiedWorkspaceId, ctx.verifiedActorId);
      const result = { label: body.label, workspaceId: ctx.verifiedWorkspaceId, run };
      await recordIdempotencyResponse(key, 200, result);
      return result;
    } catch (error) {
      await recordIdempotencyError(key, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  },
  { requireWorkspace: true }
);

export type RouteHandler = typeof harness;

/** Drive `handler` as `tenant` (the test's mocked session/policy read `ids`). */
export function makeCaller(ids: { actorId: string; workspaceId: string }) {
  return async function call(
    handler: RouteHandler,
    path: string,
    tenant: Tenant,
    key: string,
    body: Record<string, unknown>
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    ids.actorId = tenant.actorId;
    ids.workspaceId = tenant.workspaceId;
    const req = new NextRequest(new URL(`http://localhost:3000${path}`), {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", "idempotency-key": key, "x-workspace-id": tenant.workspaceId }),
      body: JSON.stringify(body),
    });
    const res = (await handler(req, { params: Promise.resolve({}) })) as Response;
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
}

/** Tenants with a real user, workspace, membership and (optionally) a decision:create plan. */
export function tenantFixtures(stamp: string) {
  const tenants: Tenant[] = [];
  const plans: PlanEntitlementFixture[] = [];
  return {
    plans,
    async freshTenant(limit: number | null | "no-subscription"): Promise<Tenant> {
      const t = { workspaceId: randomUUID(), actorId: randomUUID() };
      const n = tenants.length;
      await db.user.create({ data: { id: t.actorId, email: `idem-${n}-${stamp}@example.com`, isActive: true, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: t.workspaceId, name: `Idem ${n}`, slug: `idem-${n}-${stamp}` } });
      await db.workspaceMembership.create({ data: { userId: t.actorId, workspaceId: t.workspaceId, role: "admin", isActive: true } });
      if (limit !== "no-subscription") plans.push(await seedPlanEntitlement([t.workspaceId], ["decision:create"], { "decision:create": limit }));
      tenants.push(t);
      return t;
    },
    async cleanup(): Promise<void> {
      const wsIds = tenants.map((t) => t.workspaceId);
      try {
        await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { contains: stamp } } });
        await db.auditEvent.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await db.operatorItem.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await db.usageEvent.deleteMany({ where: { workspaceId: { in: wsIds } } });
        for (const p of plans) await cleanupPlanEntitlement(p);
        await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await db.workspace.deleteMany({ where: { id: { in: wsIds } } });
        await db.user.deleteMany({ where: { id: { in: tenants.map((t) => t.actorId) } } });
      } catch {
        // best-effort cleanup (ephemeral test database)
      }
    },
  };
}
