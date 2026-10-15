/**
 * OBQ owner decisions, proven through the REAL services and a real database:
 *  - FIRST_READ_WITH_UNKNOWN_CASH: an owner who does not know their cash completes OBQ and gets only the conclusions the
 *    evidence supports, with the withheld ones explained — not generic advice.
 *  - Corrections: known → different known, known → UNKNOWN, UNKNOWN → known. Each keeps history, makes the new state
 *    current, triggers governed re-evaluation, never silently restores a previous number, and never writes 0 for unknown.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

const COST_SENTENCE = /Some cost information is missing \(variable costs\), so OpsIQ cannot calculate total profit or margin yet\./;
const CASH_SENTENCE = /OpsIQ doesn't know your cash, so it can't say how long your cash will last\./;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] unknown evidence: first read and corrections", () => {
  const created: Array<{ actorId: string; workspaceId: string; businessId: string }> = [];

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
    created.push({ actorId, workspaceId, businessId: b.id });
    return { actorId, workspaceId, businessId: b.id };
  }

  async function firstRead(t: { actorId: string; workspaceId: string; businessId: string }, evidence: Record<string, unknown>) {
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
    const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");
    const snap = await createFinancialSnapshot(
      t.businessId,
      { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", evidenceQuality: "GOOD_ESTIMATE", ...evidence } as never,
      t.actorId, t.workspaceId,
    );
    await runFinanceDiagnosis(t.businessId, snap.id, t.actorId, t.workspaceId);
    return { snap, view: await getFirstMoneyRead(t.workspaceId, t.businessId) };
  }

  afterAll(async () => {
    for (const m of created) {
      await teardownOwnerBusiness(m.businessId);
      await db.rateLimitBucket.deleteMany({ where: { key: `diag:${m.businessId}` } });
      await db.auditEvent.deleteMany({ where: { actorId: m.actorId } });
      await db.workspaceMembership.deleteMany({ where: { userId: m.actorId } });
      await db.workspace.deleteMany({ where: { id: m.workspaceId } });
      await db.user.deleteMany({ where: { id: m.actorId } });
    }
  });

  it("[db] FIRST_READ_WITH_UNKNOWN_CASH: sufficient evidence, cash blank → a specific, supported read; cash stored as UNKNOWN", async () => {
    const t = await tenant("unkcash");
    const { getFirstRunContext } = await import("@/services/owner-first-run/first-run.service");
    const { snap, view } = await firstRead(t, { revenue: 12000, fixedCosts: 7000, variableCosts: 4000 });

    // Stored as UNKNOWN (null), never defaulted to 0.
    const row = await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: snap.id } });
    expect(row.cashOnHand).toBeNull();

    // OBQ completes without cash: sufficiency holds and the first-run state moved past evidence.
    const ctx = await getFirstRunContext(t.workspaceId);
    expect(ctx.facts.firstReadSufficient).toBe(true);
    expect(ctx.state).toBe("FIRST_RESULT");

    const r = view.read;
    // Not generic advice: a real finding the available evidence supports (fixed costs are 58% of revenue)...
    expect(r.status).toBe("READY");
    expect(r.noticed).not.toMatch(/can't point to a specific money problem/i);
    expect(r.recommendedAction).toBeTruthy();
    expect(r.recommendedAction).not.toMatch(/Improve data completeness/i);
    expect(r.supportingEvidence.join(" ")).toMatch(/fixed cost/i);
    // ...that can be acted on (cash unknown is not "critical missing"), at an honest, non-high confidence.
    expect(r.canAccept).toBe(true);
    expect(["LOW", "MEDIUM"]).toContain(r.confidenceTier);
    // The withheld conclusion is explained, without asking the owner to invent a number.
    expect(r.cannotConclude.join(" ")).toMatch(CASH_SENTENCE);
    expect(r.missingEvidence).toContain("Cash in hand");
    // And nothing cash-dependent was claimed.
    const findings = await db.ownerFinanceFinding.findMany({ where: { cycleId: view.cycleId }, select: { code: true } });
    const codes = findings.map((f) => f.code);
    for (const c of ["FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY", "FIN_LOW_ABSOLUTE_CASH"]) expect(codes).not.toContain(c);
    expect(codes).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    expect(JSON.stringify(r)).not.toMatch(/runs? out|days of cash remaining/i);
  });

  it("[db] partial costs (variable UNKNOWN): no profit/margin claim, the explanation names what is missing", async () => {
    const t = await tenant("unkcost");
    const { view } = await firstRead(t, { revenue: 100000, fixedCosts: 20000, cashOnHand: 5000 });
    const r = view.read;
    expect(r.cannotConclude.join(" ")).toMatch(COST_SENTENCE);
    expect(JSON.stringify(r)).not.toMatch(/\b80\s?%|net profit of|net margin/i);
    const cycle = await db.ownerFinanceCycle.findUniqueOrThrow({ where: { id: view.cycleId }, include: { findings: true } });
    expect(cycle.findings.map((f) => f.code)).not.toContain("FIN_NEGATIVE_NET_MARGIN");
  });

  it("[db] corrections: known→different known, known→UNKNOWN, UNKNOWN→known — history kept, re-evaluated each time, never silently restored", async () => {
    const t = await tenant("unkcorr");
    const { correctFirstResultEvidence } = await import("@/services/owner-first-run/first-run-actions.service");
    const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");

    // v1: a loss on the stated figures (revenue 40000 vs costs 20000 + 30000); cash 5000 is known.
    const { snap: v1, view: r1 } = await firstRead(t, { revenue: 40000, fixedCosts: 20000, variableCosts: 30000, cashOnHand: 5000 });
    expect(r1.read.noticed).toMatch(/net loss/i);
    expect(r1.read.cannotConclude.join(" ")).not.toMatch(COST_SENTENCE);

    const amend = (snapshotId: string, fields: Record<string, number | null>) =>
      correctFirstResultEvidence(t.workspaceId, t.actorId, t.businessId, snapshotId, { amendmentReason: "owner correction", ...fields } as never);
    const cycles = () => db.ownerFinanceCycle.count({ where: { businessId: t.businessId } });
    const score = async (snapshotId: string) => (await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: snapshotId } })).dataConfidenceScore;

    // 1) known → DIFFERENT known: variable costs 30000 → 10000 (now profitable on the figures).
    expect(await cycles()).toBe(1);
    const c1 = await amend(v1.id, { variableCosts: 10000 });
    expect(c1.diagnosisFailed).toBe(false);
    expect(c1.changedFields).toContain("variableCosts");
    expect(await cycles()).toBe(2); // governed re-evaluation actually ran
    expect(c1.after!.read.noticed).not.toMatch(/net loss/i); // the reasoning moved with the evidence
    const v2 = c1.newSnapshotId;

    // 2) known → UNKNOWN: the owner no longer vouches for variable costs.
    const c2 = await amend(v2, { variableCosts: null });
    expect(c2.diagnosisFailed).toBe(false);
    expect(c2.changedFields).toContain("variableCosts");
    expect(await cycles()).toBe(3);
    const v3 = c2.newSnapshotId;
    const row3 = await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: v3 } });
    expect(row3.variableCosts).toBeNull(); // UNKNOWN is the new current state — not 0, and not the old 10000
    expect(row3.fixedCosts).toBe(20000); // everything else is untouched
    expect(c2.after!.read.cannotConclude.join(" ")).toMatch(COST_SENTENCE);
    // Unsupported downstream calculations are gone: no profit/loss/margin headline survives.
    expect(c2.after!.read.noticed).not.toMatch(/net (loss|profit)|margin/i);
    expect(JSON.stringify(c2.after!.read)).not.toMatch(/\b(?:net loss|net profit of)\b/i);
    expect(await score(v3)).toBeLessThan(await score(v2)); // confidence adjusted
    const head3 = await getFirstMoneyRead(t.workspaceId, t.businessId);
    expect(head3.snapshotId).toBe(v3); // the stale (profitable-looking) read is not left current

    // An unrelated correction afterwards does NOT restore the earlier number.
    const c3 = await amend(v3, { revenue: 45000 });
    const row4 = await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: c3.newSnapshotId } });
    expect(row4.variableCosts).toBeNull();
    expect(row4.revenue).toBe(45000);
    const v4 = c3.newSnapshotId;

    // 3) UNKNOWN → known: an explicit new value (never the old one by itself).
    const c4 = await amend(v4, { variableCosts: 12000 });
    expect(await cycles()).toBe(5);
    const v5 = c4.newSnapshotId;
    expect((await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: v5 } })).variableCosts).toBe(12000);
    expect(c4.after!.read.cannotConclude.join(" ")).not.toMatch(COST_SENTENCE);
    expect(await score(v5)).toBeGreaterThan(await score(v4));

    // Cash: known → UNKNOWN (stored as null, explained), then UNKNOWN → an explicit ZERO (a different state).
    const c5 = await amend(v5, { cashOnHand: null });
    const v6 = c5.newSnapshotId;
    expect((await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: v6 } })).cashOnHand).toBeNull();
    expect(c5.after!.read.cannotConclude.join(" ")).toMatch(CASH_SENTENCE);
    expect(await score(v6)).toBeLessThan(await score(v5));
    const c6 = await amend(v6, { cashOnHand: 0 });
    const v7 = c6.newSnapshotId;
    expect((await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: v7 } })).cashOnHand).toBe(0);
    expect(c6.after!.read.cannotConclude.join(" ")).not.toMatch(CASH_SENTENCE); // zero is evidence, unknown is not
    expect(await cycles()).toBe(7); // 1 initial read + 6 corrections, each re-evaluated

    // History: every version is kept, chained, and the first is untouched.
    const rows = await db.ownerFinancialSnapshot.findMany({ where: { businessId: t.businessId }, orderBy: { version: "asc" } });
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.slice(0, -1).every((r) => r.supersededById !== null)).toBe(true);
    expect(rows[6].supersededById).toBeNull();
    expect(rows[0]).toMatchObject({ revenue: 40000, variableCosts: 30000, cashOnHand: 5000 });
    expect(rows[2].variableCosts).toBeNull();
    // The audit trail says which fields were cleared (as opposed to replaced), and provenance is not upgraded.
    const amendedEvents = await db.auditEvent.findMany({ where: { workspaceId: t.workspaceId, eventName: "owner.finance_snapshot_amended" }, orderBy: { occurredAt: "asc" } });
    const cleared = amendedEvents.map((e) => (e.payload as { clearedFields?: string[] }).clearedFields ?? []);
    expect(cleared.flat()).toEqual(["variableCosts", "cashOnHand"]);
    expect(rows.every((r) => r.evidenceQuality !== "ACTUAL")).toBe(true);
  });

  it("[db] clearing a figure that is already UNKNOWN is not a correction (no empty version minted)", async () => {
    const t = await tenant("unknoop");
    const { correctFirstResultEvidence } = await import("@/services/owner-first-run/first-run-actions.service");
    const { snap } = await firstRead(t, { revenue: 12000, fixedCosts: 7000, variableCosts: 4000 }); // cash already UNKNOWN
    await expect(
      correctFirstResultEvidence(t.workspaceId, t.actorId, t.businessId, snap.id, { amendmentReason: "x", cashOnHand: null } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(1);
  });
});
