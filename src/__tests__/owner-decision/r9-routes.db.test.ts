/* eslint-disable @typescript-eslint/no-explicit-any -- route handler contexts and Prisma rows are untyped */
/**
 * Round-9 route regressions on real Postgres — the real route handlers and services; only the canonical auth
 * wrapper is replaced by a pass-through that supplies the verified workspace and actor (and captures the
 * declared capabilities):
 *   - PATCH /api/owner/do-not-repeat/[ruleId]: records the Owner override for the NAMED business only (another
 *     business stays held), never modifies the shared rule (Formal Consulting still blocks), refuses a business
 *     the rule does not apply to (404), a malformed id (404), a short reason (422 REASON_TOO_SHORT) and a
 *     different second reason (422 ALREADY_RECORDED); an identical retry is idempotent; OWNER_MANAGE;
 *   - POST /api/owner/operating-memory: the reserved Owner-override type is refused for UPSERT and EXPIRE, in
 *     any letter case — no row is written or expired.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r9-routes.db.test.ts
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params?: unknown) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params?: unknown) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { DoNotRepeatBlockedError, enforceDoNotRepeatForPromotion, recordDoNotRepeat } from "@/services/owner-mode/do-not-repeat.service";
import { loadOwnerGateConstraints } from "@/services/owner-mode/owner-action-gate.service";
import { DNR_OWNER_OVERRIDE_MEMORY_TYPE } from "@/domain/owner-mode/dnr-owner-override";
import { PATCH as patchDnr } from "@/app/api/owner/do-not-repeat/[ruleId]/route";
import { POST as postMemory } from "@/app/api/owner/operating-memory/route";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const actor = randomUUID();
const REASON = "A new supplier contract halves the cost per order.";

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `r9r-${actor}@example.com`, name: "R9 Routes QA", isActive: true, updatedAt: new Date() } });
});

async function business(workspaceId: string, name: string) {
  return (await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId)).id as string;
}
const ctx = (ws: string, body: unknown) => ({ verifiedActorId: actor, verifiedWorkspaceId: ws, request: new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }) });
const call = async (handler: any, ws: string, body: unknown, params?: Record<string, string>) => {
  // The route returns the canonical JSON envelope (the real wrapper serializes it).
  const res: { status: number; body: any } = await handler(ctx(ws, body), params);
  return { status: res.status, body: res.body };
};
const consulting = (ws: string) =>
  enforceDoNotRepeatForPromotion(randomUUID(), ws, {
    db: { recommendation: { findUnique: async () => ({ findingId: "f1" }) }, finding: { findFirst: async () => ({ impactArea: "marketing" }) }, ownerDoNotRepeatRule: db.ownerDoNotRepeatRule as any } as any,
  }).then(() => "allowed", (e: unknown) => (e instanceof DoNotRepeatBlockedError ? "blocked" : `error: ${String(e)}`));

describe("[db] PATCH /api/owner/do-not-repeat/[ruleId] — the business-scoped Owner override", () => {
  it("declares OWNER_MANAGE on a workspace-scoped route", () => {
    expect((patchDnr as any).__options).toMatchObject({ requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true });
  });

  it("[db] records for the named business only; another business stays held; the shared rule is untouched and Consulting still blocks", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R9 Route DNR A");
    const b = await business(ws, "QA R9 Route DNR B");
    const ruleA = await recordDoNotRepeat({ workspaceId: ws, businessId: a, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money", actorId: actor });
    const ruleB = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money", actorId: actor });

    const ok = await call(patchDnr, ws, { businessId: a, changedContextExplanation: REASON }, { ruleId: ruleA });
    expect(ok.status).toBe(200);
    expect((await loadOwnerGateConstraints(ws, a)).doNotRepeat.map((r) => r.id)).not.toContain(ruleA);
    expect((await loadOwnerGateConstraints(ws, b)).doNotRepeat.map((r) => r.id)).toEqual([ruleB]);
    expect((await db.ownerDoNotRepeatRule.findFirst({ where: { id: ruleA } }))!.changedContextExplanation).toBeNull();
    expect(await consulting(ws)).toBe("blocked");
    expect(await db.operatingMemoryEntry.count({ where: { workspaceId: ws, memoryType: DNR_OWNER_OVERRIDE_MEMORY_TYPE } })).toBe(1);

    // Business isolation: A's rule cannot be overridden "for" B.
    expect((await call(patchDnr, ws, { businessId: b, changedContextExplanation: REASON }, { ruleId: ruleA })).status).toBe(404);
    // Idempotent identical retry; a different second reason is refused with a stable code.
    expect((await call(patchDnr, ws, { businessId: a, changedContextExplanation: REASON }, { ruleId: ruleA })).status).toBe(200);
    const again = await call(patchDnr, ws, { businessId: a, changedContextExplanation: "Something else changed entirely since then." }, { ruleId: ruleA });
    expect(again).toMatchObject({ status: 422, body: { code: "ALREADY_RECORDED" } });
    expect(await db.operatingMemoryEntry.count({ where: { workspaceId: ws, memoryType: DNR_OWNER_OVERRIDE_MEMORY_TYPE } })).toBe(1);
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] a malformed rule id is 404; a short reason is 422 REASON_TOO_SHORT; a missing business is refused", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R9 Route DNR validation");
    const rule = await recordDoNotRepeat({ workspaceId: ws, businessId: a, memoryKey: "scope:sales", summary: "Discount blitz", reason: "Margin fell", actorId: actor });
    expect((await call(patchDnr, ws, { businessId: a, changedContextExplanation: REASON }, { ruleId: "not-a-uuid" })).status).toBe(404);
    expect(await call(patchDnr, ws, { businessId: a, changedContextExplanation: "short" }, { ruleId: rule })).toMatchObject({ status: 422, body: { code: "REASON_TOO_SHORT" } });
    await expect(call(patchDnr, ws, { changedContextExplanation: REASON }, { ruleId: rule })).rejects.toThrow();
    expect(await db.operatingMemoryEntry.count({ where: { workspaceId: ws } })).toBe(0);
    await teardownOwnerBusiness(a);
  });
});

describe("[db] POST /api/owner/operating-memory — the reserved Owner-override type is never written or expired here", () => {
  it("[db] UPSERT and EXPIRE of the reserved type (any case) are refused and change nothing; other types still work", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R9 Route memory");
    const rule = await recordDoNotRepeat({ workspaceId: ws, businessId: a, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money", actorId: actor });
    await call(patchDnr, ws, { businessId: a, changedContextExplanation: REASON }, { ruleId: rule });
    const before = await db.operatingMemoryEntry.findMany({ where: { workspaceId: ws, memoryType: DNR_OWNER_OVERRIDE_MEMORY_TYPE } });
    expect(before).toHaveLength(1);
    for (const memoryType of [DNR_OWNER_OVERRIDE_MEMORY_TYPE, DNR_OWNER_OVERRIDE_MEMORY_TYPE.toLowerCase()]) {
      const up = await call(postMemory, ws, { action: "UPSERT", memoryType, sourceId: rule, key: `forged:${a}`, summary: "forged" });
      expect(up.status).toBe(422);
      const ex = await call(postMemory, ws, { action: "EXPIRE", memoryType, sourceId: before[0].sourceId });
      expect(ex.status).toBe(422);
    }
    const after = await db.operatingMemoryEntry.findMany({ where: { workspaceId: ws, memoryType: DNR_OWNER_OVERRIDE_MEMORY_TYPE } });
    expect(after).toHaveLength(1);
    expect(after[0].validUntil).toEqual(before[0].validUntil);
    expect((await call(postMemory, ws, { action: "UPSERT", memoryType: "OWNER_NOTE", sourceId: "note-1", summary: "A normal note" })).status).toBe(201);
    await teardownOwnerBusiness(a);
  });
});
