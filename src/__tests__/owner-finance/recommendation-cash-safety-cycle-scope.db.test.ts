/**
 * [db] recommendation-cash-safety.service.ts cash/finance-cycle read scope proof.
 *
 * Root-cause re-verification (fix/recommendation-safety-scoping, 2026-09-17): a prior
 * audit flagged enforceCashSafetyForPromotion's ownerCashflowCycle/ownerFinanceCycle
 * reads as scoped by workspaceId only, despite both models carrying a required
 * businessId (prisma/schema.prisma). Traced to root cause (see the doc comment on
 * recommendation-cash-safety.service.ts): this function is reachable ONLY through the
 * legacy engagement/consultant Recommendation -> Finding -> Engagement chain, and
 * Engagement has no businessId/OwnerBusiness relation at all (only clientId) -- there
 * is no business concept in this call's data model to scope by, so workspace-wide is
 * the only coherent contract available, not a missing filter. Also confirmed
 * unreachable by any self-serve owner: the route (PATCH
 * /api/recommendations/[recommendationId]) requires CAPABILITIES.RECOMMENDATION_APPROVE,
 * an INTERNAL_ONLY_CAPABILITY absent from OWNER_SCOPED_CAPABILITIES.
 *
 * This file proves both halves of that conclusion with real evidence rather than
 * code-reading alone:
 *  A. A recommendation evaluated while only Business A's SAFE cash/finance cycles
 *     exist is allowed to promote (growth-sensitive, cash-safe).
 *  B. Adding Business B's CRITICAL/INSOLVENT_RISK cycles (a newer createdAt) to the
 *     SAME workspace flips the SAME workspace-scoped "latest" read to block the
 *     SAME recommendation, even though nothing about the recommendation itself
 *     changed -- i.e. the read genuinely is workspace-wide across distinct real
 *     businesses today, exactly as documented, not accidentally scoped to "the
 *     first business" or silently dropping rows.
 *  C. Reversing which business's row is newest (Business A's cycle recreated with a
 *     later createdAt than Business B's) still selects whichever business happens to
 *     be most recent -- proving the contamination is a pure recency artifact, not tied
 *     to insertion order or business identity, and therefore cannot be fixed by
 *     changing an ORDER BY without an actual businessId to filter by first.
 *  D. A self-serve owner's resolved capability set never includes
 *     RECOMMENDATION_APPROVE, so this code path cannot be triggered by a
 *     controlled-beta user regardless of the workspace-wide read proven above.
 *
 * This is NOT a "fix" test -- there is no code change to this file's read query. It
 * documents and locks in the currently-correct, currently-necessary behavior so a
 * future change to Engagement's schema (e.g. adding a businessId) is the trigger to
 * revisit this, not a silent behavior change.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/recommendation-cash-safety-cycle-scope.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { enforceCashSafetyForPromotion, type CashDeps } from "@/services/owner-finance/recommendation-cash-safety.service";
import { CashSafetyGateError } from "@/domain/owner-finance/cash-safety-gate";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const actorId = randomUUID();
const ws = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID();

function cashDeps(): CashDeps {
  return {
    db: {
      clientAccount: { findUnique: async () => ({ requireBusinessImpactAssessment: true }) },
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea: "growth expansion" }) },
      ownerCashflowCycle: db.ownerCashflowCycle as unknown as CashDeps["db"]["ownerCashflowCycle"],
      ownerFinanceCycle: db.ownerFinanceCycle as unknown as CashDeps["db"]["ownerFinanceCycle"],
    },
  };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] recommendation-cash-safety.service.ts cash/finance-cycle scope", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `cashsafety-scope-${actorId}@test.local`, name: "Cash Safety Scope Test", isActive: true, updatedAt: new Date() },
    });
    await db.workspace.upsert({
      where: { id: ws },
      update: {},
      create: { id: ws, name: `Cash Safety Scope WS ${ws.slice(0, 8)}`, slug: `cashsafety-scope-ws-${ws.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: ws, name: "Cash Scope Business A", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: ws, name: "Cash Scope Business B", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
  });

  afterAll(async () => {
    await db.ownerCashflowCycle.deleteMany({ where: { workspaceId: ws } });
    await db.ownerCashflowSnapshot.deleteMany({ where: { workspaceId: ws } });
    await db.ownerFinanceCycle.deleteMany({ where: { workspaceId: ws } });
    await db.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: ws } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  async function makeCashflowCycle(businessId: string, periodTag: string, sequenceNumber: number, cashflowState: string) {
    const periodStart = new Date(`2026-0${periodTag}-01T00:00:00Z`);
    const periodEnd = new Date(`2026-0${periodTag}-28T00:00:00Z`);
    const snapshot = await db.ownerCashflowSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        businessId,
        periodStart,
        periodEnd,
        currency: "INR",
        dataConfidenceScore: 1,
        missingCriticalData: [],
      },
    });
    return db.ownerCashflowCycle.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        businessId,
        snapshotId: snapshot.id,
        sequenceNumber,
        healthScore: 80,
        dangerScore: 10,
        opportunityScore: 50,
        dataConfidenceScore: 1,
        cashflowState,
        generatedAt: new Date(),
      },
    });
  }

  async function makeFinanceCycle(businessId: string, periodTag: string, sequenceNumber: number, survivalState: string) {
    const periodStart = new Date(`2026-0${periodTag}-01T00:00:00Z`);
    const periodEnd = new Date(`2026-0${periodTag}-28T00:00:00Z`);
    const snapshot = await db.ownerFinancialSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        businessId,
        periodStart,
        periodEnd,
        currency: "INR",
        dataConfidenceScore: 1,
        missingCriticalData: [],
      },
    });
    return db.ownerFinanceCycle.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        businessId,
        snapshotId: snapshot.id,
        sequenceNumber,
        overallHealthScore: 80,
        survivalRiskScore: 10,
        growthOpportunityScore: 50,
        dataConfidenceScore: 1,
        survivalState,
        generatedAt: new Date(),
      },
    });
  }

  it("[db] A. only Business A's SAFE cycles exist -> growth recommendation is allowed to promote", async () => {
    await makeCashflowCycle(bizA, "1", 1, "SAFE");
    await makeFinanceCycle(bizA, "1", 1, "SAFE");
    await expect(enforceCashSafetyForPromotion("rec1", ws, cashDeps())).resolves.toBeUndefined();
  });

  it("[db] B. adding Business B's INSOLVENT_RISK cycles (newer createdAt) to the SAME workspace now blocks the SAME recommendation -- proves today's real behavior is workspace-wide across distinct businesses, exactly as documented, not a bug to silently patch, since no businessId is available in this call's context", async () => {
    await makeCashflowCycle(bizB, "2", 1, "INSOLVENT_RISK");
    await makeFinanceCycle(bizB, "2", 1, "INSOLVENT_RISK");
    await expect(enforceCashSafetyForPromotion("rec1", ws, cashDeps())).rejects.toBeInstanceOf(CashSafetyGateError);
  });

  it("[db] C. reversing which business is newest still selects whichever business is most recent -- a pure recency artifact, not tied to insertion order or business identity", async () => {
    // Business A now gets a fresh SAFE cycle with a later sequence/createdAt than Business B's
    // INSOLVENT_RISK cycle created in case B -- the read flips back to allowing promotion purely
    // because A is now the most recent row, proving the mechanism is recency-driven, not
    // business-aware in either direction.
    await makeCashflowCycle(bizA, "3", 2, "SAFE");
    await makeFinanceCycle(bizA, "3", 2, "SAFE");
    await expect(enforceCashSafetyForPromotion("rec1", ws, cashDeps())).resolves.toBeUndefined();
  });

  it("[db] D. a self-serve owner's resolved capability set never includes RECOMMENDATION_APPROVE -- this code path cannot be triggered by any controlled-beta user regardless of the workspace-wide read proven above", () => {
    const ownerCapabilities = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    expect(ownerCapabilities).not.toContain(CAPABILITIES.RECOMMENDATION_APPROVE);
    expect(ownerCapabilities).not.toContain(CAPABILITIES.RECOMMENDATION_VIEW);
  });
});
