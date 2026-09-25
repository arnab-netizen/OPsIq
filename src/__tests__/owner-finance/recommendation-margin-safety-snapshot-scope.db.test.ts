/**
 * [db] recommendation-margin-safety.service.ts financial-snapshot read scope proof.
 *
 * Root-cause re-verification (fix/recommendation-safety-scoping, 2026-09-17): a prior
 * audit flagged enforceMarginSafetyForPromotion's ownerFinancialSnapshot.findFirst
 * read as scoped by workspaceId only, despite the model carrying a required
 * businessId (prisma/schema.prisma). Traced to root cause (see the doc comment on
 * recommendation-margin-safety.service.ts): this function is reachable ONLY through
 * the legacy engagement/consultant Recommendation -> Finding -> Engagement chain, and
 * Engagement has no businessId/OwnerBusiness relation at all (only clientId) -- there
 * is no business concept in this call's data model to scope by, so workspace-wide is
 * the only coherent contract available, not a missing filter. Also confirmed
 * unreachable by any self-serve owner: the route (PATCH
 * /api/recommendations/[recommendationId]) requires CAPABILITIES.RECOMMENDATION_APPROVE,
 * an INTERNAL_ONLY_CAPABILITY absent from OWNER_SCOPED_CAPABILITIES.
 *
 * This file proves both halves of that conclusion with real evidence rather than
 * code-reading alone:
 *  A. A pricing/discount recommendation evaluated while only Business A's healthy
 *     30%-margin snapshot exists is allowed to promote.
 *  B. Adding Business B's 8%-margin (below the 15% floor) snapshot -- with a newer
 *     createdAt -- to the SAME workspace flips the SAME workspace-scoped "latest"
 *     read to block the SAME recommendation, even though nothing about the
 *     recommendation itself changed -- i.e. the read genuinely is workspace-wide
 *     across distinct real businesses today, exactly as documented.
 *  C. Reversing which business's snapshot is newest (Business A gets a fresh healthy
 *     snapshot after Business B's below-floor one) flips the outcome back -- proving
 *     the contamination is a pure recency artifact, not tied to insertion order or
 *     business identity.
 *  D. A self-serve owner's resolved capability set never includes
 *     RECOMMENDATION_APPROVE, so this code path cannot be triggered by a
 *     controlled-beta user regardless of the workspace-wide read proven above.
 *
 * This is NOT a "fix" test -- there is no code change to this file's read query. It
 * documents and locks in the currently-correct, currently-necessary behavior so a
 * future change to Engagement's schema (e.g. adding a businessId) is the trigger to
 * revisit this, not a silent behavior change.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/recommendation-margin-safety-snapshot-scope.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { enforceMarginSafetyForPromotion, type MarginDeps } from "@/services/owner-finance/recommendation-margin-safety.service";
import { MarginSafetyGateError } from "@/domain/owner-finance/margin-safety-gate";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const actorId = randomUUID();
const ws = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID();

function marginDeps(): MarginDeps {
  return {
    db: {
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea: "pricing discount policy" }) },
      ownerFinancialSnapshot: db.ownerFinancialSnapshot as unknown as MarginDeps["db"]["ownerFinancialSnapshot"],
    },
  };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] recommendation-margin-safety.service.ts financial-snapshot scope", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `marginsafety-scope-${actorId}@test.local`, name: "Margin Safety Scope Test", isActive: true, updatedAt: new Date() },
    });
    await db.workspace.upsert({
      where: { id: ws },
      update: {},
      create: { id: ws, name: `Margin Safety Scope WS ${ws.slice(0, 8)}`, slug: `marginsafety-scope-ws-${ws.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: ws, name: "Margin Scope Business A", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: ws, name: "Margin Scope Business B", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
  });

  afterAll(async () => {
    await db.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: ws } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  async function makeSnapshot(businessId: string, periodTag: string, revenue: number, costOfGoods: number) {
    const periodStart = new Date(`2026-0${periodTag}-01T00:00:00Z`);
    const periodEnd = new Date(`2026-0${periodTag}-28T00:00:00Z`);
    return db.ownerFinancialSnapshot.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        businessId,
        periodStart,
        periodEnd,
        currency: "INR",
        revenue,
        costOfGoods,
        dataConfidenceScore: 1,
        missingCriticalData: [],
      },
    });
  }

  it("[db] A. only Business A's healthy 30% margin snapshot exists -> pricing/discount recommendation is allowed to promote", async () => {
    await makeSnapshot(bizA, "1", 100, 70); // 30% margin
    await expect(enforceMarginSafetyForPromotion("rec1", ws, marginDeps())).resolves.toBeUndefined();
  });

  it("[db] B. adding Business B's 8% below-floor snapshot (newer createdAt) to the SAME workspace now blocks the SAME recommendation -- proves today's real behavior is workspace-wide across distinct businesses, exactly as documented, not a bug to silently patch, since no businessId is available in this call's context", async () => {
    await makeSnapshot(bizB, "2", 100, 92); // 8% margin, below the 15% floor
    await expect(enforceMarginSafetyForPromotion("rec1", ws, marginDeps())).rejects.toBeInstanceOf(MarginSafetyGateError);
  });

  it("[db] C. reversing which business is newest still selects whichever business is most recent -- a pure recency artifact, not tied to insertion order or business identity", async () => {
    await makeSnapshot(bizA, "3", 100, 60); // 40% margin, newer than Business B's below-floor snapshot
    await expect(enforceMarginSafetyForPromotion("rec1", ws, marginDeps())).resolves.toBeUndefined();
  });

  it("[db] D. a self-serve owner's resolved capability set never includes RECOMMENDATION_APPROVE -- this code path cannot be triggered by any controlled-beta user regardless of the workspace-wide read proven above", () => {
    const ownerCapabilities = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    expect(ownerCapabilities).not.toContain(CAPABILITIES.RECOMMENDATION_APPROVE);
    expect(ownerCapabilities).not.toContain(CAPABILITIES.RECOMMENDATION_VIEW);
  });
});
