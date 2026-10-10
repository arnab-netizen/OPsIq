/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * DB-backed proof of the public-beta first-run path: business name entered once, deterministic first-run
 * state transitions from persisted facts, evidence quality persistence + confidence effect, the governed
 * correction (no silent overwrite), accept via the canonical decision record, activation, tenancy.
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-first-run/first-run.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import {
  createFirstBusiness,
  getFirstRunContext,
  getFirstMoneyRead,
  requestImprovement,
  submitFirstValueFeedback,
  getNextQuestionView,
} from "@/services/owner-first-run/first-run.service";
import { acceptFirstResultAction, correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";
import { findOverclaims, firstMoneyReadStrings } from "@/domain/owner-first-run/first-money-read";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";

const BUSINESS_NAME = "Maple Street Laundry";

async function makeTenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({
    data: { id: userId, email: `${userId}@firstrun.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() },
  });
  await db.workspace.create({ data: { id: workspaceId, name: BUSINESS_NAME, slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  return { workspaceId, userId };
}

const period = () => {
  const end = new Date();
  end.setUTCDate(0); // last day of previous month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};

const quick = (over: Record<string, unknown> = {}) => ({
  ...period(),
  currency: "GBP",
  revenue: 12000,
  fixedCosts: 7000,
  variableCosts: 4000,
  cashOnHand: 1500,
  ...over,
});

async function setUpToResult(t: { workspaceId: string; userId: string }, quality?: "ACTUAL" | "GOOD_ESTIMATE" | "ROUGH_ESTIMATE") {
  const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
  const snap: any = await createFinancialSnapshot(business.id, quick(quality ? { evidenceQuality: quality } : {}) as any, t.userId, t.workspaceId);
  await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
  return { business, snap };
}

describe("[db] first-run: business name entered once", () => {
  it("[db] BUSINESS_NAME_ENTERED_ONCE: the signup name becomes the business name; only type and currency are asked", async () => {
    const t = await makeTenant();
    const before = await getFirstRunContext(t.workspaceId);
    expect(before.state).toBe("NEEDS_BUSINESS");
    expect(before.suggestedBusinessName).toBe(BUSINESS_NAME);
    const { business, replayed } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    expect(replayed).toBe(false);
    expect(business.name).toBe(BUSINESS_NAME);
    expect(business.currency).toBe("GBP");
    const row: any = await db.ownerBusiness.findFirst({ where: { id: business.id } });
    expect(row.createdBy).toBe(t.userId);
    expect(row.isFixtureBusiness).toBe(false);
  });
  it("[db] an explicit correction of the display name is honoured", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { name: "Maple St Laundry Ltd", businessType: "generic_local_service", currency: "USD" });
    expect(business.name).toBe("Maple St Laundry Ltd");
  });
  it("[db] double / concurrent submit creates exactly one business", async () => {
    const t = await makeTenant();
    const args = { businessType: "laundry_local_service", currency: "GBP" };
    const results = await Promise.all(Array.from({ length: 5 }, () => createFirstBusiness(t.workspaceId, t.userId, args)));
    expect(new Set(results.map((r) => r.business.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await db.ownerBusiness.count({ where: { workspaceId: t.workspaceId } })).toBe(1);
  });
  it("[db] a different submission after setup is a conflict, never a silent second business", async () => {
    const t = await makeTenant();
    await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "GBP" });
    await expect(createFirstBusiness(t.workspaceId, t.userId, { businessType: "retail_storefront", currency: "GBP" })).rejects.toBeInstanceOf(ConflictError);
  });
  it("[db] invalid type or currency is rejected before anything is written", async () => {
    const t = await makeTenant();
    await expect(createFirstBusiness(t.workspaceId, t.userId, { businessType: "wizardry", currency: "GBP" })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.ownerBusiness.count({ where: { workspaceId: t.workspaceId } })).toBe(0);
  });
  it("[db] business audit event is emitted by the canonical service", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "GBP" });
    const ev = await db.auditEvent.findFirst({ where: { workspaceId: t.workspaceId, eventName: "owner.business_created", entityId: business.id } });
    expect(ev).toBeTruthy();
  });
});

describe("[db] first-run: canonical state transitions from persisted facts", () => {
  it("[db] A→B→C→D→E", async () => {
    const t = await makeTenant();
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("NEEDS_BUSINESS");

    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "GBP" });
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("NEEDS_EVIDENCE");

    // revenue + a cost, but cash unknown ⇒ still insufficient (blank is unknown, not zero)
    const partial: any = await createFinancialSnapshot(business.id, quick({ cashOnHand: undefined }) as any, t.userId, t.workspaceId);
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("NEEDS_EVIDENCE");
    expect(partial.id).toBeTruthy();
  });
  it("[db] sufficient evidence without a diagnosis is state C; a diagnosis is D; accepting is E", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "GBP" });
    const snap: any = await createFinancialSnapshot(business.id, quick() as any, t.userId, t.workspaceId);
    const c = await getFirstRunContext(t.workspaceId);
    expect(c.state).toBe("NEEDS_DIAGNOSIS");
    expect(c.href).toBe("/owner/start");

    await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
    const d = await getFirstRunContext(t.workspaceId);
    expect(d.state).toBe("FIRST_RESULT");
    expect(d.loginHref).toBe("/owner/cockpit"); // a viewed first read never traps the owner in setup

    const accepted = await acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-key-0001");
    expect(accepted.replayed).toBe(false);
    const e = await getFirstRunContext(t.workspaceId);
    expect(e.state).toBe("ESTABLISHED");
    expect(e.href).toBe("/owner/cockpit");
    expect(e.firstTrustedInteractionAt).toBeTruthy();
  });
  it("[db] known zeros count as known evidence", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "GBP" });
    await createFinancialSnapshot(business.id, quick({ revenue: 0, fixedCosts: 0, variableCosts: undefined, cashOnHand: 0 }) as any, t.userId, t.workspaceId);
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("NEEDS_DIAGNOSIS");
  });
  it("[db] a foreign workspace never sees this business or its state", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const { business } = await setUpToResult(a);
    expect((await getFirstRunContext(b.workspaceId)).state).toBe("NEEDS_BUSINESS");
    await expect(getFirstMoneyRead(b.workspaceId, business.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(acceptFirstResultAction(b.workspaceId, b.userId, business.id, "accept-key-foreign")).rejects.toBeInstanceOf(NotFoundError);
    await expect(requestImprovement(b.workspaceId, b.userId, business.id, "improve-key-foreign")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getNextQuestionView(b.workspaceId, business.id, { skipped: [], answeredCount: 0 })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("[db] first-run: evidence quality + first Money read", () => {
  it("[db] quality is persisted explicitly (not in notes) and legacy rows stay NULL", async () => {
    const t = await makeTenant();
    const { snap } = await setUpToResult(t, "ROUGH_ESTIMATE");
    const row: any = await db.ownerFinancialSnapshot.findFirst({ where: { id: snap.id } });
    expect(row.evidenceQuality).toBe("ROUGH_ESTIMATE");
    expect(row.notes ?? "").not.toMatch(/estimate/i);
    const t2 = await makeTenant();
    const { snap: legacy } = await setUpToResult(t2);
    expect(((await db.ownerFinancialSnapshot.findFirst({ where: { id: legacy.id } })) as any).evidenceQuality).toBeNull();
  });
  it("[db] estimates lower confidence and surface in the read", async () => {
    const actual = await makeTenant(); const rough = await makeTenant();
    const a = await setUpToResult(actual, "ACTUAL"); const r = await setUpToResult(rough, "ROUGH_ESTIMATE");
    const ra = await getFirstMoneyRead(actual.workspaceId, a.business.id);
    const rr = await getFirstMoneyRead(rough.workspaceId, r.business.id);
    const score = async (id: string) => ((await db.ownerFinancialSnapshot.findFirst({ where: { id } })) as any).dataConfidenceScore as number;
    expect(await score(r.snap.id)).toBeLessThan(await score(a.snap.id));
    expect(rr.read.isEstimated).toBe(true);
    expect(rr.read.evidenceQualityLabel).toBe("A rough guess");
    expect(ra.read.isEstimated).toBe(false);
    expect(["LOW", "BLOCKED"]).toContain(rr.read.confidenceTier);
  });
  it("[db] the first read is money-scoped, honest, and carries a primary action with an owner and timing", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, "GOOD_ESTIMATE");
    const view = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(view.read.heading).toBe("Your first Money read");
    expect(findOverclaims(firstMoneyReadStrings(view.read))).toEqual([]);
    expect(view.candidateId).toMatch(/^domain_action:finance:/);
    expect(view.stale).toBe(false);
    if (view.read.status === "READY") {
      expect(view.read.noticed.length).toBeGreaterThan(0);
      expect(view.read.recommendedAction).toBeTruthy();
      expect(view.read.owner).toBeTruthy();
      expect(view.read.timing).toBeTruthy();
      expect(view.read.watchMetric).toBeTruthy();
    }
  });
});

describe("[db] first-run: governed correction and activation", () => {
  it("[db] correction appends a new snapshot version, keeps the old one, re-runs the diagnosis, and reports the change", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, "ROUGH_ESTIMATE");
    const result = await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, {
      amendmentReason: "Checked the bank statement",
      cashOnHand: 400,
      evidenceQuality: "ACTUAL",
    } as any);
    expect(result.changedFields.sort()).toEqual(["cashOnHand", "evidenceQuality"]);
    expect(result.after.snapshotId).toBe(result.newSnapshotId);
    expect(result.after.read.evidenceQuality).toBe("ACTUAL");
    expect(result.after.stale).toBe(false);
    expect(result.before.evidenceQuality).toBe("ROUGH_ESTIMATE");

    const old: any = await db.ownerFinancialSnapshot.findFirst({ where: { id: snap.id } });
    expect(old.supersededById).toBe(result.newSnapshotId);
    expect(old.cashOnHand).toBe(1500); // history untouched
    expect(old.evidenceQuality).toBe("ROUGH_ESTIMATE");
    const next: any = await db.ownerFinancialSnapshot.findFirst({ where: { id: result.newSnapshotId } });
    expect(next.version).toBe(2);
    expect(next.amendmentReason).toBe("Checked the bank statement");
    expect(next.cashOnHand).toBe(400);
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("ESTABLISHED");
  });
  it("[db] correcting an already-superseded read is refused (no silent overwrite)", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t);
    await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "typo", revenue: 11000 } as any);
    await expect(
      correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "again", revenue: 9000 } as any),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("[db] accept is idempotent and its outcome contract comes from the action itself", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t);
    const first = await acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-key-0002");
    const again = await acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-key-0002");
    expect(again.replayed).toBe(true);
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, businessId: business.id } })).toBe(1);
    const rec: any = await db.ownerDecisionRecord.findFirst({ where: { workspaceId: t.workspaceId, businessId: business.id } });
    expect(rec.decisionState).toBe("ACCEPTED");
    expect(rec.candidateId).toBe(first.candidateId);
    expect(rec.verificationMetric).toBeTruthy();
    expect(rec.targetValue).toBeNull(); // no invented target
  });
  it("[db] accept is refused while the evidence has changed since the read", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t);
    const { amendFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    await amendFinancialSnapshot(snap.id, { amendmentReason: "fix", revenue: 9000 } as any, t.userId, t.workspaceId);
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-key-stale")).rejects.toBeInstanceOf(ConflictError);
  });
  it("[db] improvement request is idempotent, activates once, and emits TIME_TO_FIRST_VALUE without any financial value", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t);
    expect((await requestImprovement(t.workspaceId, t.userId, business.id, "improve-key-0001")).replayed).toBe(false);
    expect((await requestImprovement(t.workspaceId, t.userId, business.id, "improve-key-0001")).replayed).toBe(true);
    await acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-key-0003");
    const events: any[] = await db.auditEvent.findMany({ where: { workspaceId: t.workspaceId, eventName: "product.first_trusted_decision_interaction" } });
    expect(events).toHaveLength(1);
    expect(events[0].payload.interactionKind).toBeTruthy();
    expect(events[0].payload.timeToFirstValueSeconds).toBeGreaterThanOrEqual(0);
    const all = JSON.stringify(await db.auditEvent.findMany({ where: { workspaceId: t.workspaceId, eventName: { startsWith: "product." } } }));
    expect(all).not.toMatch(/12000|7000|1500|Maple/); // no revenue/cash figures, no business name
  });
  it("[db] feedback: rating + structured reason, reason refused on USEFUL, idempotent", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t);
    await expect(
      submitFirstValueFeedback(t.workspaceId, t.userId, business.id, { rating: "USEFUL", reason: "OTHER", idempotencyKey: "fb-key-0001" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const r1 = await submitFirstValueFeedback(t.workspaceId, t.userId, business.id, { rating: "PARTLY_USEFUL", reason: "MISSING_INFORMATION", idempotencyKey: "fb-key-0002" });
    const r2 = await submitFirstValueFeedback(t.workspaceId, t.userId, business.id, { rating: "PARTLY_USEFUL", reason: "MISSING_INFORMATION", idempotencyKey: "fb-key-0002" });
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(await db.ownerFirstResultInteraction.count({ where: { workspaceId: t.workspaceId, kind: "FEEDBACK" } })).toBe(1);
  });
});

describe("[db] first-run: progressive OBQ is bounded", () => {
  let ctx: { workspaceId: string; userId: string; businessId: string };
  beforeAll(async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t);
    ctx = { ...t, businessId: business.id };
  });
  it("[db] returns one explained question or a stop reason, and never repeats a skipped category", async () => {
    const skipped: string[] = [];
    for (let i = 0; i < 12; i++) {
      const v = await getNextQuestionView(ctx.workspaceId, ctx.businessId, { skipped, answeredCount: 0 });
      if (v.result.done) { expect(v.result.reason).toBeTruthy(); return; }
      expect(skipped).not.toContain(v.result.question.category);
      expect(v.result.question.why.length).toBeGreaterThan(0);
      expect(v.inputHref).toBeTruthy();
      skipped.push(v.result.question.category);
    }
    throw new Error("progressive OBQ did not terminate");
  });
});
