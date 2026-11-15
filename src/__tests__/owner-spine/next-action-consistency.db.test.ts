/**
 * Hostile-audit P2 "next-action consistency": for one body of finance evidence the first read, the Money page and Home must
 * put the SAME action first. There is one policy (the canonical owner-decision comparator); the other surfaces only filter it.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] next-action consistency", () => {
  const scenarios: Record<string, Record<string, unknown>> = {
    receivablesHeavy: { revenue: 80000, fixedCosts: 20000, variableCosts: 35000, receivables: 60000, cashOnHand: 5000 },
    leakyDiscounts: { revenue: 80000, fixedCosts: 20000, variableCosts: 35000, discountAmount: 4000, cashOnHand: 5000 },
    thinCash: { revenue: 50000, fixedCosts: 30000, variableCosts: 25000, cashOnHand: 1000 },
  };
  for (const [name, figures] of Object.entries(scenarios)) {
    it(`[db] ${name}`, async () => {
      const actorId = randomUUID(); const workspaceId = randomUUID();
      await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "nac", slug: `nac-${workspaceId.substring(0, 8)}` } });
      await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
      const { createBusiness } = await import("@/services/founder-recovery/business.service");
      const b = await createBusiness({ name: "NAC", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actorId, workspaceId);
      const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
      const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
      const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");
      const { getFinanceDashboard } = await import("@/services/owner-finance/dashboard.service");
      const { getOwnerHome } = await import("@/services/owner-home/home.service");
      const snap = await createFinancialSnapshot(b.id, { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", evidenceQuality: "ACTUAL", ...figures } as never, actorId, workspaceId);
      await runFinanceDiagnosis(b.id, snap.id, actorId, workspaceId);
      const fr = await getFirstMoneyRead(workspaceId, b.id);
      const dash = await getFinanceDashboard(workspaceId, b.id);
      const home = await getOwnerHome(workspaceId, b.id);
      const d = home.currentOwnerDecision;
      // ONE prioritisation policy: the first read, Money's local step and Home's elected target are the same action for the same evidence.
      const homeTitle = d?.primaryTarget?.title ?? null;
      expect(fr.presentedAction?.title).toBeTruthy();
      expect(dash.recommendedNextAction?.title).toBe(fr.presentedAction?.title);
      expect(homeTitle).toBe(fr.presentedAction?.title);
    });
  }
});
