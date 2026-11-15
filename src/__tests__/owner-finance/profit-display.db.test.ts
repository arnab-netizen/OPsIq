/** Hostile-audit D4A: the owner financial surfaces show profit and margin derived from a complete snapshot, through the real services. */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] profit and margin on the owner surfaces", () => {
  async function diagnosed(figures: Record<string, unknown>) {
    const actorId = randomUUID();
    const workspaceId = randomUUID();
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "pd", slug: `pd-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    const { createBusiness } = await import("@/services/founder-recovery/business.service");
    const b = await createBusiness({ name: "PD QA", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actorId, workspaceId);
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
    const snap = await createFinancialSnapshot(b.id, { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", evidenceQuality: "ACTUAL", ...figures } as never, actorId, workspaceId);
    await runFinanceDiagnosis(b.id, snap.id, actorId, workspaceId);
    return { workspaceId, businessId: b.id };
  }

  it("[db] 80,000 / 20,000 fixed / 35,000 variable → first read and Money dashboard both carry profit 25,000 and margin 31.25%", async () => {
    const t = await diagnosed({ revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");
    const { getFinanceDashboard } = await import("@/services/owner-finance/dashboard.service");
    const read = (await getFirstMoneyRead(t.workspaceId, t.businessId)).read;
    expect(read.profitPosition).toMatchObject({ status: "KNOWN", netProfit: 25000, marginPct: 31.25, headline: "Net profit of INR 25,000" });
    const dash = await getFinanceDashboard(t.workspaceId, t.businessId);
    expect(dash.profitPosition).toMatchObject({ status: "KNOWN", netProfit: 25000, marginPct: 31.25 });
  });

  it("[db] a cost half UNKNOWN → profit UNKNOWN with the reason on both surfaces (never a partial profit)", async () => {
    const t = await diagnosed({ revenue: 80000, fixedCosts: 20000 });
    const { getFirstMoneyRead } = await import("@/services/owner-first-run/first-run.service");
    const { getFinanceDashboard } = await import("@/services/owner-finance/dashboard.service");
    const read = (await getFirstMoneyRead(t.workspaceId, t.businessId)).read;
    expect(read.profitPosition?.status).toBe("UNKNOWN");
    const dash = await getFinanceDashboard(t.workspaceId, t.businessId);
    expect(dash.profitPosition?.status).toBe("UNKNOWN");
    expect((dash.profitPosition as { reason: string }).reason).toMatch(/variable costs/);
  });
});
