/**
 * Hostile-audit D1: known evidence → diagnosis/action → owner accepts → underlying evidence changed to UNKNOWN →
 * the diagnosis withdraws → Home must not present the old action as the owner's current next move.
 * Proven through the real services and a real database.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] next move validity after an evidence correction", () => {
  async function accepted(figures: Record<string, unknown>) {
    const actorId = randomUUID();
    const workspaceId = randomUUID();
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "nm", slug: `nm-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    const { createBusiness } = await import("@/services/founder-recovery/business.service");
    const b = await createBusiness({ name: "NM QA", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actorId, workspaceId);
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
    const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");
    const { acceptFirstResultAction } = await import("@/services/owner-first-run/first-run-actions.service");
    const snap = await createFinancialSnapshot(b.id, { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", evidenceQuality: "GOOD_ESTIMATE", ...figures } as never, actorId, workspaceId);
    await runFinanceDiagnosis(b.id, snap.id, actorId, workspaceId);
    const read = await getFirstMoneyRead(workspaceId, b.id);
    await acceptFirstResultAction(workspaceId, actorId, b.id, read.cycleId + "-k", read.cycleId);
    return { actorId, workspaceId, businessId: b.id, snapId: snap.id };
  }

  // Decision records are governed (RESTRICT FK to the business), so — exactly like first-run.db.test.ts — this suite's uniquely
  // scoped tenants stay in the throwaway test database; nothing governed is deleted to make teardown tidy.

  const KNOWN = { revenue: 80000, fixedCosts: 20000, variableCosts: 35000, receivables: 60000, cashOnHand: 5000 };

  it("[db] accepted on known evidence → CURRENT next move", async () => {
    const t = await accepted(KNOWN);
    const { getAcceptedNextMove } = await import("@/services/owner-first-run/next-move.service");
    const move = await getAcceptedNextMove(t.workspaceId, t.businessId);
    expect(move?.validity).toBe("CURRENT");
    expect(move?.validityHeading).toBeNull();
  });

  it("[db] revenue corrected to UNKNOWN → diagnosis withdraws → the old action is NOT the current next move (SUPERSEDED)", async () => {
    const t = await accepted(KNOWN);
    const { getAcceptedNextMove } = await import("@/services/owner-first-run/next-move.service");
    const { correctFirstResultEvidence } = await import("@/services/owner-first-run/first-run-actions.service");
    const before = await getAcceptedNextMove(t.workspaceId, t.businessId);
    expect(before?.validity).toBe("CURRENT");
    const c = await correctFirstResultEvidence(t.workspaceId, t.actorId, t.businessId, t.snapId, { amendmentReason: "revenue not reliable", revenue: null } as never);
    expect(c.diagnosisFailed).toBe(false);
    const move = await getAcceptedNextMove(t.workspaceId, t.businessId);
    expect(move?.validity).toBe("SUPERSEDED");
    expect(move?.validityHeading).toMatch(/Earlier action/);
    expect(move?.validityHeading).not.toMatch(/next move/i);
    expect(move?.prompt).toBeNull();
    // The accepted decision stays on record (history is never rewritten).
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, businessId: t.businessId, decisionState: "ACCEPTED" } })).toBe(1);
  });

  it("[db] figures amended and not yet re-read → NEEDS_REASSESSMENT", async () => {
    const t = await accepted(KNOWN);
    const { getAcceptedNextMove } = await import("@/services/owner-first-run/next-move.service");
    const { amendFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    await amendFinancialSnapshot(t.snapId, { amendmentReason: "revenue changed", revenue: 79000 } as never, t.actorId, t.workspaceId);
    expect((await getAcceptedNextMove(t.workspaceId, t.businessId))?.validity).toBe("NEEDS_REASSESSMENT");
  });

  it("[db] figures corrected to another known value and re-read: the finding still stands → STALE (re-confirm), never CURRENT", async () => {
    const t = await accepted(KNOWN);
    const { getAcceptedNextMove } = await import("@/services/owner-first-run/next-move.service");
    const { correctFirstResultEvidence } = await import("@/services/owner-first-run/first-run-actions.service");
    await correctFirstResultEvidence(t.workspaceId, t.actorId, t.businessId, t.snapId, { amendmentReason: "small fix", revenue: 79000 } as never);
    const move = await getAcceptedNextMove(t.workspaceId, t.businessId);
    expect(["STALE", "SUPERSEDED"]).toContain(move?.validity);
    expect(move?.validity).not.toBe("CURRENT");
  });
});
