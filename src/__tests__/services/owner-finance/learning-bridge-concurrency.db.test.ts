/**
 * Finance learning bridge — permanent PostgreSQL concurrency integration tests.
 *
 * Replaces the deleted ad-hoc concurrent-proof.mjs root-level script.
 * Proves signal + CLC idempotency under concurrent writes using actual PostgreSQL
 * unique constraints and actual service calls. Does NOT mock P2002.
 *
 * Scenario A: bridge vs bridge (same verificationId) → signal_count=1, CLC_count=1
 *   Losing Promise.all arm receives the winner's signalId without throwing.
 *
 * Scenario B: bridge vs reconcile (same verificationId) → signal_count=1, CLC_count=1
 *   reconcileMissingFinanceLearningSignals finds the gap and calls bridge internally;
 *   the direct bridge call races with the reconciler's internal bridge call.
 *
 * Scenario C: repeated reconcile × 3 → counts remain 1/1 (idempotent cron-sweep proof)
 *   Second and third calls find no gaps (outcomeSignal exists) → no duplicate writes.
 *
 * [db]-gated: TEST_WITH_DB=true + real PostgreSQL required.
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-finance/learning-bridge-concurrency.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  bridgeVerificationToLearning,
  reconcileMissingFinanceLearningSignals,
} from "@/services/owner-finance/learning-bridge.service";

// ─── Per-test fixtures (fresh workspace per scenario) ────────────────────────

let workspaceId: string;
let businessId: string;
let cycleId: string;
let actionId: string;
let verificationId: string;
const ACTOR = "system-concurrency-test";

beforeEach(async () => {
  workspaceId = randomUUID();
  businessId = randomUUID();
  const snapshotId = randomUUID();
  cycleId = randomUUID();
  actionId = randomUUID();
  verificationId = randomUUID();

  // ClientAccount.id is the FK target for ControlledLearningCandidate.workspaceId
  await db.clientAccount.create({
    data: { id: workspaceId, name: "Concurrency Test WS", updatedAt: new Date() },
  });

  await db.ownerBusiness.create({
    data: {
      id: businessId, workspaceId, name: "Concurrency Test Biz",
      businessType: "generic_local_service", currency: "INR",
      version: 1, updatedAt: new Date(),
    },
  });

  const snapshotData = {
    id: snapshotId, workspaceId, businessId,
    periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"),
    currency: "INR", dataConfidenceScore: 80, missingCriticalData: [],
    updatedAt: new Date(),
  };
  await db.ownerFinancialSnapshot.create({ data: snapshotData });

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
      recommendationCode: "FINREC_CASH", findingCode: "FIN_CASH_GAP",
      title: "Concurrency Test Action", description: "Concurrent proof",
      ownerRole: "owner", status: "proposed",
      priorityScore: 50, effortScore: 30, expectedImpactScore: 50,
      confidence: 0.7, verificationMetric: "cashReserve",
      verificationMethod: "before/after", expectedTimeframeDays: 30,
      updatedAt: new Date(),
    },
  });

  await db.ownerFinanceVerification.create({
    data: {
      id: verificationId, workspaceId, businessId, actionId,
      verificationMetric: "cashReserve",
      beforeValue: 60, afterValue: 80, targetDirection: "up", targetValue: 70,
      // terminal status required for reconcile gap detection
      status: "verified_improved", verifiedAt: new Date(),
      confidence: 0.8, evidence: [], updatedAt: new Date(),
    },
  });
});

afterEach(async () => {
  // FK-safe teardown: signals (RESTRICT FK) → verifications (RESTRICT FK) →
  // CLC audit entries → CLCs → business (cascades) → account
  await db.ownerFinanceOutcomeSignal.deleteMany({ where: { businessId } });
  await db.ownerFinanceVerification.deleteMany({ where: { businessId } });
  await db.controlledLearningCandidateAuditEntry.deleteMany({ where: { workspaceId } });
  await db.controlledLearningCandidate.deleteMany({ where: { workspaceId } });
  await db.ownerBusiness.delete({ where: { id: businessId } });
  await db.clientAccount.delete({ where: { id: workspaceId } });
});

// ─── Concurrency proof tests ──────────────────────────────────────────────────

describe("[db][concurrency] learning bridge — PostgreSQL unique constraint enforcement", () => {
  it("[db] A: concurrent bridge vs bridge (same verificationId) → signal_count=1, CLC_count=1", async () => {
    // Both arms start simultaneously; the unique constraint on verificationId lets only one win.
    // The loser catches P2002 and reads the winner's signal (actual service behaviour — not mocked).
    const [r1, r2] = await Promise.all([
      bridgeVerificationToLearning(verificationId, workspaceId, ACTOR),
      bridgeVerificationToLearning(verificationId, workspaceId, ACTOR),
    ]);

    const signalCount = await db.ownerFinanceOutcomeSignal.count({
      where: { verificationId },
    });
    const clcCount = await db.controlledLearningCandidate.count({
      where: { workspaceId },
    });

    // Exactly one signal and one CLC — constraint enforced at DB level
    expect(signalCount).toBe(1);
    expect(clcCount).toBe(1);

    // Winner created the signal; loser returned skipped=true with the same signalId
    const winner = [r1, r2].find((r) => !r.skipped);
    const loser = [r1, r2].find((r) => r.skipped);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect(winner!.signalId).toBeTruthy();
    // Loser returned the winner's signalId — idempotent convergence, no throw
    expect(loser!.signalId).toBe(winner!.signalId);
  });

  it("[db] B: concurrent bridge vs reconcile (same verificationId) → signal_count=1, CLC_count=1", async () => {
    // reconcileMissingFinanceLearningSignals finds the verification as a gap (outcomeSignal=null)
    // and calls bridgeVerificationToLearning internally — racing with the direct bridge call.
    const [bridgeResult, reconcileResult] = await Promise.all([
      bridgeVerificationToLearning(verificationId, workspaceId, ACTOR),
      reconcileMissingFinanceLearningSignals(workspaceId, ACTOR),
    ]);

    const signalCount = await db.ownerFinanceOutcomeSignal.count({
      where: { verificationId },
    });
    const clcCount = await db.controlledLearningCandidate.count({
      where: { workspaceId },
    });

    // Exactly one signal and one CLC regardless of which arm won the race
    expect(signalCount).toBe(1);
    expect(clcCount).toBe(1);

    // Exactly one gap was found by reconcile; the combined work produced exactly 1 signal
    expect(reconcileResult.gapsFound).toBe(1);
    // Either bridge bridged or reconcile bridged (never both — one must skip)
    const totalBridged =
      (bridgeResult.skipped ? 0 : 1) + reconcileResult.gapsBridged;
    const totalSkipped =
      (bridgeResult.skipped ? 1 : 0) + reconcileResult.gapsSkipped;
    expect(totalBridged + totalSkipped).toBe(2); // two callers, one verification
    expect(totalBridged).toBe(1);               // only one actually wrote the signal
    expect(reconcileResult.errors).toHaveLength(0);
  });

  it("[db] C: repeated reconcile × 3 → counts remain 1/1 (idempotent cron-sweep proof)", async () => {
    // First call: gap found → creates signal + CLC
    const r1 = await reconcileMissingFinanceLearningSignals(workspaceId, ACTOR);
    expect(r1.gapsFound).toBe(1);
    expect(r1.gapsBridged).toBe(1);
    expect(r1.gapsSkipped).toBe(0);

    // Second call: verification now has outcomeSignal → gap query returns 0
    const r2 = await reconcileMissingFinanceLearningSignals(workspaceId, ACTOR);
    expect(r2.gapsFound).toBe(0);
    expect(r2.gapsBridged).toBe(0);

    // Third call: same — no duplicates, no errors
    const r3 = await reconcileMissingFinanceLearningSignals(workspaceId, ACTOR);
    expect(r3.gapsFound).toBe(0);
    expect(r3.gapsBridged).toBe(0);
    expect(r3.errors).toHaveLength(0);

    // Counts remain exactly 1/1 across all three calls
    const signalCount = await db.ownerFinanceOutcomeSignal.count({
      where: { verificationId },
    });
    const clcCount = await db.controlledLearningCandidate.count({
      where: { workspaceId },
    });
    expect(signalCount).toBe(1);
    expect(clcCount).toBe(1);
  });
});
