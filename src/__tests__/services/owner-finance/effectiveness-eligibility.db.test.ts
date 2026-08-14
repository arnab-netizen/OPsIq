/**
 * Effectiveness eligibility governance gate — real PostgreSQL integration tests.
 *
 * Proves the getFinanceEffectivenessMap governance gate (owner decision 2026-08-14):
 *   1. Signal with no CLC (learningCandidateId=null) → excluded unconditionally
 *   2. Signal with non-promoted CLC (promotionLocked=false) → excluded from sample
 *   3. n=3 signals, only 2 CLCs promoted → n_eligible=2 < MIN_SAMPLE=3 → modifier=0
 *   4. All 3 CLCs promoted → n_eligible=3 >= MIN_SAMPLE → Bayesian modifier applied
 *   5. Cross-workspace: another workspace's promoted signal never bleeds over
 *   6. CLC promotion state gates eligibility; signal evidence (reachedTarget) is immutable
 *
 * Hard rule: critical-severity modifier is blocked at domain layer (modifierAllowedForSeverity).
 * Tenant boundary: service is workspaceId-scoped; cross-workspace signals are structurally excluded.
 *
 * [db]-gated: TEST_WITH_DB=true + real PostgreSQL required.
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-finance/effectiveness-eligibility.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getFinanceEffectivenessMap } from "@/services/owner-finance/effectiveness.service";
import { MIN_SAMPLE, modifierAllowedForSeverity } from "@/domain/owner-finance/outcome-signals";

// ─── Shared FK scaffold (one set per test run) ────────────────────────────────

let workspaceId: string;
let businessId: string;
let cycleId: string;
let actionId: string;

beforeAll(async () => {
  workspaceId = randomUUID();
  businessId = randomUUID();
  const snapshotId = randomUUID();
  cycleId = randomUUID();
  actionId = randomUUID();

  // ClientAccount.id is the FK target for ControlledLearningCandidate.workspaceId
  await db.clientAccount.create({
    data: { id: workspaceId, name: "Eligibility Gate Test WS", updatedAt: new Date() },
  });

  await db.ownerBusiness.create({
    data: {
      id: businessId, workspaceId, name: "Eligibility Test Biz",
      businessType: "generic_local_service", currency: "INR",
      version: 1, updatedAt: new Date(),
    },
  });

  await db.ownerFinancialSnapshot.create({
    data: {
      id: snapshotId, workspaceId, businessId,
      periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"),
      currency: "INR", dataConfidenceScore: 80, missingCriticalData: [],
      updatedAt: new Date(),
    },
  });

  await db.ownerFinanceCycle.create({
    data: {
      id: cycleId, workspaceId, businessId, snapshotId,
      sequenceNumber: 1, status: "open",
      overallHealthScore: 70, survivalRiskScore: 20, growthOpportunityScore: 30,
      dataConfidenceScore: 80, survivalState: "SAFE",
      generatedAt: new Date(), updatedAt: new Date(),
    },
  });

  await db.ownerFinanceAction.create({
    data: {
      id: actionId, workspaceId, businessId, cycleId,
      recommendationCode: "FINREC_SHARED", findingCode: "FC_SHARED",
      title: "Shared Test Action", description: "Eligibility gate test", ownerRole: "owner",
      status: "proposed", priorityScore: 50, effortScore: 30, expectedImpactScore: 50,
      confidence: 0.7, verificationMetric: "cashReserve", verificationMethod: "before/after",
      expectedTimeframeDays: 30, updatedAt: new Date(),
    },
  });
});

afterAll(async () => {
  // FK-safe teardown order:
  // outcome signals first (RESTRICT FK → verification, action, business)
  await db.ownerFinanceOutcomeSignal.deleteMany({ where: { businessId } });
  // verifications next (RESTRICT FK → business, action)
  await db.ownerFinanceVerification.deleteMany({ where: { businessId } });
  // CLC audit entries before CLCs (default RESTRICT FK)
  await db.controlledLearningCandidateAuditEntry.deleteMany({ where: { workspaceId } });
  await db.controlledLearningCandidate.deleteMany({ where: { workspaceId } });
  // business cascades: cycles, findings, actions, snapshots
  await db.ownerBusiness.delete({ where: { id: businessId } });
  await db.clientAccount.delete({ where: { id: workspaceId } });
});

// ─── Test data helpers ────────────────────────────────────────────────────────

async function makeVerification(): Promise<string> {
  const id = randomUUID();
  await db.ownerFinanceVerification.create({
    data: {
      id, workspaceId, businessId, actionId,
      verificationMetric: "cashReserve",
      beforeValue: 60, afterValue: 80, targetDirection: "up", targetValue: 70,
      status: "verified_improved", verifiedAt: new Date(),
      confidence: 0.8, evidence: [], updatedAt: new Date(),
    },
  });
  return id;
}

async function makeSignal(
  verificationId: string,
  findingCode: string,
  reachedTarget: boolean,
  clcId: string | null
): Promise<string> {
  const id = randomUUID();
  await db.ownerFinanceOutcomeSignal.create({
    data: {
      id, workspaceId, businessId, verificationId, actionId,
      findingCode, recommendationCode: "FINREC_TEST",
      verificationStatus: "verified_improved", reachedTarget,
      beforeValue: 60, afterValue: 80,
      learningCandidateId: clcId,
      recordedAt: new Date(), updatedAt: new Date(),
    },
  });
  return id;
}

async function makeCLC(promotionLocked: boolean): Promise<string> {
  const fp = `test-eligibility::${cycleId}::${actionId}::${randomUUID()}`;
  const clc = await db.controlledLearningCandidate.create({
    data: {
      workspaceId, businessId,
      sourceOwnerDecisionId: cycleId, sourceActionId: actionId,
      sourceOutcomeId: randomUUID(),
      eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
      rejectionReasons: "[]", evidenceSourceType: "owner_manual_entry",
      evidenceSummary: "eligibility gate test signal",
      auditFingerprint: fp, metadata: "{}",
      promotionLocked,
      promotedAt: promotionLocked ? new Date() : null,
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  return clc.id;
}

// ─── Governance eligibility tests ─────────────────────────────────────────────

describe("[db][governance] getFinanceEffectivenessMap eligibility gate", () => {
  it("[db] 1: signal with learningCandidateId=null excluded unconditionally (step 1 gate)", async () => {
    const fc = `FC_NULL_${randomUUID().slice(0, 8)}`;
    const verId = await makeVerification();
    await makeSignal(verId, fc, true, null);

    const map = await getFinanceEffectivenessMap(workspaceId, [fc]);

    // Step 1: WHERE learningCandidateId IS NOT NULL — null signals never reach step 2
    expect(map.has(fc)).toBe(false);
    expect(map.size).toBe(0);
  });

  it("[db] 2: signal with non-promoted CLC (promotionLocked=false) excluded from sample", async () => {
    const fc = `FC_UNPROMOTED_${randomUUID().slice(0, 8)}`;
    const clcId = await makeCLC(false);
    const verId = await makeVerification();
    await makeSignal(verId, fc, true, clcId);

    const map = await getFinanceEffectivenessMap(workspaceId, [fc]);

    // Step 2: CLC has promotionLocked=false → excluded by promotedSet filter
    expect(map.has(fc)).toBe(false);
  });

  it("[db] 3: n=3 signals, only 2 promoted → n_eligible=2 < MIN_SAMPLE → modifier=0", async () => {
    const fc = `FC_PARTIAL_${randomUUID().slice(0, 8)}`;

    const clcPromoted1 = await makeCLC(true);
    const clcPromoted2 = await makeCLC(true);
    const clcUnpromoted = await makeCLC(false);

    const v1 = await makeVerification();
    const v2 = await makeVerification();
    const v3 = await makeVerification();

    await makeSignal(v1, fc, true, clcPromoted1);
    await makeSignal(v2, fc, true, clcPromoted2);
    await makeSignal(v3, fc, true, clcUnpromoted); // excluded

    const map = await getFinanceEffectivenessMap(workspaceId, [fc]);

    // 2 eligible signals: n=2 < MIN_SAMPLE=3 → cold-start guard → modifier=0
    expect(map.has(fc)).toBe(true);
    const agg = map.get(fc)!;
    expect(agg.n).toBe(2);
    expect(agg.modifier).toBe(0);
    expect(MIN_SAMPLE).toBe(3); // document the threshold
  });

  it("[db] 4: all 3 CLCs promoted → n_eligible=3 >= MIN_SAMPLE → Bayesian modifier ≠ 0", async () => {
    const fc = `FC_ALL_PROMOTED_${randomUUID().slice(0, 8)}`;

    const clc1 = await makeCLC(true);
    const clc2 = await makeCLC(true);
    const clc3 = await makeCLC(true);

    const v1 = await makeVerification();
    const v2 = await makeVerification();
    const v3 = await makeVerification();

    await makeSignal(v1, fc, true, clc1);
    await makeSignal(v2, fc, true, clc2);
    await makeSignal(v3, fc, true, clc3);

    const map = await getFinanceEffectivenessMap(workspaceId, [fc]);

    // n=3, all improved:
    //   shrunk = (3 + 5*0.5) / (3 + 5) = 5.5 / 8 = 0.6875
    //   deviation = 0.6875 - 0.5 = 0.1875
    //   modifier = clamp(0.1875 * 2 * 0.10, -0.10, 0.10) = 0.0375
    expect(map.has(fc)).toBe(true);
    const agg = map.get(fc)!;
    expect(agg.n).toBe(3);
    expect(agg.modifier).toBeCloseTo(0.0375, 10);
    expect(agg.modifier).not.toBe(0);
  });

  it("[db] 5: cross-workspace isolation — another workspace's promoted signal never contributes", async () => {
    const wsB = randomUUID();
    const bizB = randomUUID();
    const fc = `FC_CROSS_WS_${randomUUID().slice(0, 8)}`;

    // Create ws-B fixtures with the same findingCode
    await db.clientAccount.create({ data: { id: wsB, name: "Cross-WS Test WS-B", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizB, workspaceId: wsB, name: "WS-B Biz", businessType: "generic_local_service", currency: "INR", version: 1, updatedAt: new Date() } });

    const snapBId = randomUUID();
    await db.ownerFinancialSnapshot.create({ data: { id: snapBId, workspaceId: wsB, businessId: bizB, periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), currency: "INR", dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date() } });

    const cycleBId = randomUUID();
    await db.ownerFinanceCycle.create({ data: { id: cycleBId, workspaceId: wsB, businessId: bizB, snapshotId: snapBId, sequenceNumber: 1, status: "open", overallHealthScore: 70, survivalRiskScore: 20, growthOpportunityScore: 30, dataConfidenceScore: 80, survivalState: "SAFE", generatedAt: new Date(), updatedAt: new Date() } });

    const actionBId = randomUUID();
    await db.ownerFinanceAction.create({ data: { id: actionBId, workspaceId: wsB, businessId: bizB, cycleId: cycleBId, recommendationCode: "FINREC_B", findingCode: fc, title: "WS-B Action", description: "WS-B", ownerRole: "owner", status: "proposed", priorityScore: 50, effortScore: 30, expectedImpactScore: 50, confidence: 0.7, verificationMetric: "cashReserve", verificationMethod: "before/after", expectedTimeframeDays: 30, updatedAt: new Date() } });

    // Create promoted CLC + signal in ws-B (n=3 to ensure modifier would apply if it leaked)
    const clcIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const fpB = `test-b::${cycleBId}::${actionBId}::${randomUUID()}`;
      const verBId = randomUUID();
      await db.ownerFinanceVerification.create({ data: { id: verBId, workspaceId: wsB, businessId: bizB, actionId: actionBId, verificationMetric: "cashReserve", beforeValue: 60, afterValue: 80, targetDirection: "up", targetValue: 70, status: "verified_improved", verifiedAt: new Date(), confidence: 0.8, evidence: [], updatedAt: new Date() } });
      const clcB = await db.controlledLearningCandidate.create({ data: { workspaceId: wsB, businessId: bizB, sourceOwnerDecisionId: cycleBId, sourceActionId: actionBId, sourceOutcomeId: randomUUID(), eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME", rejectionReasons: "[]", evidenceSourceType: "owner_manual_entry", evidenceSummary: "ws-b signal", auditFingerprint: fpB, metadata: "{}", promotionLocked: true, promotedAt: new Date(), updatedAt: new Date() }, select: { id: true } });
      clcIds.push(clcB.id);
      await db.ownerFinanceOutcomeSignal.create({ data: { id: randomUUID(), workspaceId: wsB, businessId: bizB, verificationId: verBId, actionId: actionBId, findingCode: fc, recommendationCode: "FINREC_B", verificationStatus: "verified_improved", reachedTarget: true, beforeValue: 60, afterValue: 80, learningCandidateId: clcB.id, recordedAt: new Date(), updatedAt: new Date() } });
    }

    try {
      // Workspace A has no signals for this findingCode → empty map
      const mapA = await getFinanceEffectivenessMap(workspaceId, [fc]);
      expect(mapA.has(fc)).toBe(false);

      // Workspace B's own query returns correctly (sanity check)
      const mapB = await getFinanceEffectivenessMap(wsB, [fc]);
      expect(mapB.has(fc)).toBe(true);
      expect(mapB.get(fc)!.n).toBe(3);
    } finally {
      await db.ownerFinanceOutcomeSignal.deleteMany({ where: { businessId: bizB } });
      await db.ownerFinanceVerification.deleteMany({ where: { businessId: bizB } });
      await db.controlledLearningCandidateAuditEntry.deleteMany({ where: { workspaceId: wsB } });
      await db.controlledLearningCandidate.deleteMany({ where: { workspaceId: wsB } });
      await db.ownerBusiness.delete({ where: { id: bizB } });
      await db.clientAccount.delete({ where: { id: wsB } });
    }
  });

  it("[db] 6: signal evidence (reachedTarget) is immutable; CLC promotion gates eligibility only", async () => {
    const fc = `FC_IMMUTABLE_${randomUUID().slice(0, 8)}`;

    // Create signal linked to non-promoted CLC
    const clcId = await makeCLC(false);
    const verId = await makeVerification();
    const signalId = await makeSignal(verId, fc, true, clcId);

    // Before promotion: signal is excluded → empty map
    const mapBefore = await getFinanceEffectivenessMap(workspaceId, [fc]);
    expect(mapBefore.has(fc)).toBe(false);

    // Simulate promotion (direct DB update; bypasses service immutability guard for gate test)
    await db.controlledLearningCandidate.update({
      where: { id: clcId },
      data: { promotionLocked: true, promotedAt: new Date(), updatedAt: new Date() },
    });

    // After promotion: signal is eligible (n=1 < MIN_SAMPLE → modifier=0, but map has entry)
    const mapAfter = await getFinanceEffectivenessMap(workspaceId, [fc]);
    expect(mapAfter.has(fc)).toBe(true);
    const agg = mapAfter.get(fc)!;
    expect(agg.n).toBe(1);
    expect(agg.modifier).toBe(0); // n < MIN_SAMPLE, but signal is counted

    // Signal evidence is unchanged — factual historical data is immutable
    const signal = await db.ownerFinanceOutcomeSignal.findUnique({
      where: { id: signalId },
      select: { reachedTarget: true },
    });
    expect(signal?.reachedTarget).toBe(true); // unchanged regardless of CLC promotion state
  });

  it("hard rule: modifierAllowedForSeverity blocks critical findings (domain-layer immutable guard)", () => {
    // Critical findings cannot be modified regardless of CLC promotion state.
    // This is a domain-layer hard rule, not a DB query filter.
    expect(modifierAllowedForSeverity("critical")).toBe(false);
    expect(modifierAllowedForSeverity("high")).toBe(true);
    expect(modifierAllowedForSeverity("medium")).toBe(true);
    expect(modifierAllowedForSeverity("low")).toBe(true);
  });
});
