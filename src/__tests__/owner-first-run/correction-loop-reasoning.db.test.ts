/**
 * OBQ correction loop — governed re-evaluation must change the reasoning, not just the stored number.
 *
 * Deliberately wrong but VALID evidence (revenue overstated ~5x, so the business looks comfortably profitable) is read,
 * then corrected through the real first-run correction service. Proves: the initial read matches the wrong evidence;
 * the superseded version is kept and the new head is the corrected one; the old read can no longer be presented as
 * current (getFirstMoneyRead on the superseded snapshot is refused until re-run); the re-run read differs from the
 * first one in its finding/value; and provenance (evidence quality) travels with the correction.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] correction loop changes downstream reasoning", () => {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  let businessId = "";

  afterAll(async () => {
    if (businessId) await teardownOwnerBusiness(businessId);
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] wrong revenue -> read; corrected revenue -> superseded + re-run read with a different finding", async () => {
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Loop WS", slug: `loop-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    const { createBusiness } = await import("@/services/founder-recovery/business.service");
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
    const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");
    const { correctFirstResultEvidence } = await import("@/services/owner-first-run/first-run-actions.service");

    const biz = await createBusiness(
      { name: "Loop QA", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actorId, workspaceId,
    );
    businessId = biz.id;

    // WRONG but valid: owner typed 5x the real revenue.
    const wrong = await createFinancialSnapshot(
      businessId,
      { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 500000, fixedCosts: 90000, variableCosts: 60000, cashOnHand: 40000, evidenceQuality: "GOOD_ESTIMATE" },
      actorId, workspaceId,
    );
    await runFinanceDiagnosis(businessId, wrong.id, actorId, workspaceId);
    const first = await getFirstMoneyRead(workspaceId, businessId);
    expect(first.snapshotId).toBe(wrong.id);
    expect(first.figures.revenue).toBe(500000);

    // The truth: revenue was 100000, i.e. below costs.
    const corrected = await correctFirstResultEvidence(workspaceId, actorId, businessId, wrong.id, {
      amendmentReason: "Typed the wrong revenue",
      revenue: 100000,
    } as never);

    // 1-3: version history kept, new head is the corrected value, old one superseded and unchanged.
    expect(corrected.changedFields).toContain("revenue");
    const rows = await db.ownerFinancialSnapshot.findMany({ where: { businessId }, orderBy: { version: "asc" } });
    expect(rows.map((r) => [r.version, r.revenue, r.supersededById !== null])).toEqual([[1, 500000, true], [2, 100000, false]]);

    // 4-5: governed re-evaluation happened and the reasoning moved with the evidence.
    expect(corrected.diagnosisFailed).toBe(false);
    expect(corrected.after).not.toBeNull();
    const after = corrected.after!;
    expect(after.snapshotId).toBe(corrected.newSnapshotId);
    expect(after.snapshotId).not.toBe(first.snapshotId);
    expect(after.figures.revenue).toBe(100000);
    const changed =
      after.read.noticed !== first.read.noticed ||
      after.read.actualValue !== first.read.actualValue ||
      after.read.recommendedAction !== first.read.recommendedAction;
    expect(changed, "the re-run read must differ from the read built on the wrong revenue").toBe(true);

    // 6: the stale read is not left current — the head is the corrected snapshot and the old read is not re-presented.
    const head = await getFirstMoneyRead(workspaceId, businessId);
    expect(head.snapshotId).toBe(corrected.newSnapshotId);
    expect(head.read.noticed).toBe(after.read.noticed);

    // 7: provenance survives; stating nothing new about reliability must not upgrade GOOD_ESTIMATE.
    expect(rows[1].evidenceQuality).not.toBe("ACTUAL");
  });
});
