/**
 * A retried idempotency key replays the ORIGINAL client error, against a real database.
 *
 * Root cause proven here: services/idempotency.ts recorded a failed request as { error, errorName } and
 * replayed it as a plain Error, so every cached AppError lost its HTTP status and code: retrying a refused
 * key answered 500 instead of 402 (and the same for 404, 409, ...). The fix persists the status, code and
 * owner-safe message (never a 5xx message) and rebuilds the matching AppError subclass on replay.
 *
 * 402 runs through the real POST /api/decisions/intake handler (plan quota). 404 / 409 / 5xx run through a
 * handler wrapped by the real withCanonicalEnforcement, using the exact check → replay → record pattern
 * every idempotent route uses, so the replayed response is rendered by the production error path. Only the
 * session/policy facts are supplied (the same approach as decisions-intake-quota-replay.db.test.ts).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/idempotency-cached-error-replay.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import { ConflictError, NotFoundError } from "@/infra/errors";

const ids = vi.hoisted(() => ({ actorId: "", workspaceId: "" }));

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: ids.actorId, email: "idem-replay@example.com", name: "Idempotency Replay", isActive: true },
    sessionId: "idem-replay-session",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const policy = () => ({
    userId: ids.actorId,
    // decision:create is granted only by system_admin in ROLE_CAPABILITIES.
    roles: [{ role: "system_admin", scope: "workspace", scopeId: ids.workspaceId }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

import { POST as intakePost } from "@/app/api/decisions/intake/route";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { checkIdempotencyKey, recordIdempotencyError } from "@/services/idempotency";

type Outcome = "not_found" | "conflict" | "internal";
let executions = 0;

/** The idempotent-route pattern (decisions/*, intake, create): claim, replay a cached outcome, else run and record. */
const idempotentPost = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const key = ctx.request!.headers.get("idempotency-key")!;
    const body = (await ctx.request!.json()) as { outcome: Outcome };
    const check = await checkIdempotencyKey({ idempotencyKey: key, operationName: "replayProof", actorId: ctx.verifiedActorId, payload: body });
    if (!check.isNew && check.cachedResponse) return check.cachedResponse.body;
    if (!check.isNew && check.cachedError) throw check.cachedError;
    try {
      executions += 1;
      if (body.outcome === "not_found") throw new NotFoundError("Decision", "11111111-2222-3333-4444-555555555555");
      if (body.outcome === "conflict") throw new ConflictError("Decision is already being changed by someone else.");
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 (relation \"operator_items\" password=hunter2)");
    } catch (error) {
      await recordIdempotencyError(key, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  },
  { requireWorkspace: true }
);

async function call(
  handler: typeof intakePost,
  path: string,
  idempotencyKey: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", "idempotency-key": idempotencyKey, "x-workspace-id": ids.workspaceId }),
    body: JSON.stringify(body),
  });
  const res = (await handler(req, { params: Promise.resolve({}) })) as Response;
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** The response fields a client acts on: everything except the per-request correlation id. */
function shape(body: Record<string, unknown>) {
  const rest = { ...body };
  delete rest.correlationId;
  return rest;
}

async function usageSum(): Promise<number> {
  const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId: ids.workspaceId, key: "decision:create" } });
  return agg._sum.value ?? 0;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] a retried idempotency key replays the original client error", () => {
  const stamp = randomUUID().slice(0, 8);
  let plan: PlanEntitlementFixture | undefined;

  beforeAll(async () => {
    ids.actorId = randomUUID();
    ids.workspaceId = randomUUID();
    await db.user.create({ data: { id: ids.actorId, email: `idem-replay-${stamp}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ids.workspaceId, name: "Idempotency replay", slug: `idem-replay-${stamp}` } });
    await db.workspaceMembership.create({ data: { userId: ids.actorId, workspaceId: ids.workspaceId, role: "admin", isActive: true } });
    // decision:create is in the plan with a limit of 0: every intake is refused with 402.
    plan = await seedPlanEntitlement([ids.workspaceId], ["decision:create"], { "decision:create": 0 });
  });

  afterAll(async () => {
    try {
      await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { contains: stamp } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await db.operatorItem.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await db.usageEvent.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await cleanupPlanEntitlement(plan);
      await db.workspaceMembership.deleteMany({ where: { workspaceId: ids.workspaceId } });
      await db.workspace.deleteMany({ where: { id: ids.workspaceId } });
      await db.user.deleteMany({ where: { id: ids.actorId } });
    } catch {
      // best-effort cleanup (ephemeral test database)
    }
  });

  it("402: a plan-limit refusal replays as 402 PLAN_LIMIT_EXCEEDED with the same body; the retry creates and consumes nothing", async () => {
    const key = `intake-${stamp}-402`;
    const first = await call(intakePost, "/api/decisions/intake", key, { title: `Refused intake ${stamp}` });
    expect(first.status).toBe(402);
    expect(first.body.classification).toBe("handler_invocation_plan_limit_exceeded");

    const retry = await call(intakePost, "/api/decisions/intake", key, { title: `Refused intake ${stamp}` });
    expect(retry.status).toBe(402);
    expect(shape(retry.body)).toEqual(shape(first.body));
    expect(await db.operatorItem.count({ where: { workspaceId: ids.workspaceId } })).toBe(0);
    expect(await usageSum()).toBe(0);
    expect(await db.usageEvent.count({ where: { workspaceId: ids.workspaceId } })).toBe(0);
  }, 60_000);

  it.each([
    ["not_found", 404, "handler_invocation_not_found"],
    ["conflict", 409, "handler_invocation_conflict"],
  ] as const)("%s: the first response is %i and the retry replays the same status and body without re-running", async (outcome, status, classification) => {
    const key = `proof-${stamp}-${outcome}`;
    const before = executions;
    const first = await call(idempotentPost, "/api/replay-proof", key, { outcome });
    expect(first.status).toBe(status);
    expect(first.body.classification).toBe(classification);

    const retry = await call(idempotentPost, "/api/replay-proof", key, { outcome });
    expect(retry.status).toBe(status);
    expect(shape(retry.body)).toEqual(shape(first.body));
    expect(executions - before).toBe(1);
  }, 60_000);

  it("5xx: a cached internal failure replays as a generic 500 and its message is never stored or shown", async () => {
    const key = `proof-${stamp}-internal`;
    const first = await call(idempotentPost, "/api/replay-proof", key, { outcome: "internal" });
    expect(first.status).toBe(500);

    const retry = await call(idempotentPost, "/api/replay-proof", key, { outcome: "internal" });
    expect(retry.status).toBe(500);
    expect(retry.body.error).toBe(first.body.error);
    expect(JSON.stringify(retry.body)).not.toMatch(/ECONNREFUSED|hunter2|operator_items|10\.0\.0\.5/);

    const record = await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } });
    expect(record?.status).toBe("failed");
    expect(JSON.stringify(record?.responseBody)).not.toMatch(/ECONNREFUSED|hunter2|operator_items|10\.0\.0\.5/);
  }, 60_000);
});
