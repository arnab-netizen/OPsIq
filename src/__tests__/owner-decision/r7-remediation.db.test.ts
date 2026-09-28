/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * Round-7 remediation regressions, through the real services on real Postgres:
 *   - Decision 1: an unassigned compliance item in a multi-business workspace is surfaced (routed to its
 *     assignment control) and restricts no business; the governed assignment (null → business only, same
 *     workspace, real active business, compare-and-set, audited previous/new) then attributes it — the next
 *     read of the canonical decision and the gate enforce it for that business only;
 *   - Decision 2: the do-not-repeat changed-context write (exact rule, ownership, active rule, meaningful
 *     reason, compare-and-set, audited old/new) lifts that rule's hold on the next read and at the gate;
 *   - Decision 5A: a back-filled older period never takes over in-flight work;
 *   - Decision 5B: Recovery's trend baseline is the previous evidence PERIOD, never the largest run number;
 *   - Decision 5C: all nine action services apply a transition once under concurrent submission;
 *   - Decision 5D: Now View reads raise no alert and write nothing on a steady-state read, repeated or concurrent;
 *   - Now View reads one business's evidence (never an aggregate of several).
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r7-remediation.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { updateCashflowAction } from "@/services/owner-cashflow/action.service";
import { recordComplianceItem, assignComplianceItemBusiness } from "@/services/owner-mode/compliance.service";
import { recordDoNotRepeat, recordOwnerDnrOverride } from "@/services/owner-mode/do-not-repeat.service";
import { createBusinessRisk } from "@/services/owner-mode/business-risk.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { ACTION_SERVICES } from "./action-services-fixture";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";

const actor = randomUUID();
const DAY = 86_400_000;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r7-${actor}@example.com`, name: "R7 QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}
const growthGate = (ws: string, b: string) =>
  enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(
    () => "allowed",
    (e: unknown) => (e instanceof ConflictError ? e.message : `error: ${String(e)}`)
  );
const expired = () => new Date(Date.now() - 5 * DAY);

describe("[db] Decision 1 — assigning an unattributed compliance item to the business it affects", () => {
  it("[db] unassigned in a multi-business workspace: surfaced and routed to its assignment control, restricts no business; once assigned, it restricts exactly that business", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R7 Compliance A");
    const b = await business(ws, "QA R7 Compliance B");
    const itemId = await recordComplianceItem({ workspaceId: ws, businessId: null, kind: "licence", name: "Trade licence", expiresAt: expired(), actorId: actor });

    for (const biz of [a, b]) {
      const d = (await getOwnerHome(ws, biz)).currentOwnerDecision!;
      const t = d.attention.find((x: any) => x.candidateId === `compliance_item:${itemId}`)!;
      expect(t.title).toBe('Assign "Trade licence" to the business it affects');
      expect(t.targetRoute).toBe(`/owner/compliance/${itemId}#assign-business`);
      expect(await growthGate(ws, biz)).toBe("allowed");
    }

    const assigned = await assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: a });
    expect(assigned.businessId).toBe(a);
    const audit = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: itemId, eventName: "owner.compliance_business_assigned" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ previousBusinessId: null, newBusinessId: a });

    // The next read of the canonical decision: A's own obligation (renew it); B no longer sees it.
    const dA = (await getOwnerHome(ws, a)).currentOwnerDecision!;
    expect(dA.primaryTarget).toMatchObject({ candidateId: `compliance_item:${itemId}`, source: "compliance_item" });
    expect(dA.primaryTarget!.title).toMatch(/^Renew "Trade licence"/);
    const dB = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(dB.attention.some((x: any) => x.candidateId === `compliance_item:${itemId}`)).toBe(false);
    expect(await growthGate(ws, a)).toMatch(/Professional review required: "Trade licence"/);
    expect(await growthGate(ws, b)).toBe("allowed");
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] governed: only null → business; the business must be a real, active business of the same workspace; concurrent assignments apply once", async () => {
    const ws = randomUUID();
    const other = randomUUID();
    const a = await business(ws, "QA R7 Assign A");
    const b = await business(ws, "QA R7 Assign B");
    const foreign = await business(other, "QA R7 Assign Foreign");
    const archived = await business(ws, "QA R7 Assign Archived");
    await db.ownerBusiness.update({ where: { id: archived }, data: { isActive: false } });
    const itemId = await recordComplianceItem({ workspaceId: ws, businessId: null, kind: "permit", name: "Fire permit", expiresAt: expired(), actorId: actor });

    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: foreign })).rejects.toBeInstanceOf(ValidationError);
    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: archived })).rejects.toBeInstanceOf(ValidationError);
    await expect(assignComplianceItemBusiness({ workspaceId: other, itemId, actorId: actor, businessId: foreign })).rejects.toBeInstanceOf(NotFoundError);

    const results = await Promise.allSettled([
      assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: a }),
      assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: b }),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason instanceof ConflictError || r.reason instanceof ValidationError).toBe(true);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: itemId, eventName: "owner.compliance_business_assigned" } })).toBe(1);
    const row = await db.ownerComplianceItem.findFirst({ where: { id: itemId } });
    // Reassigning an already-assigned item is refused (a recorded restriction is never silently moved).
    const loser = row!.businessId === a ? b : a;
    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: loser })).rejects.toBeInstanceOf(ValidationError);
    // The same assignment again is idempotent.
    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: row!.businessId! })).resolves.toMatchObject({ businessId: row!.businessId });
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: itemId, eventName: "owner.compliance_business_assigned" } })).toBe(1);
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: ws } });
    for (const id of [a, b, archived]) await teardownOwnerBusiness(id);
    await teardownOwnerBusiness(foreign);
  });
});

describe("[db] Decision 2 (as revised by Round 8 Decision 3) — recording what has changed on a do-not-repeat rule, for Owner Mode of that business", () => {
  it("[db] the rule holds growth work (the decision routes to the rule); a governed changed-context record lifts it at the gate and on the next read", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 DNR");
    const ruleId = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "Paid social push", reason: "Burned budget with no orders", actorId: actor });
    expect(await growthGate(ws, b)).toMatch(/do-not-repeat/);

    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId, actorId: actor, reason: "  new offer  " })).rejects.toBeInstanceOf(ValidationError);
    await expect(recordOwnerDnrOverride({ workspaceId: randomUUID(), businessId: b, ruleId, actorId: actor, reason: "A new supplier contract halves the cost per order." })).rejects.toBeInstanceOf(NotFoundError);

    const view = await recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId, actorId: actor, reason: "A new supplier contract halves the cost per order." });
    expect(view.changedContextExplanation).toBe("A new supplier contract halves the cost per order.");
    const audit = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: ruleId, eventName: "owner.do_not_repeat_context_changed" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ ruleId, businessId: b, scope: "owner_business_override", changedContextExplanation: "A new supplier contract halves the cost per order." });
    expect(await growthGate(ws, b)).toBe("allowed");
    // The shared rule row is never modified (Formal Consulting Mode never observes an Owner override).
    expect((await db.ownerDoNotRepeatRule.findFirst({ where: { id: ruleId } }))!.changedContextExplanation).toBeNull();

    // Idempotent for the same text; a different text is refused (never silently replaced).
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId, actorId: actor, reason: "A new supplier contract halves the cost per order." })).resolves.toBeDefined();
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId, actorId: actor, reason: "Something else entirely changed since then." })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: ruleId, eventName: "owner.do_not_repeat_context_changed" } })).toBe(1);
    await db.ownerDoNotRepeatRule.deleteMany({ where: { workspaceId: ws } });
    await db.operatingMemoryEntry.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });

  it("[db] an inactive rule is refused; concurrent records apply once", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 DNR Concurrency");
    const inactive = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:sales", summary: "s", reason: "r", actorId: actor });
    await db.ownerDoNotRepeatRule.update({ where: { id: inactive }, data: { active: false } });
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId: inactive, actorId: actor, reason: "The market has changed since this was set." })).rejects.toBeInstanceOf(ValidationError);

    const ruleId = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "s", reason: "r", actorId: actor });
    const results = await Promise.allSettled([
      recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId, actorId: actor, reason: "First account of what changed since then." }),
      recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId, actorId: actor, reason: "Second account of what changed since then." }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.operatingMemoryEntry.count({ where: { workspaceId: ws, memoryType: "DNR_OWNER_OVERRIDE" } })).toBe(1);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: ruleId, eventName: "owner.do_not_repeat_context_changed" } })).toBe(1);
    await db.ownerDoNotRepeatRule.deleteMany({ where: { workspaceId: ws } });
    await db.operatingMemoryEntry.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });
});

describe("[db] Decision 5A — a back-filled period never takes over in-flight work", () => {
  it("[db] Cash flow: the in-progress action stays on the current period's cycle; the back-filled diagnosis neither moves nor duplicates it; a NEWER period carries it", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 Backfill");
    const current = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(3), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const action = (await db.ownerCashflowAction.findMany({ where: { cycleId: current.id }, orderBy: { priorityScore: "desc" } }))[0];
    await updateCashflowAction(action.id, { status: "assigned" }, actor, ws);
    await updateCashflowAction(action.id, { status: "in_progress" }, actor, ws);

    const backfill = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(30), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const after = await db.ownerCashflowAction.findFirst({ where: { id: action.id } });
    expect(after!.cycleId).toBe(current.id);
    expect(after!.status).toBe("in_progress");
    expect(await db.ownerCashflowAction.count({ where: { cycleId: backfill.id, findingCode: action.findingCode, recommendationCode: action.recommendationCode } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: action.id, payload: { path: ["reason"], equals: "carried_forward_by_diagnosis" } } })).toBe(0);
    // The owner's in-flight work is still what the decision shows for Cash flow.
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(d.attention.some((t: any) => String(t.candidateId).endsWith(`:${action.id}`) && t.status === "in_progress")).toBe(true);

    const newer = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(1), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    expect((await db.ownerCashflowAction.findFirst({ where: { id: action.id } }))!.cycleId).toBe(newer.id);
    await teardownOwnerBusiness(b);
  });
});

// Decision 5B (Recovery's trend baseline) is covered by the mutation-sensitive test in r8-remediation.db.test.ts
// (runs whose run order disagrees with period order; the pre-fix baseline fails it).

describe("[db] Decision 5C — all nine action services apply a transition exactly once under concurrent submission", () => {
  const evidence = { completionNotes: "Done and checked", completionEvidence: ["receipt.pdf"] };
  for (const svc of ACTION_SERVICES) {
    it(`[db] ${svc.name}: a double-submitted completion applies once (one audit, one completedAt); a conflicting concurrent transition is refused`, async () => {
      const ws = randomUUID();
      const b = await business(ws, `QA R7 CAS ${svc.name}`);
      const id = await svc.seed(ws, b, actor);
      await svc.update(id, { status: "assigned" }, ws, actor);
      await svc.update(id, { status: "in_progress" }, ws, actor);
      const results = await Promise.allSettled([
        svc.update(id, { status: "completed", ...evidence }, ws, actor),
        svc.update(id, { status: "completed", ...evidence }, ws, actor),
      ]);
      // An identical concurrent submission: both are reported applied (the second is an exact replay) — never twice written.
      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ConflictError);
      const completedAudits = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: id, payload: { path: ["status"], equals: "completed" } } });
      expect(completedAudits, `${svc.name} completion audited once`).toHaveLength(1);

      // A second action (every service seeds one, on a second business of the workspace): completed vs cancelled
      // at once — exactly one transition applies.
      const b2 = await business(ws, `QA R7 CAS ${svc.name} 2`);
      const id2 = await svc.seed(ws, b2, actor);
      expect(id2, `${svc.name} seeds a distinct second action`).not.toBe(id);
      await svc.update(id2, { status: "assigned" }, ws, actor);
      await svc.update(id2, { status: "in_progress" }, ws, actor);
      const race = await Promise.allSettled([
        svc.update(id2, { status: "completed", ...evidence }, ws, actor),
        svc.update(id2, { status: "cancelled" }, ws, actor),
      ]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of race) if (r.status === "rejected") expect(r.reason instanceof ConflictError || r.reason instanceof ValidationError).toBe(true);
      const terminal = await db.auditEvent.count({ where: { workspaceId: ws, entityId: id2, OR: [{ payload: { path: ["status"], equals: "completed" } }, { payload: { path: ["status"], equals: "cancelled" } }] } });
      expect(terminal).toBe(1);
      await teardownOwnerBusiness(b);
      await teardownOwnerBusiness(b2);
    });
  }
});

describe("[db] Decision 5D / Now View — read-only and scoped to one business", () => {
  it("[db] an overdue risk review raises no alert on a Now View read; repeated and concurrent steady-state reads write nothing", async () => {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name: "R7 Now View", slug: `r7-${ws}`, isActive: true, updatedAt: new Date() } });
    const b = await business(ws, "QA R7 Now View");
    await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(5), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R7_OVERDUE", title: "Supplier contract lapse", category: "OPERATIONAL" as any, likelihood: 40, impact: 40 });
    await db.businessRiskEntry.update({ where: { id: risk.id }, data: { reviewDueDate: new Date(Date.now() - 3 * DAY) } });
    const alertsBefore = await db.alert.count({ where: { workspaceId: ws } });

    await getOwnerNowView(ws, b, undefined, actor); // first read: records the guidance baseline
    const snapshotsAfterFirst = await db.ownerGuidanceSnapshot.count({ where: { workspaceId: ws } });
    const auditAfterFirst = await db.auditEvent.count({ where: { workspaceId: ws } });
    await getOwnerNowView(ws, b, undefined, actor);
    await Promise.all(Array.from({ length: 4 }, () => getOwnerNowView(ws, b, undefined, actor)));
    // Give any stray fire-and-forget work a chance to land before counting.
    await new Promise((r) => setTimeout(r, 300));

    expect(await db.alert.count({ where: { workspaceId: ws } })).toBe(alertsBefore);
    expect(await db.alert.count({ where: { workspaceId: ws, idempotencyKey: `risk_overdue_${risk.id}` } })).toBe(0);
    expect(await db.ownerGuidanceSnapshot.count({ where: { workspaceId: ws } })).toBe(snapshotsAfterFirst);
    expect(await db.auditEvent.count({ where: { workspaceId: ws } })).toBe(auditAfterFirst);
    await db.businessRiskEntry.deleteMany({ where: { workspaceId: ws } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });

  it("[db] with no business given in a two-business workspace, no business's cash or Finance evidence is read (never an aggregate); with the business given, only its own", async () => {
    const ws = randomUUID();
    const safe = await business(ws, "QA R7 Scope Safe");
    const unsafe = await business(ws, "QA R7 Scope Unsafe");
    await runCashflowDiagnosis(unsafe, (await createCashflowSnapshot(unsafe, { ...period(5), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const none = await getOwnerNowView(ws, null);
    expect(none.view.topOwnerActions.some((a: any) => a.category === "CASH_DANGER")).toBe(false);
    const own = await getOwnerNowView(ws, safe);
    expect(own.view.topOwnerActions.some((a: any) => a.category === "CASH_DANGER")).toBe(false);
    const theirs = await getOwnerNowView(ws, unsafe);
    expect(theirs.view.topOwnerActions.some((a: any) => a.category === "CASH_DANGER")).toBe(true);
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(safe);
    await teardownOwnerBusiness(unsafe);
  });
});
