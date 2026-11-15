/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * DB-backed proof of the audit-repair set (evidence truth, compare-at-write stale-read prevention, truthful partial
 * failure, persisted progressive-question progress, period/provisional presentation).
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-first-run/first-run-repair.db.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/services/owner-mode/process-execution-bridge.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/owner-mode/process-execution-bridge.service")>();
  return { ...actual, reconcileDataGapTasksAfterDiagnosis: vi.fn(actual.reconcileDataGapTasksAfterDiagnosis) };
});
vi.mock("@/services/owner-finance/diagnosis.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/owner-finance/diagnosis.service")>();
  return { ...actual, runFinanceDiagnosis: vi.fn(actual.runFinanceDiagnosis) };
});

import { db } from "@/lib/db";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { reconcileDataGapTasksAfterDiagnosis } from "@/services/owner-mode/process-execution-bridge.service";
import {
  assertEvidenceQualityStatedForFirstEvidence,
  createFirstBusiness,
  getFirstMoneyRead,
  getFirstRunContext,
  getNextQuestionView,
  getQuestionProgress,
  requestImprovement,
  skipQuestion,
} from "@/services/owner-first-run/first-run.service";
import { acceptFirstResultAction, correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";
import { MAX_PROGRESSIVE_QUESTIONS } from "@/domain/owner-first-run/next-question";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import { CORRECTION_SAVED_READ_PENDING_MESSAGE, READ_STALE_MESSAGE } from "@/domain/owner-first-run/read-staleness";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { makeIndependentClient } from "../owner-outcome/outcome-db-fixtures";

async function makeTenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({
    data: { id: userId, email: `${userId}@repair.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() },
  });
  await db.workspace.create({ data: { id: workspaceId, name: "Repair Laundry", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  return { workspaceId, userId };
}

const lastMonth = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};
const thisMonth = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};
const figures = (over: Record<string, unknown> = {}) => ({ currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500, ...over });

type Quality = "ACTUAL" | "GOOD_ESTIMATE" | "ROUGH_ESTIMATE";
async function setUpToResult(t: { workspaceId: string; userId: string }, opts: { quality?: Quality; period?: { periodStart: string; periodEnd: string } } = {}) {
  const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
  const snap: any = await createFinancialSnapshot(
    business.id,
    { ...(opts.period ?? lastMonth()), ...figures(), ...(opts.quality ? { evidenceQuality: opts.quality } : {}) } as any,
    t.userId, t.workspaceId,
  );
  await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
  return { business, snap };
}

describe("[db] A1 NULL evidence quality is never authoritative", () => {
  it.each([
    ["ACTUAL", "AUTHORITATIVE_SNAPSHOT"],
    ["GOOD_ESTIMATE", "OWNER_ENTERED"],
    ["ROUGH_ESTIMATE", "OWNER_ENTERED"],
    [undefined, "OWNER_ENTERED"], // legacy / unspecified (NULL)
  ] as const)("[db] quality %s is recorded as measurement source %s", async (quality, source) => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality });
    const view = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(view.read.evidenceProvenance).toBe(quality ?? "LEGACY_UNKNOWN");
    await acceptFirstResultAction(t.workspaceId, t.userId, business.id, `accept-key-${String(quality)}-1`, view.cycleId);
    const rec: any = await db.ownerDecisionRecord.findFirst({ where: { workspaceId: t.workspaceId, businessId: business.id } });
    expect(rec.expectedMeasurementSource).toBe(source);
  });
  it("[db] a legacy NULL read is labelled 'Not stated' with an explicit caution, and is not presented as estimated or as from records", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t);
    const { read } = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(read.evidenceQuality).toBeNull();
    expect(read.evidenceQualityLabel).toBe("Not stated");
    expect(read.cautions.join(" ")).toMatch(/doesn't know how reliable/i);
    expect(read.basis).toMatch(/reliability not stated/);
    // the storage stays NULL: nothing is fabricated for the legacy row
    expect(((await db.ownerFinancialSnapshot.findFirst({ where: { businessId: business.id } })) as any).evidenceQuality).toBeNull();
  });
});

describe("[db] A2 evidence quality is enforced on the server for first evidence", () => {
  it("[db] before the first diagnosis an omitted quality is refused with a field error; a stated one passes", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "GBP" });
    await expect(assertEvidenceQualityStatedForFirstEvidence(t.workspaceId, business.id, undefined)).rejects.toMatchObject({
      constructor: ValidationError,
      details: expect.anything(),
    });
    await expect(assertEvidenceQualityStatedForFirstEvidence(t.workspaceId, business.id, "ROUGH_ESTIMATE")).resolves.toBeUndefined();
  });
  it("[db] once the business has been diagnosed, a caller that never states it stays conservative (NULL) instead of failing", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "ACTUAL" });
    await expect(assertEvidenceQualityStatedForFirstEvidence(t.workspaceId, business.id, undefined)).resolves.toBeUndefined();
  });
  it("[db] a foreign workspace gets not-found, not a validation hint about someone else's business", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const { business } = await createFirstBusiness(a.workspaceId, a.userId, { businessType: "laundry_local_service", currency: "GBP" });
    await expect(assertEvidenceQualityStatedForFirstEvidence(b.workspaceId, business.id, undefined)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("[db] A3 evidence-quality changes are audited", () => {
  async function amendAndAudit(start: Quality | undefined, amend: Record<string, unknown>) {
    const t = await makeTenant();
    const { snap } = await setUpToResult(t, { quality: start });
    const out: any = await amendFinancialSnapshot(snap.id, { amendmentReason: "audit test", ...amend } as any, t.userId, t.workspaceId);
    const ev: any = await db.auditEvent.findFirst({
      where: { workspaceId: t.workspaceId, eventName: AUDIT_EVENTS.OWNER_FINANCE_SNAPSHOT_AMENDED, entityId: out.snapshot.id },
    });
    return { t, snap, out, ev };
  }
  it("[db] an implicit ACTUAL → GOOD_ESTIMATE step-down (numbers changed, quality not restated) is recorded with before/after, actor and lineage", async () => {
    const { t, snap, out, ev } = await amendAndAudit("ACTUAL", { revenue: 8000 });
    expect(out.snapshot.evidenceQuality).toBe("GOOD_ESTIMATE");
    expect(out.snapshot.changedFields).toEqual(expect.arrayContaining(["revenue", "evidenceQuality"]));
    expect(ev.payload.evidenceQualityBefore).toBe("ACTUAL");
    expect(ev.payload.evidenceQualityAfter).toBe("GOOD_ESTIMATE");
    expect(ev.payload.changedFields).toContain("evidenceQuality");
    expect(ev.payload.previousSnapshotId).toBe(snap.id);
    expect(ev.actorId).toBe(t.userId);
    expect(out.snapshot.amendedByActorId).toBe(t.userId);
  });
  it("[db] an explicit change is recorded; a restated identical quality is not a change; legacy stays LEGACY_UNKNOWN on both sides", async () => {
    const explicit = await amendAndAudit("GOOD_ESTIMATE", { evidenceQuality: "ROUGH_ESTIMATE" });
    expect(explicit.ev.payload).toMatchObject({ evidenceQualityBefore: "GOOD_ESTIMATE", evidenceQualityAfter: "ROUGH_ESTIMATE" });
    const same = await amendAndAudit("ACTUAL", { notes: "added a note" });
    expect(same.ev.payload).toMatchObject({ evidenceQualityBefore: "ACTUAL", evidenceQualityAfter: "ACTUAL" });
    expect(same.ev.payload.changedFields).not.toContain("evidenceQuality");
    // restating the SAME quality is not a provenance change: it must not appear as one in the lineage
    const restated = await amendAndAudit("ACTUAL", { evidenceQuality: "ACTUAL", notes: "same quality restated" });
    expect(restated.ev.payload).toMatchObject({ evidenceQualityBefore: "ACTUAL", evidenceQualityAfter: "ACTUAL" });
    expect(restated.ev.payload.changedFields).not.toContain("evidenceQuality");
    expect(restated.out.snapshot.changedFields).not.toContain("evidenceQuality");
    const legacy = await amendAndAudit(undefined, { revenue: 9000 });
    expect(legacy.ev.payload).toMatchObject({ evidenceQualityBefore: "LEGACY_UNKNOWN", evidenceQualityAfter: "LEGACY_UNKNOWN" });
    expect(legacy.out.snapshot.evidenceQuality).toBeNull(); // never promoted to ACTUAL
  });
  it("[db] the first-run correction reports what the governed amendment recorded, including the implicit step-down", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const result = await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "guess", cashOnHand: 5000 } as any);
    expect(result.changedFields).toContain("evidenceQuality");
  });
});

describe("[db] B1 compare-at-write: a stale read can never be accepted", () => {
  it("[db] amended, not yet re-diagnosed → READ_STALE, nothing recorded", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const seen = await getFirstMoneyRead(t.workspaceId, business.id);
    await amendFinancialSnapshot(snap.id, { amendmentReason: "fix", revenue: 9000 } as any, t.userId, t.workspaceId);
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "stale-key-0001", seen.cycleId)).rejects.toMatchObject({ message: READ_STALE_MESSAGE });
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId } })).toBe(0);
  });
  it("[db] amended AND re-diagnosed by someone else: the read the owner saw is still refused (they never saw the new one)", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const seen = await getFirstMoneyRead(t.workspaceId, business.id);
    const amended: any = await amendFinancialSnapshot(snap.id, { amendmentReason: "fix", revenue: 9000 } as any, t.userId, t.workspaceId);
    await runFinanceDiagnosis(business.id, amended.snapshot.id, t.userId, t.workspaceId);
    const current = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(current.cycleId).not.toBe(seen.cycleId);
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "stale-key-0002", seen.cycleId)).rejects.toMatchObject({ message: READ_STALE_MESSAGE });
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId } })).toBe(0);
    // the CURRENT read, named explicitly, is accepted
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "stale-key-0003", current.cycleId)).resolves.toMatchObject({ replayed: false });
  });
  it("[db] a re-run on the same snapshot also supersedes the read the owner is holding", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const seen = await getFirstMoneyRead(t.workspaceId, business.id);
    await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "stale-key-0004", seen.cycleId)).rejects.toMatchObject({ message: READ_STALE_MESSAGE });
  });
  it("[db] CONCURRENT_AMEND_ACCEPTANCE_BLOCKED: an amendment that is in flight when acceptance reaches its commit point blocks it, and acceptance then refuses", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const seen = await getFirstMoneyRead(t.workspaceId, business.id);
    // The shared client has ONE connection per process, so contenders must run on independent connections to exercise
    // Postgres's real serialisation: one for the in-flight amendment, one for observing from outside.
    const holder = await makeIndependentClient();
    const observer = await makeIndependentClient();
    try {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      let locked!: () => void;
      const lockTaken = new Promise<void>((r) => { locked = r; });

      // A concurrent amendment: it takes the snapshot row lock (exactly as amendFinancialSnapshot does) and supersedes the
      // row, but has NOT committed when acceptance starts.
      const amendInFlight = (holder.client as any).$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM owner_financial_snapshots WHERE id = ${snap.id} FOR UPDATE`;
        const row: any = await tx.ownerFinancialSnapshot.findFirst({ where: { id: snap.id } });
        const nextId = randomUUID();
        const { id: _id, supersededById: _s, version, createdAt: _c, updatedAt: _u, ...rest } = row;
        await tx.ownerFinancialSnapshot.create({ data: { ...rest, id: nextId, version: version + 1, revenue: 9000 } });
        await tx.ownerFinancialSnapshot.update({ where: { id: snap.id }, data: { supersededById: nextId } });
        locked();
        await hold; // keep the transaction open
      }, { timeout: 30_000 });
      await lockTaken;

      let settled = false;
      const accept = acceptFirstResultAction(t.workspaceId, t.userId, business.id, "race-key-0001", seen.cycleId)
        .then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }))
        .finally(() => { settled = true; });
      await new Promise((r) => setTimeout(r, 600));
      // Acceptance is blocked behind the amendment's lock: it has not committed anything.
      expect(settled).toBe(false);
      expect(await (observer.client as any).ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId } })).toBe(0);
      release();
      await amendInFlight;
      const outcome = await accept;
      expect(outcome.ok).toBe(false);
      expect((outcome as any).e.message).toBe(READ_STALE_MESSAGE);
      expect(await (observer.client as any).ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId } })).toBe(0);
    } finally {
      await Promise.all([holder.close(), observer.close()]);
    }
  });
  it("[db] acceptance and an amendment issued together: either order is safe — a decision exists only if it committed against un-superseded evidence", async () => {
    for (let i = 0; i < 4; i++) {
      const t = await makeTenant();
      const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
      const seen = await getFirstMoneyRead(t.workspaceId, business.id);
      const [acc, amd] = await Promise.allSettled([
        acceptFirstResultAction(t.workspaceId, t.userId, business.id, `race-key-${i}-1`, seen.cycleId),
        amendFinancialSnapshot(snap.id, { amendmentReason: "race", revenue: 9000 + i } as any, t.userId, t.workspaceId),
      ]);
      expect(amd.status).toBe("fulfilled"); // the share lock never starves or fails the amendment
      const decisions = await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId } });
      if (acc.status === "fulfilled") {
        expect(decisions).toBe(1); // accepted first, amendment second: linearised in that order
      } else {
        expect((acc.reason as Error).message).toBe(READ_STALE_MESSAGE);
        expect(decisions).toBe(0);
      }
      // whichever order won, afterwards the old read can never be accepted again
      await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, `race-key-${i}-2`, seen.cycleId)).rejects.toBeDefined();
    }
  });
});

describe("[db] B1b a retry of an accept that already committed is a replay, not a stale error", () => {
  it("[db] same key + same read after the figures changed returns the recorded decision (replayed), never READ_STALE, never a second record", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const seen = await getFirstMoneyRead(t.workspaceId, business.id);
    const first = await acceptFirstResultAction(t.workspaceId, t.userId, business.id, "replay-key-0001", seen.cycleId);
    expect(first.replayed).toBe(false);
    await amendFinancialSnapshot(snap.id, { amendmentReason: "later", revenue: 9000 } as any, t.userId, t.workspaceId); // the figures moved on
    const retry = await acceptFirstResultAction(t.workspaceId, t.userId, business.id, "replay-key-0001", seen.cycleId);
    expect(retry.replayed).toBe(true);
    expect(retry.candidateId).toBe(first.candidateId);
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, businessId: business.id } })).toBe(1);
    // a DIFFERENT key on the same stale read is still refused
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "replay-key-0002", seen.cycleId)).rejects.toMatchObject({ message: READ_STALE_MESSAGE });
  });
  it("[db] a key used in another workspace is never replayed across tenants", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const ra = await setUpToResult(a, { quality: "ACTUAL" });
    const rb = await setUpToResult(b, { quality: "ACTUAL" });
    const seenA = await getFirstMoneyRead(a.workspaceId, ra.business.id);
    await acceptFirstResultAction(a.workspaceId, a.userId, ra.business.id, "shared-key-0001", seenA.cycleId);
    const seenB = await getFirstMoneyRead(b.workspaceId, rb.business.id);
    const outB = await acceptFirstResultAction(b.workspaceId, b.userId, rb.business.id, "shared-key-0001", seenB.cycleId);
    expect(outB.replayed).toBe(false);
  });
});

describe("[db] B2 correction partial failure is reported truthfully", () => {
  it("[db] a failure in the best-effort bookkeeping after a diagnosis that DID run is not reported as a failed read", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    vi.mocked(reconcileDataGapTasksAfterDiagnosis).mockRejectedValueOnce(new Error("bookkeeping down"));
    const result = await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "fix", revenue: 8000 } as any);
    expect(result.diagnosisFailed).toBe(false);
    expect(result.after?.snapshotId).toBe(result.newSnapshotId);
  });
  it("[db] amendment committed + diagnosis failed: result says so, the old read is withdrawn, retry restores a read", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUpToResult(t, { quality: "ACTUAL" });
    const seen = await getFirstMoneyRead(t.workspaceId, business.id);
    vi.mocked(runFinanceDiagnosis).mockRejectedValueOnce(new Error("engine unavailable"));
    const result = await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "fix", revenue: 8000 } as any);
    expect(result.diagnosisFailed).toBe(true);
    expect(result.after).toBeNull();
    // the corrected numbers WERE saved…
    const old: any = await db.ownerFinancialSnapshot.findFirst({ where: { id: snap.id } });
    expect(old.supersededById).toBe(result.newSnapshotId);
    const next: any = await db.ownerFinancialSnapshot.findFirst({ where: { id: result.newSnapshotId } });
    expect(next.revenue).toBe(8000);
    // …the previous read no longer applies: it cannot be loaded or accepted…
    const ctx = await getFirstRunContext(t.workspaceId);
    expect(ctx.diagnosisStale).toBe(true);
    await expect(getFirstMoneyRead(t.workspaceId, business.id)).rejects.toBeDefined();
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "partial-key-0001", seen.cycleId)).rejects.toMatchObject({ message: READ_STALE_MESSAGE });
    // …and a retry of the diagnosis (the owner's "Update my read") restores a read on the corrected numbers.
    await runFinanceDiagnosis(business.id, ctx.currentSnapshotId!, t.userId, t.workspaceId);
    const restored = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(restored.snapshotId).toBe(result.newSnapshotId);
    expect(CORRECTION_SAVED_READ_PENDING_MESSAGE).toMatch(/corrected numbers are saved/i);
  });
});

describe("[db] C period + provisional status are visible and canonical", () => {
  it("[db] a completed previous month is labelled with its month and as completed", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "GOOD_ESTIMATE" });
    const { read } = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(read.period.state).toBe("completed");
    expect(read.basis).toMatch(/^Based on your [A-Z][a-z]+ \d{4} figures · completed period · A good estimate$/);
    expect(read.cautions.join(" ")).not.toMatch(/still in progress/);
    expect(read.scopeKind).toBe("FINANCIAL_FIRST_READ");
  });
  it("[db] the current, unfinished month is PROVISIONAL and says so (and is never presented as completed)", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "ROUGH_ESTIMATE", period: thisMonth() });
    const { read } = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(read.period.state).toBe("provisional");
    expect(read.basis).toMatch(/figures so far · still in progress \(provisional\) · A rough guess$/);
    expect(read.cautions.join(" ")).toMatch(/still in progress/);
  });
});

describe("[db] D progressive question progress is persisted", () => {
  const cats = OWNER_INPUT_CATEGORIES.slice(0, MAX_PROGRESSIVE_QUESTIONS + 1);

  it("[db] QUESTION_PROGRESS_PERSISTED + NO_REPEAT_SKIPPED_QUESTION: a skip is stored, survives a reload and is never asked again", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "ACTUAL" });
    const first = await getNextQuestionView(t.workspaceId, business.id);
    if (first.result.done) throw new Error(`expected a question for this business, got stop reason ${first.result.reason}`);
    const category = first.result.question.category;
    expect((await skipQuestion(t.workspaceId, t.userId, business.id, category)).replayed).toBe(false);
    expect((await skipQuestion(t.workspaceId, t.userId, business.id, category)).replayed).toBe(true); // idempotent
    const row: any = await db.ownerFirstResultInteraction.findFirst({ where: { workspaceId: t.workspaceId, businessId: business.id, kind: "QUESTION_SKIPPED" } });
    expect(row.questionCategory).toBe(category);
    expect(await db.ownerFirstResultInteraction.count({ where: { workspaceId: t.workspaceId, kind: "QUESTION_SKIPPED" } })).toBe(1);
    expect(await getQuestionProgress(t.workspaceId, business.id)).toEqual({ handled: [category], skipped: [category] });
    const again = await getNextQuestionView(t.workspaceId, business.id);
    expect(again.progress.handled).toBe(1);
    if (!again.result.done) expect(again.result.question.category).not.toBe(category);
  });
  it("[db] PROGRESSIVE_STOP_RULE: the question limit is reachable from persisted progress alone", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "ACTUAL" });
    for (const c of cats.slice(0, MAX_PROGRESSIVE_QUESTIONS)) await skipQuestion(t.workspaceId, t.userId, business.id, c);
    const view = await getNextQuestionView(t.workspaceId, business.id);
    expect(view.result).toEqual({ done: true, reason: "QUESTION_LIMIT" });
    expect(view.progress).toEqual({ handled: MAX_PROGRESSIVE_QUESTIONS, max: MAX_PROGRESSIVE_QUESTIONS });
    expect(view.inputHref).toBeNull();
  });
  it("[db] choosing to add evidence counts toward the same limit (once per category) and still counts as the improvement request", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "ACTUAL" });
    expect((await requestImprovement(t.workspaceId, t.userId, business.id, cats[0])).replayed).toBe(false);
    expect((await requestImprovement(t.workspaceId, t.userId, business.id, cats[0])).replayed).toBe(true);
    await skipQuestion(t.workspaceId, t.userId, business.id, cats[1]);
    expect((await getQuestionProgress(t.workspaceId, business.id)).handled.sort()).toEqual([cats[0], cats[1]].sort());
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("ESTABLISHED"); // an improvement request is a trusted interaction
  });
  it("[db] progress is tenant- and business-scoped, categories are validated, and a foreign business is not found", async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const { business } = await setUpToResult(a, { quality: "ACTUAL" });
    const other = await setUpToResult(b, { quality: "ACTUAL" });
    await skipQuestion(a.workspaceId, a.userId, business.id, cats[0]);
    expect((await getQuestionProgress(b.workspaceId, other.business.id)).handled).toEqual([]);
    await expect(skipQuestion(b.workspaceId, b.userId, business.id, cats[0])).rejects.toBeInstanceOf(NotFoundError);
    await expect(requestImprovement(b.workspaceId, b.userId, business.id, cats[0])).rejects.toBeInstanceOf(NotFoundError);
    await expect(getNextQuestionView(b.workspaceId, business.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(skipQuestion(a.workspaceId, a.userId, business.id, "not_a_category")).rejects.toBeInstanceOf(ValidationError);
    await expect(skipQuestion(a.workspaceId, a.userId, business.id, "'; DROP TABLE x;--")).rejects.toBeInstanceOf(ValidationError);
  });
  it("[db] the schema itself refuses a skipped question with no category, and a category on an unrelated kind", async () => {
    const t = await makeTenant();
    const { business } = await setUpToResult(t, { quality: "ACTUAL" });
    const base = { workspaceId: t.workspaceId, businessId: business.id, createdBy: t.userId };
    await expect(db.ownerFirstResultInteraction.create({ data: { id: randomUUID(), ...base, kind: "QUESTION_SKIPPED", idempotencyKey: `x-${randomUUID()}` } as any })).rejects.toBeDefined();
    await expect(db.ownerFirstResultInteraction.create({ data: { id: randomUUID(), ...base, kind: "FEEDBACK", rating: "USEFUL", questionCategory: cats[0], idempotencyKey: `y-${randomUUID()}` } as any })).rejects.toBeDefined();
  });
});
